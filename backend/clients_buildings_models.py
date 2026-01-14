"""
Clients & Buildings Models
Multi-tenant hierarchical structure for OhmGuard platform
Hierarchy: Client → Buildings → Floors → Zones/Rooms → RoomSpaces
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid


# ==================== ENUMS ====================

ClientStatus = Literal["ACTIVE", "SUSPENDED", "INACTIVE"]
ZoneType = Literal["CORRIDOR", "COMMON", "LOBBY", "STAIR", "ELEVATOR", "OUTDOOR", "OTHER"]
RoomType = Literal["SINGLE", "DOUBLE", "SUITE", "STUDIO", "OTHER"]
SpaceType = Literal["BEDROOM", "BATHROOM", "KITCHENETTE", "LIVING", "BALCONY", "OTHER"]
ClientRole = Literal["CLIENT_ADMIN", "SUPERVISOR", "OPERATOR", "VIEWER"]


# ==================== CLIENT MODELS ====================

class AddressJson(BaseModel):
    """Structured address"""
    street: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "France"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ClientBase(BaseModel):
    """Client (tenant) - top level entity"""
    name: str
    legal_name: Optional[str] = None
    siret: Optional[str] = None
    address: Optional[AddressJson] = None
    timezone: str = "Europe/Paris"
    retention_days: int = 365
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    siret: Optional[str] = None
    address: Optional[AddressJson] = None
    timezone: Optional[str] = None
    retention_days: Optional[int] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[ClientStatus] = None


class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: ClientStatus = "ACTIVE"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Stats (computed)
    buildings_count: int = 0
    radars_count: int = 0
    active_radars_count: int = 0


# ==================== BUILDING MODELS ====================

class BuildingBase(BaseModel):
    """Building belonging to a client"""
    name: str
    client_id: str
    address: Optional[AddressJson] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[AddressJson] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None


class Building(BuildingBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Stats
    floors_count: int = 0
    rooms_count: int = 0
    radars_count: int = 0


# ==================== FLOOR MODELS ====================

class FloorBase(BaseModel):
    """Floor within a building"""
    name: str  # e.g., "RDC", "1er étage", "Sous-sol"
    index: int = 0  # -1 for basement, 0 for ground, 1+ for upper
    building_id: str
    client_id: str  # Denormalized for fast filtering
    plan_url: Optional[str] = None  # Floor plan image
    notes: Optional[str] = None


class FloorCreate(BaseModel):
    name: str
    index: int = 0
    plan_url: Optional[str] = None
    notes: Optional[str] = None


class FloorUpdate(BaseModel):
    name: Optional[str] = None
    index: Optional[int] = None
    plan_url: Optional[str] = None
    notes: Optional[str] = None


class Floor(FloorBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Stats
    rooms_count: int = 0
    zones_count: int = 0
    radars_count: int = 0


# ==================== ZONE MODELS ====================

class ZoneBaseNew(BaseModel):
    """Zone - corridor, common area, etc."""
    name: str
    zone_type: ZoneType = "OTHER"
    building_id: str
    floor_id: Optional[str] = None  # Can be building-level (e.g., lobby spanning floors)
    client_id: str
    notes: Optional[str] = None


class ZoneCreateNew(BaseModel):
    name: str
    zone_type: ZoneType = "OTHER"
    floor_id: Optional[str] = None
    notes: Optional[str] = None


class ZoneUpdateNew(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[ZoneType] = None
    floor_id: Optional[str] = None
    notes: Optional[str] = None


class ZoneNew(ZoneBaseNew):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Stats
    radars_count: int = 0


# ==================== ROOM MODELS ====================

class RoomBase(BaseModel):
    """Room - individual unit (chambre)"""
    room_number: str  # e.g., "101", "A-201"
    name: Optional[str] = None  # e.g., "Chambre Dupont"
    room_type: RoomType = "SINGLE"
    capacity: int = 1
    building_id: str
    floor_id: str
    client_id: str
    occupant_name: Optional[str] = None  # Optional resident name
    occupant_info: Optional[str] = None  # Additional info
    notes: Optional[str] = None


class RoomCreate(BaseModel):
    room_number: str
    name: Optional[str] = None
    room_type: RoomType = "SINGLE"
    capacity: int = 1
    occupant_name: Optional[str] = None
    occupant_info: Optional[str] = None
    notes: Optional[str] = None
    # Auto-create spaces
    create_bathroom: bool = False
    create_kitchenette: bool = False


class RoomUpdate(BaseModel):
    room_number: Optional[str] = None
    name: Optional[str] = None
    room_type: Optional[RoomType] = None
    capacity: Optional[int] = None
    occupant_name: Optional[str] = None
    occupant_info: Optional[str] = None
    notes: Optional[str] = None


class Room(RoomBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Stats
    spaces_count: int = 0
    radars_count: int = 0


# ==================== ROOM SPACE MODELS ====================

class RoomSpaceBase(BaseModel):
    """Sub-space within a room (bedroom, bathroom, kitchenette, etc.)"""
    name: Optional[str] = None  # e.g., "Salle de bain", custom name for OTHER
    space_type: SpaceType = "BEDROOM"
    room_id: str
    building_id: str
    floor_id: str
    client_id: str
    is_active: bool = True
    notes: Optional[str] = None


class RoomSpaceCreate(BaseModel):
    name: Optional[str] = None
    space_type: SpaceType = "OTHER"
    notes: Optional[str] = None


class RoomSpaceUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RoomSpace(RoomSpaceBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Radar info
    has_radar: bool = False
    radar_id: Optional[str] = None


# ==================== RADAR ASSIGNMENT MODELS ====================

class RadarLocation(BaseModel):
    """Location information for a radar"""
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    building_id: Optional[str] = None
    building_name: Optional[str] = None
    floor_id: Optional[str] = None
    floor_name: Optional[str] = None
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    room_space_id: Optional[str] = None
    space_type: Optional[str] = None
    space_name: Optional[str] = None
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    
    def get_path(self) -> str:
        """Get human-readable location path"""
        parts = []
        if self.client_name:
            parts.append(self.client_name)
        if self.building_name:
            parts.append(self.building_name)
        if self.floor_name:
            parts.append(self.floor_name)
        if self.zone_name:
            parts.append(f"Zone: {self.zone_name}")
        elif self.room_number:
            parts.append(f"Ch. {self.room_number}")
            if self.space_name or self.space_type:
                parts.append(self.space_name or self.space_type)
        return " > ".join(parts) if parts else "Non assigné"


class RadarAssignRequest(BaseModel):
    """Request to assign a radar to a location"""
    # Only one of these should be set
    room_space_id: Optional[str] = None
    room_id: Optional[str] = None
    zone_id: Optional[str] = None
    reason: Optional[str] = None


class RadarAssignmentHistory(BaseModel):
    """History of radar assignments"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    radar_id: str
    client_id: str
    assigned_by_user_id: str
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    unassigned_at: Optional[datetime] = None
    from_location: Optional[RadarLocation] = None
    to_location: RadarLocation
    reason: Optional[str] = None


