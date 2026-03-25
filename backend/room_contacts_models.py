"""
Room Emergency Contacts Models
Pydantic models for room-level emergency contacts and cascade alert tracking.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict


# ==================== ENUMS ====================

ContactRelationship = Literal["FAMILY", "DOCTOR", "NURSE", "CAREGIVER", "OTHER"]
NotificationChannel = Literal["SMS", "WHATSAPP", "TELEGRAM", "EMAIL"]
CascadeStatus = Literal["PENDING", "NOTIFYING", "ACKNOWLEDGED", "ESCALATED", "EXHAUSTED", "CANCELLED"]


# ==================== ROOM CONTACTS ====================

class RoomContactBase(BaseModel):
    room_id: str
    building_id: str
    floor_id: str
    client_id: str
    full_name: str
    relationship: ContactRelationship = "FAMILY"
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    preferred_channels: List[NotificationChannel] = ["SMS"]
    priority_order: int = 1
    escalation_delay_minutes: int = 3
    is_active: bool = True
    notes: Optional[str] = None


class RoomContactCreate(BaseModel):
    full_name: str
    relationship: ContactRelationship = "FAMILY"
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    preferred_channels: List[NotificationChannel] = ["SMS"]
    priority_order: int = 1
    escalation_delay_minutes: int = 3
    notes: Optional[str] = None


class RoomContactUpdate(BaseModel):
    full_name: Optional[str] = None
    relationship: Optional[ContactRelationship] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    preferred_channels: Optional[List[NotificationChannel]] = None
    priority_order: Optional[int] = None
    escalation_delay_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RoomContact(RoomContactBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== CASCADE ALERTS ====================

class ContactNotification(BaseModel):
    contact_id: str
    contact_name: str
    channel: NotificationChannel
    sent_at: datetime
    status: str = "sent"  # sent, failed, delivered


class CascadeAcknowledgment(BaseModel):
    contact_id: str
    contact_name: str
    channel: str
    acknowledged_at: datetime


class CascadeAlert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str
    room_id: str
    client_id: str
    tenant_id: str
    status: CascadeStatus = "PENDING"
    current_priority_level: int = 1
    contacts_notified: List[ContactNotification] = []
    acknowledged_by: Optional[CascadeAcknowledgment] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    next_escalation_at: Optional[datetime] = None


# ==================== CHANNEL CONFIG ====================

class TwilioConfig(BaseModel):
    account_sid: str = ""
    auth_token: str = ""
    from_number: str = ""
    whatsapp_from_number: str = ""
    enabled: bool = False


class TelegramConfig(BaseModel):
    bot_token: str = ""
    enabled: bool = False
