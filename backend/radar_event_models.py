"""
Radar Event Models and Processing Logic
Handles transformation of raw Vayyar MQTT payloads into normalized platform events
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
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


class SensitiveFallEventStatus(str, Enum):
    """Sensitive Fall event lifecycle statuses from Vayyar (type 8)"""
    FALL_SUSPECTED = "fall_suspected"
    CALLING = "calling"
    FINISHED = "finished"
    FALL_EXIT = "fall_exit"


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
    """Payload structure from Vayyar radar (presence/generic events)"""
    presenceDetected: bool = False
    presenceRegionMap: Dict[str, int] = Field(default_factory=dict)
    presenceTargetType: int = 0
    roomPresenceIndication: int = 0
    timestamp: int = 0  # milliseconds epoch
    trackerTargets: List[Dict[str, Any]] = Field(default_factory=list)


class FallEventPayload(BaseModel):
    """Payload structure for Vayyar Fall Events (type=5)"""
    timestamp: int = 0  # Epoch ms - beginning of fall event (same for all messages in same fall flow)
    statusUpdateTimestamp: int = 0  # Epoch ms - when this message was sent
    status: str = "fall_detected"  # FallEventStatus enum value
    type: str = "fall"  # Always "fall"
    deviceId: str = ""
    endTimestamp: int = 0  # Epoch ms - when event ended
    isSimulated: bool = False
    exitReason: str = ""
    isLearning: Optional[bool] = None
    extra: str = ""  # X, Y, Z location of trigger target
    isSilent: Optional[bool] = None
    fallLocX_cm: Optional[float] = None
    fallLocY_cm: Optional[float] = None
    fallLocZ_cm: Optional[float] = None
    tarHeightEst: Optional[float] = None
    idOfTrigger: Optional[str] = None
    fallingMitigatorPrediction: Optional[float] = None

    @field_validator("exitReason", "idOfTrigger", mode="before")
    @classmethod
    def coerce_to_str(cls, v):
        if v is None:
            return v
        return str(v)


class SensitiveFallEventPayload(BaseModel):
    """Payload structure for Vayyar Sensitive Fall Events (type=8)"""
    timestamp: int = 0  # Epoch ms
    status: SensitiveFallEventStatus = SensitiveFallEventStatus.FALL_SUSPECTED
    isSimulated: bool = False
    isLearning: bool = False
    isSilent: bool = False
    fallLocX_cm: float = 0
    fallLocY_cm: float = 0
    fallLocZ_cm: float = 0
    confidenceLevel: float = 0
    suspectedEventsCounter: int = 0
    lastEventConfidence: float = 0


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


def normalize_fall_event(
    device_id: str,
    fall_payload: FallEventPayload,
    sensor_id: Optional[str] = None,
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transform raw Vayyar Fall Event payload into a normalized event document.
    Fall events with the same `timestamp` are part of the same fall flow.
    """
    now = datetime.now(timezone.utc).isoformat()
    occurred_at = epoch_ms_to_iso(fall_payload.timestamp)
    status_update_at = epoch_ms_to_iso(fall_payload.statusUpdateTimestamp)
    end_at = epoch_ms_to_iso(fall_payload.endTimestamp) if fall_payload.endTimestamp else None

    # Determine severity based on fall status
    fall_status = fall_payload.status
    if fall_status in ("fall_detected", "fall_confirmed", "calling", "on_call"):
        severity = EventSeverity.HIGH.value
    elif fall_status in ("fall_exit", "canceled"):
        severity = EventSeverity.MED.value
    else:
        severity = EventSeverity.HIGH.value

    return {
        "id": str(uuid.uuid4()),
        "device_id": device_id,
        "sensor_id": sensor_id,
        "tenant_id": tenant_id,
        "site_id": site_id,
        "zone_id": zone_id,
        "type": RadarEventType.FALL.value,
        "severity": severity,
        "status": EventStatus.NEW.value,
        "confidence": 1.0,
        "timestamp": now,
        "occurred_at": occurred_at,
        "raw_timestamp": fall_payload.timestamp,
        # Fall-specific fields
        "fall_status": fall_status,
        "fall_status_history": [{
            "status": fall_status,
            "timestamp": status_update_at,
            "raw_timestamp": fall_payload.statusUpdateTimestamp
        }],
        "fall_loc_x_cm": fall_payload.fallLocX_cm,
        "fall_loc_y_cm": fall_payload.fallLocY_cm,
        "fall_loc_z_cm": fall_payload.fallLocZ_cm,
        "tar_height_est": fall_payload.tarHeightEst,
        "is_simulated": fall_payload.isSimulated,
        "is_learning": fall_payload.isLearning,
        "is_silent": fall_payload.isSilent,
        "exit_reason": fall_payload.exitReason,
        "id_of_trigger": fall_payload.idOfTrigger,
        "end_timestamp": fall_payload.endTimestamp,
        "end_at": end_at,
        "extra": fall_payload.extra,
        # Presence fields (not applicable for fall events, set defaults)
        "presence_status": PresenceStatus.DETECTED.value,
        "presence_detected": True,
        "active_regions": [],
        "target_count": 0,
        "raw_payload": {
            "type": 5,
            "payload": fall_payload.model_dump()
        }
    }


def normalize_sensitive_fall_event(
    device_id: str,
    payload: SensitiveFallEventPayload,
    sensor_id: Optional[str] = None,
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transform raw Vayyar Sensitive Fall Event (type=8) payload into a normalized event document.
    Sensitive fall events with the same `timestamp` are part of the same flow.
    Lifecycle: fall_suspected → calling → finished / fall_exit
    """
    now = datetime.now(timezone.utc).isoformat()
    occurred_at = epoch_ms_to_iso(payload.timestamp)

    fall_status = payload.status
    if fall_status == SensitiveFallEventStatus.CALLING:
        # Calling = chute confirmée → alerte réelle
        severity = EventSeverity.HIGH.value
    elif fall_status == SensitiveFallEventStatus.FALL_SUSPECTED:
        # Chute suspectée → affichage seulement, pas encore confirmée
        severity = EventSeverity.LOW.value
    else:
        # fall_exit / finished → incident clos
        severity = EventSeverity.MED.value

    return {
        "id": str(uuid.uuid4()),
        "device_id": device_id,
        "sensor_id": sensor_id,
        "tenant_id": tenant_id,
        "site_id": site_id,
        "zone_id": zone_id,
        "type": RadarEventType.SENSITIVE_FALL.value,
        "severity": severity,
        "status": EventStatus.NEW.value,
        "timestamp": now,
        "occurred_at": occurred_at,
        "raw_timestamp": payload.timestamp,
        # Sensitive fall-specific fields
        "fall_status": fall_status,
        "fall_status_history": [{
            "status": fall_status,
            "timestamp": now,
            "raw_timestamp": payload.timestamp
        }],
        "fall_loc_x_cm": payload.fallLocX_cm,
        "fall_loc_y_cm": payload.fallLocY_cm,
        "fall_loc_z_cm": payload.fallLocZ_cm,
        "confidence_level": payload.confidenceLevel,
        "suspected_events_counter": payload.suspectedEventsCounter,
        "last_event_confidence": payload.lastEventConfidence,
        "is_simulated": payload.isSimulated,
        "is_learning": payload.isLearning,
        "is_silent": payload.isSilent,
        # Presence fields (set defaults)
        "presence_status": PresenceStatus.DETECTED.value,
        "presence_detected": True,
        "active_regions": [],
        "target_count": 0,
        "raw_payload": {
            "type": 8,
            "payload": payload.model_dump()
        }
    }
