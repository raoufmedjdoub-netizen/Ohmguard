"""
AI Sensor Models and Service
Models for Seedoo AI camera sensors
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class AIWarningType(str, Enum):
    """Types of AI warnings/detections"""
    FALL_DETECTED = "Fall_Detected"
    VIOLENCE_DETECTED = "Violence_Detected"
    UNATTENDED_BAG = "Unattended_Bag"
    OPEN_DOOR = "Open_Door"
    UNKNOWN = "Unknown"


class AISensorStatus(str, Enum):
    """AI Sensor connection status"""
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    WARNING = "WARNING"
    ERROR = "ERROR"


# Pydantic models for AI Sensor
class AISensorBase(BaseModel):
    """Base model for AI Sensor"""
    channel: str  # e.g., "easy4ipcloud.com-3L04A73PAP81FAB_channel_10"
    channel_name: str  # e.g., "G CLR 2EME CAFET"
    name: Optional[str] = None  # Custom name
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None


class AISensorCreate(AISensorBase):
    """Model for creating an AI Sensor"""
    pass


class AISensorUpdate(BaseModel):
    """Model for updating an AI Sensor"""
    name: Optional[str] = None
    channel_name: Optional[str] = None
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    confidence_threshold: Optional[float] = None
    confidence_filter_enabled: Optional[bool] = None
    enabled_warnings: Optional[List[str]] = None


class AISensorInDB(AISensorBase):
    """AI Sensor as stored in database"""
    id: str
    status: AISensorStatus = AISensorStatus.OFFLINE
    confidence_threshold: float = 0.5  # Default threshold
    confidence_filter_enabled: bool = False  # Enable/disable confidence filtering
    enabled_warnings: List[str] = []  # Empty = all warnings enabled
    last_seen: Optional[str] = None
    last_event_id: Optional[str] = None
    event_count: int = 0
    created_at: str
    updated_at: str


class AISensorConfig(BaseModel):
    """Configuration for AI Sensor alerts"""
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0)
    enabled_warnings: List[str] = []  # Empty list = all warnings enabled
    notification_enabled: bool = True
    video_retention_days: int = 7


# AI Event models
class AIEventBase(BaseModel):
    """Base model for AI Event"""
    warning_id: int
    channel: str
    channel_name: Optional[str] = None
    model_id: Optional[int] = None
    model_name: Optional[str] = None
    timestamp: str
    warning_type: str
    warning_text: Optional[str] = None
    confidence: float
    is_warning: bool = False
    video_paths: List[str] = []
    video_url: Optional[str] = None
    analysis_source: Optional[str] = None


class AIEventCreate(AIEventBase):
    """Model for creating an AI Event"""
    pass


class AIEventInDB(AIEventBase):
    """AI Event as stored in database"""
    id: str
    sensor_id: Optional[str] = None  # Link to AI sensor
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    location_path: Optional[str] = None
    status: str = "NEW"  # NEW, ACKNOWLEDGED, RESOLVED, FALSE_ALARM
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[str] = None
    created_at: str


# Response models
class AISensorResponse(AISensorInDB):
    """Response model for AI Sensor with location info"""
    client_name: Optional[str] = None
    building_name: Optional[str] = None
    floor_name: Optional[str] = None
    room_name: Optional[str] = None
    location_path: Optional[str] = None


class AIEventResponse(AIEventInDB):
    """Response model for AI Event with enriched data"""
    sensor_name: Optional[str] = None
    severity: str = "MEDIUM"  # Calculated based on warning_type
    
    @property
    def calculated_severity(self) -> str:
        """Calculate severity based on warning type"""
        high_severity = ["Fall_Detected", "Violence_Detected"]
        medium_severity = ["Unattended_Bag", "Open_Door"]
        
        if self.warning_type in high_severity:
            return "HIGH"
        elif self.warning_type in medium_severity:
            return "MEDIUM"
        return "LOW"
