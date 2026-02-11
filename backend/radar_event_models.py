"""
Radar Event Models and Processing Logic
Handles transformation of raw Vayyar MQTT payloads into normalized platform events
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid


# ==================== ENUMS ====================

class RadarEventType(str, Enum):
    """Radar event type mapping from Vayyar type codes"""
    PRESENCE = "PRESENCE"           # Code 4 - Person detected in room
    FALL = "FALL"                   # Code 5 - Standard fall detected
    SENSITIVE_FALL = "SENSITIVE_FALL"  # Code 8 - Suspected fall (confidence-based)
    BED_EXIT = "BED_EXIT"           # Code 10 - Person exiting bed
    INACTIVITY = "INACTIVITY"       # Legacy support
    PRE_FALL = "PRE_FALL"           # Legacy support
    UNKNOWN = "UNKNOWN"
    
    @classmethod
    def from_code(cls, code: int) -> "RadarEventType":
        mapping = {
            4: cls.PRESENCE,
            5: cls.FALL,
            8: cls.SENSITIVE_FALL,
            10: cls.BED_EXIT,
        }
        return mapping.get(code, cls.UNKNOWN)


class FallEventStatus(str, Enum):
    """Fall event lifecycle statuses from Vayyar"""
    FALL_DETECTED = "fall_detected"
    FALL_CONFIRMED = "fall_confirmed"
    CALLING = "calling"
    ON_CALL = "on_call"
    FINISHED = "finished"
    FALL_EXIT = "fall_exit"
    CANCELED = "canceled"


class PresenceStatus(str, Enum):
    """Presence detection status"""
    DETECTED = "DETECTED"
    NOT_DETECTED = "NOT_DETECTED"


class EventSeverity(str, Enum):
    """Event severity levels"""
    LOW = "LOW"
    MED = "MED"
    HIGH = "HIGH"


class EventStatus(str, Enum):
    """Event workflow status"""
    NEW = "NEW"
    ACK = "ACK"
    RESOLVED = "RESOLVED"
    FALSE_ALARM = "FALSE_ALARM"


# ==================== REQUEST MODELS ====================

class RadarEventPayload(BaseModel):
    """Payload structure from Vayyar radar"""
    presenceDetected: bool = False
    presenceRegionMap: Dict[str, int] = Field(default_factory=dict)
    presenceTargetType: int = 0
    roomPresenceIndication: int = 0
    timestamp: int = 0  # milliseconds epoch
    trackerTargets: List[Dict[str, Any]] = Field(default_factory=list)


class RadarEventRequest(BaseModel):
    """Request body for POST /api/events/radar"""
    payload: RadarEventPayload
    type: int  # Vayyar event type code
    deviceId: str  # Device ID for sensor lookup


# ==================== RESPONSE MODELS ====================

class RadarEventResponse(BaseModel):
    """Normalized radar event response"""
    id: str
    deviceId: str
    sensorId: Optional[str] = None
    siteId: Optional[str] = None
    zoneId: Optional[str] = None
    tenantId: Optional[str] = None
    
    # Normalized fields
    eventType: RadarEventType
    presenceStatus: PresenceStatus
    presenceDetected: bool
    activeRegions: List[int]
    targetCount: int
    
    # Timestamps
    occurredAt: str  # ISO UTC string
    rawTimestamp: int  # Original epoch ms
    createdAt: str
    
    # Metadata
    severity: EventSeverity = EventSeverity.LOW
    status: EventStatus = EventStatus.NEW
    
    # Raw payload for audit
    rawPayloadJson: Dict[str, Any]


class RadarEventListItem(BaseModel):
    """Compact event for list views"""
    id: str
    deviceId: str
    sensorName: Optional[str] = None
    eventType: RadarEventType
    presenceStatus: PresenceStatus
    activeRegions: List[int]
    targetCount: int
    occurredAt: str
    severity: EventSeverity
    status: EventStatus


# ==================== PROCESSING FUNCTIONS ====================

def extract_active_regions(presence_region_map: Dict[str, int]) -> List[int]:
    """Extract list of active region IDs from presenceRegionMap"""
    active = []
    for region_id, value in presence_region_map.items():
        try:
            if int(value) == 1:
                active.append(int(region_id))
        except (ValueError, TypeError):
            continue
    return sorted(active)


def epoch_ms_to_iso(epoch_ms: int) -> str:
    """Convert epoch milliseconds to ISO UTC string"""
    if not epoch_ms:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
        return dt.isoformat()
    except (ValueError, OSError):
        return datetime.now(timezone.utc).isoformat()


def determine_severity_from_event(event_type: RadarEventType, payload: RadarEventPayload) -> EventSeverity:
    """Determine event severity based on type and payload
    
    Severity Mapping:
    - FALL, SENSITIVE_FALL → HIGH (immediate alert needed)
    - BED_EXIT → MED (monitor situation)
    - PRESENCE, others → LOW (normal monitoring)
    """
    # FALL and SENSITIVE_FALL are always HIGH severity
    if event_type in [RadarEventType.FALL, RadarEventType.SENSITIVE_FALL]:
        return EventSeverity.HIGH
    
    # BED_EXIT is MED severity
    if event_type == RadarEventType.BED_EXIT:
        return EventSeverity.MED
    
    # PRE_FALL is MED (legacy support)
    if event_type == RadarEventType.PRE_FALL:
        return EventSeverity.MED
    
    # INACTIVITY depends on duration (not available in this payload, default to MED)
    if event_type == RadarEventType.INACTIVITY:
        return EventSeverity.MED
    
    # PRESENCE and others are LOW by default
    return EventSeverity.LOW


def normalize_radar_event(
    request: RadarEventRequest,
    sensor_id: Optional[str] = None,
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> RadarEventResponse:
    """
    Transform raw Vayyar payload into normalized platform event
    """
    payload = request.payload
    
    # 1. Map event type
    event_type = RadarEventType.from_code(request.type)
    
    # 2. Determine presence status
    presence_status = (
        PresenceStatus.DETECTED if payload.presenceDetected 
        else PresenceStatus.NOT_DETECTED
    )
    
    # 3. Extract active regions
    active_regions = extract_active_regions(payload.presenceRegionMap)
    
    # 4. Count tracker targets
    target_count = len(payload.trackerTargets)
    
    # 5. Convert timestamp
    occurred_at = epoch_ms_to_iso(payload.timestamp)
    
    # 6. Determine severity
    severity = determine_severity_from_event(event_type, payload)
    
    # 7. Build response
    now = datetime.now(timezone.utc).isoformat()
    
    return RadarEventResponse(
        id=str(uuid.uuid4()),
        deviceId=request.deviceId,
        sensorId=sensor_id,
        siteId=site_id,
        zoneId=zone_id,
        tenantId=tenant_id,
        eventType=event_type,
        presenceStatus=presence_status,
        presenceDetected=payload.presenceDetected,
        activeRegions=active_regions,
        targetCount=target_count,
        occurredAt=occurred_at,
        rawTimestamp=payload.timestamp,
        createdAt=now,
        severity=severity,
        status=EventStatus.NEW,
        rawPayloadJson={
            "payload": payload.model_dump(),
            "type": request.type
        }
    )


def format_active_regions_display(active_regions: List[int]) -> str:
    """Format active regions for display"""
    if not active_regions:
        return "Aucune zone active"
    return ", ".join(str(r) for r in active_regions)


def format_target_count_display(target_count: int) -> str:
    """Format target count for display"""
    if target_count == 0:
        return "Aucune cible détectée"
    return f"{target_count} cible{'s' if target_count > 1 else ''}"
