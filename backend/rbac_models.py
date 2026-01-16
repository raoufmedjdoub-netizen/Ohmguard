"""
RBAC Models - Role-Based Access Control with Location Scopes
============================================================

This module defines the data models for:
- Permissions catalog
- Role-based default permissions
- User permission overrides
- Location-based scopes (Building > Floor > Zone > Room > RoomSpace)

Hierarchy Rules:
- If user has BUILDING scope with MANAGE, they inherit MANAGE on all children
- DENY overrides always take precedence over ALLOW
- Multiple overlapping scopes use the most permissive (MANAGE > VIEW)
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone
from enum import Enum
import uuid


# =============================================================================
# ENUMS
# =============================================================================

class ClientRole(str, Enum):
    """Roles within a client/tenant"""
    CLIENT_ADMIN = "CLIENT_ADMIN"      # Full access to client
    SUPERVISOR = "SUPERVISOR"          # Manage events + devices in scope
    OPERATOR = "OPERATOR"              # ACK/Resolve events in scope
    VIEWER = "VIEWER"                  # Read-only access in scope


class PermissionEffect(str, Enum):
    """Effect of a permission override"""
    ALLOW = "ALLOW"
    DENY = "DENY"


class ScopeType(str, Enum):
    """Type of location scope"""
    CLIENT = "CLIENT"          # All buildings under client
    BUILDING = "BUILDING"
    FLOOR = "FLOOR"
    ZONE = "ZONE"
    ROOM = "ROOM"
    ROOM_SPACE = "ROOM_SPACE"


class AccessLevel(str, Enum):
    """Access level for a scope"""
    VIEW = "VIEW"      # Can see data
    MANAGE = "MANAGE"  # Can modify data


class PermissionGroup(str, Enum):
    """Groups for organizing permissions"""
    PAGES = "Pages"
    EVENTS = "Events"
    DEVICES = "Devices"
    ADMIN = "Admin"
    SYSTEM = "System"


# =============================================================================
# PERMISSION CATALOG
# =============================================================================

class Permission(BaseModel):
    """A single permission in the catalog"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str                                    # Unique key, e.g., "PAGE_LIVE_VIEW"
    label: str                                  # Human-readable label
    description: Optional[str] = None
    group: PermissionGroup
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Default permissions catalog
PERMISSIONS_CATALOG: List[dict] = [
    # Pages
    {"key": "PAGE_DASHBOARD_VIEW", "label": "Voir le tableau de bord", "group": "Pages", "description": "Accès à la page d'accueil"},
    {"key": "PAGE_LIVE_VIEW", "label": "Voir la page Live", "group": "Pages", "description": "Accès au mur d'événements en temps réel"},
    {"key": "PAGE_HISTORY_VIEW", "label": "Voir l'historique", "group": "Pages", "description": "Accès à l'historique des événements"},
    {"key": "PAGE_STATISTICS_VIEW", "label": "Voir les statistiques", "group": "Pages", "description": "Accès aux tableaux de bord statistiques"},
    {"key": "PAGE_DEVICES_VIEW", "label": "Voir les radars", "group": "Pages", "description": "Accès à la liste des radars"},
    {"key": "PAGE_DEVICE_CONFIG_VIEW", "label": "Voir la config radar", "group": "Pages", "description": "Accès à la configuration d'un radar"},
    {"key": "PAGE_CLIENTS_VIEW", "label": "Voir Clients & Bâtiments", "group": "Pages", "description": "Accès à la gestion des clients et bâtiments"},
    {"key": "PAGE_RULES_VIEW", "label": "Voir les règles d'alerte", "group": "Pages", "description": "Accès aux règles d'alerte"},
    {"key": "PAGE_USERS_VIEW", "label": "Voir les utilisateurs", "group": "Pages", "description": "Accès à la liste des utilisateurs"},
    {"key": "PAGE_SETTINGS_VIEW", "label": "Voir les paramètres", "group": "Pages", "description": "Accès aux paramètres système"},
    {"key": "PAGE_NOTIFICATIONS_VIEW", "label": "Voir les notifications", "group": "Pages", "description": "Accès aux paramètres de notification"},
    {"key": "PAGE_SIMULATOR_VIEW", "label": "Voir le simulateur", "group": "Pages", "description": "Accès au simulateur d'événements"},
    
    # Events
    {"key": "EVENT_VIEW", "label": "Voir les événements", "group": "Events", "description": "Voir les détails d'un événement"},
    {"key": "EVENT_ACK", "label": "Acquitter un événement", "group": "Events", "description": "Marquer un événement comme acquitté"},
    {"key": "EVENT_RESOLVE", "label": "Résoudre un événement", "group": "Events", "description": "Marquer un événement comme résolu"},
    {"key": "EVENT_FALSE_ALARM", "label": "Marquer fausse alerte", "group": "Events", "description": "Marquer un événement comme fausse alerte"},
    {"key": "EVENT_ADD_NOTE", "label": "Ajouter une note", "group": "Events", "description": "Ajouter des notes à un événement"},
    {"key": "EVENT_EXPORT", "label": "Exporter les événements", "group": "Events", "description": "Exporter les données d'événements"},
    
    # Devices
    {"key": "DEVICE_VIEW", "label": "Voir un radar", "group": "Devices", "description": "Voir les détails d'un radar"},
    {"key": "DEVICE_ASSIGN", "label": "Affecter un radar", "group": "Devices", "description": "Affecter un radar à une localisation"},
    {"key": "DEVICE_UNASSIGN", "label": "Désaffecter un radar", "group": "Devices", "description": "Retirer l'affectation d'un radar"},
    {"key": "DEVICE_CONFIG_EDIT", "label": "Modifier config radar", "group": "Devices", "description": "Modifier la configuration d'un radar"},
    {"key": "DEVICE_DELETE", "label": "Supprimer un radar", "group": "Devices", "description": "Supprimer un radar du système"},
    {"key": "DEVICE_REBOOT", "label": "Redémarrer un radar", "group": "Devices", "description": "Redémarrer un radar à distance"},
    
    # Admin
    {"key": "USER_CREATE", "label": "Créer un utilisateur", "group": "Admin", "description": "Créer un nouvel utilisateur"},
    {"key": "USER_EDIT", "label": "Modifier un utilisateur", "group": "Admin", "description": "Modifier les informations d'un utilisateur"},
    {"key": "USER_DELETE", "label": "Supprimer un utilisateur", "group": "Admin", "description": "Supprimer un utilisateur"},
    {"key": "USER_PERMISSIONS_EDIT", "label": "Gérer les permissions", "group": "Admin", "description": "Modifier les permissions d'un utilisateur"},
    {"key": "USER_SCOPES_EDIT", "label": "Gérer les périmètres", "group": "Admin", "description": "Modifier les périmètres d'un utilisateur"},
    {"key": "CLIENT_MANAGE", "label": "Gérer les clients", "group": "Admin", "description": "Créer/modifier/supprimer des clients"},
    {"key": "BUILDING_MANAGE", "label": "Gérer les bâtiments", "group": "Admin", "description": "Créer/modifier/supprimer des bâtiments"},
    {"key": "RULES_EDIT", "label": "Modifier les règles", "group": "Admin", "description": "Créer/modifier/supprimer des règles d'alerte"},
    {"key": "SETTINGS_EDIT", "label": "Modifier les paramètres", "group": "Admin", "description": "Modifier les paramètres système"},
    
    # System (Super Admin only)
    {"key": "SYSTEM_ADMIN", "label": "Administration système", "group": "System", "description": "Accès complet au système"},
    {"key": "AUDIT_LOG_VIEW", "label": "Voir le journal d'audit", "group": "System", "description": "Accès aux logs d'audit"},
    {"key": "DATABASE_MANAGE", "label": "Gérer la base de données", "group": "System", "description": "Opérations de maintenance DB"},
]