# ==================== CLIENT USER MODELS ====================

class ClientUserBase(BaseModel):
    """User role within a specific client"""
    user_id: str
    client_id: str
    role: ClientRole = "VIEWER"
    is_active: bool = True


class ClientUserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: ClientRole = "VIEWER"


class ClientUserUpdate(BaseModel):
    role: Optional[ClientRole] = None
    is_active: Optional[bool] = None


class ClientUser(ClientUserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Joined fields
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None


# ==================== RESPONSE MODELS ====================

class LocationPath(BaseModel):
    """Full location path for display"""
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    building_id: Optional[str] = None
    building_name: Optional[str] = None
    floor_id: Optional[str] = None
    floor_name: Optional[str] = None
    floor_index: Optional[int] = None
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    room_name: Optional[str] = None
    space_id: Optional[str] = None
    space_type: Optional[str] = None
    space_name: Optional[str] = None
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    zone_type: Optional[str] = None
    full_path: str = ""


class TreeNode(BaseModel):
    """Generic tree node for hierarchical display"""
    id: str
    name: str
    type: str  # "client", "building", "floor", "zone", "room", "space"
    parent_id: Optional[str] = None
    children: List["TreeNode"] = []
    metadata: dict = {}
    radars_count: int = 0
    has_issues: bool = False


TreeNode.model_rebuild()  # For self-referential model


# ==================== HELPER FUNCTIONS ====================

def get_space_type_label(space_type: str, lang: str = "fr") -> str:
    """Get human-readable label for space type"""
    labels = {
        "fr": {
            "BEDROOM": "Chambre à coucher",
            "BATHROOM": "Salle de bain",
            "KITCHENETTE": "Kitchenette",
            "LIVING": "Salon",
            "BALCONY": "Balcon",
            "OTHER": "Autre"
        },
        "en": {
            "BEDROOM": "Bedroom",
            "BATHROOM": "Bathroom",
            "KITCHENETTE": "Kitchenette",
            "LIVING": "Living room",
            "BALCONY": "Balcony",
            "OTHER": "Other"
        }
    }
    return labels.get(lang, labels["fr"]).get(space_type, space_type)


def get_zone_type_label(zone_type: str, lang: str = "fr") -> str:
    """Get human-readable label for zone type"""
    labels = {
        "fr": {
            "CORRIDOR": "Couloir",
            "COMMON": "Espace commun",
            "LOBBY": "Hall d'entrée",
            "STAIR": "Escalier",
            "ELEVATOR": "Ascenseur",
            "OUTDOOR": "Extérieur",
            "OTHER": "Autre"
        },
        "en": {
            "CORRIDOR": "Corridor",
            "COMMON": "Common area",
            "LOBBY": "Lobby",
            "STAIR": "Staircase",
            "ELEVATOR": "Elevator",
            "OUTDOOR": "Outdoor",
            "OTHER": "Other"
        }
    }
    return labels.get(lang, labels["fr"]).get(zone_type, zone_type)


def get_room_type_label(room_type: str, lang: str = "fr") -> str:
    """Get human-readable label for room type"""
    labels = {
        "fr": {
            "SINGLE": "Chambre simple",
            "DOUBLE": "Chambre double",
            "SUITE": "Suite",
            "STUDIO": "Studio",
            "OTHER": "Autre"
        },
        "en": {
            "SINGLE": "Single room",
            "DOUBLE": "Double room",
            "SUITE": "Suite",
            "STUDIO": "Studio",
            "OTHER": "Other"
        }
    }
    return labels.get(lang, labels["fr"]).get(room_type, room_type)