# Default permissions by role
ROLE_PERMISSIONS: dict = {
    ClientRole.CLIENT_ADMIN: [
        # All pages
        "PAGE_DASHBOARD_VIEW", "PAGE_LIVE_VIEW", "PAGE_HISTORY_VIEW", "PAGE_STATISTICS_VIEW",
        "PAGE_DEVICES_VIEW", "PAGE_DEVICE_CONFIG_VIEW", "PAGE_CLIENTS_VIEW", "PAGE_RULES_VIEW",
        "PAGE_USERS_VIEW", "PAGE_SETTINGS_VIEW", "PAGE_NOTIFICATIONS_VIEW", "PAGE_SIMULATOR_VIEW",
        # All events
        "EVENT_VIEW", "EVENT_ACK", "EVENT_RESOLVE", "EVENT_FALSE_ALARM", "EVENT_ADD_NOTE", "EVENT_EXPORT",
        # All devices
        "DEVICE_VIEW", "DEVICE_ASSIGN", "DEVICE_UNASSIGN", "DEVICE_CONFIG_EDIT", "DEVICE_DELETE", "DEVICE_REBOOT",
        # All admin
        "USER_CREATE", "USER_EDIT", "USER_DELETE", "USER_PERMISSIONS_EDIT", "USER_SCOPES_EDIT",
        "CLIENT_MANAGE", "BUILDING_MANAGE", "RULES_EDIT", "SETTINGS_EDIT",
    ],
    ClientRole.SUPERVISOR: [
        # Most pages
        "PAGE_DASHBOARD_VIEW", "PAGE_LIVE_VIEW", "PAGE_HISTORY_VIEW", "PAGE_STATISTICS_VIEW",
        "PAGE_DEVICES_VIEW", "PAGE_DEVICE_CONFIG_VIEW", "PAGE_CLIENTS_VIEW", "PAGE_RULES_VIEW",
        "PAGE_NOTIFICATIONS_VIEW",
        # All events
        "EVENT_VIEW", "EVENT_ACK", "EVENT_RESOLVE", "EVENT_FALSE_ALARM", "EVENT_ADD_NOTE", "EVENT_EXPORT",
        # Device management
        "DEVICE_VIEW", "DEVICE_ASSIGN", "DEVICE_UNASSIGN", "DEVICE_CONFIG_EDIT",
        # Limited admin
        "BUILDING_MANAGE", "RULES_EDIT",
    ],
    ClientRole.OPERATOR: [
        # Limited pages
        "PAGE_DASHBOARD_VIEW", "PAGE_LIVE_VIEW", "PAGE_HISTORY_VIEW",
        "PAGE_DEVICES_VIEW", "PAGE_NOTIFICATIONS_VIEW",
        # Event actions
        "EVENT_VIEW", "EVENT_ACK", "EVENT_RESOLVE", "EVENT_ADD_NOTE",
        # Device view only
        "DEVICE_VIEW",
    ],
    ClientRole.VIEWER: [
        # Read-only pages
        "PAGE_DASHBOARD_VIEW", "PAGE_LIVE_VIEW", "PAGE_HISTORY_VIEW", "PAGE_STATISTICS_VIEW",
        # Event view only
        "EVENT_VIEW",
        # Device view only
        "DEVICE_VIEW",
    ],
}


# =============================================================================
# CLIENT USER (User belonging to a client with a role)
# =============================================================================

class ClientUserBase(BaseModel):
    """User belonging to a specific client"""
    client_id: str
    user_id: str
    role: ClientRole = ClientRole.VIEWER


class ClientUserCreate(ClientUserBase):
    pass


class ClientUser(ClientUserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class ClientUserWithDetails(ClientUser):
    """ClientUser with user details for display"""
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    permissions_count: int = 0
    scopes_count: int = 0


# =============================================================================
# PERMISSION OVERRIDE (Per-user permission customization)
# =============================================================================

class UserPermissionOverrideBase(BaseModel):
    """Override a permission for a specific user"""
    client_user_id: str
    permission_key: str
    effect: PermissionEffect


class UserPermissionOverrideCreate(UserPermissionOverrideBase):
    pass


class UserPermissionOverride(UserPermissionOverrideBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class PermissionStatus(BaseModel):
    """Computed permission status for display"""
    key: str
    label: str
    group: str
    description: Optional[str] = None
    role_default: bool = False      # Default from role
    override: Optional[PermissionEffect] = None  # User override
    effective: bool = False         # Final computed value


# =============================================================================
# LOCATION SCOPE (Per-user location access)
# =============================================================================

class LocationScopeBase(BaseModel):
    """Defines a user's access to a specific location"""
    client_user_id: str
    scope_type: ScopeType
    # Location IDs (only one should be set based on scope_type)
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    zone_id: Optional[str] = None
    room_id: Optional[str] = None
    room_space_id: Optional[str] = None
    # Access level
    access_level: AccessLevel = AccessLevel.VIEW


class LocationScopeCreate(LocationScopeBase):
    pass


class LocationScope(LocationScopeBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class LocationScopeWithDetails(LocationScope):
    """LocationScope with location names for display"""
    client_name: Optional[str] = None
    building_name: Optional[str] = None
    floor_name: Optional[str] = None
    zone_name: Optional[str] = None
    room_name: Optional[str] = None
    room_space_name: Optional[str] = None
    display_path: Optional[str] = None  # e.g., "Building A > Floor 2 > Room 212"


# =============================================================================
# API REQUEST/RESPONSE MODELS
# =============================================================================

class BulkPermissionOverride(BaseModel):
    """Bulk update permissions for a user"""
    overrides: List[UserPermissionOverrideCreate]


class BulkLocationScope(BaseModel):
    """Bulk update scopes for a user"""
    scopes: List[LocationScopeCreate]


class EffectiveAccessSummary(BaseModel):
    """Summary of a user's effective access"""
    user_id: str
    client_user_id: str
    role: ClientRole
    # Permissions
    allowed_pages: List[str]
    allowed_actions: List[str]
    denied_permissions: List[str]
    # Scopes
    scope_summary: dict  # {building_count, floor_count, room_count, etc.}
    accessible_building_ids: List[str]
    accessible_floor_ids: List[str]
    accessible_room_ids: List[str]
    # Stats
    total_accessible_radars: int = 0
    has_full_client_access: bool = False


# =============================================================================
# AUDIT LOG
# =============================================================================

class RBACActionType(str, Enum):
    """Types of RBAC-related actions to audit"""
    ROLE_CHANGE = "ROLE_CHANGE"
    PERMISSION_OVERRIDE_ADD = "PERMISSION_OVERRIDE_ADD"
    PERMISSION_OVERRIDE_REMOVE = "PERMISSION_OVERRIDE_REMOVE"
    SCOPE_ADD = "SCOPE_ADD"
    SCOPE_REMOVE = "SCOPE_REMOVE"
    USER_ACTIVATE = "USER_ACTIVATE"
    USER_DEACTIVATE = "USER_DEACTIVATE"


class RBACAuditLog(BaseModel):
    """Audit log for RBAC changes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: RBACActionType
    target_user_id: str
    target_client_user_id: str
    performed_by_user_id: str
    client_id: str
    details: dict = {}  # Action-specific details
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None
