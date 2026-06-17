from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
from jose import JWTError, jwt
import json
import asyncio
import httpx  # Pour les notifications push

# Configure logging early
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent

# =============================================================================
# ENVIRONMENT VARIABLE LOADING STRATEGY (Critical for Production)
# =============================================================================
# In Docker/Kubernetes/Dokploy: Environment variables are injected by the platform.
# We should NEVER override them with values from .env file.
# 
# Strategy:
# 1. Detect if running in a container (/.dockerenv file exists)
# 2. Check if production env vars are set (non-localhost values)
# 3. Only load .env if running locally for development
# =============================================================================

# Detect container environment
_in_container = os.path.exists('/.dockerenv') or os.environ.get('CONTAINER') is not None

# Capture system env vars BEFORE any .env loading
_system_mongo_url = os.environ.get('MONGO_URL')
_system_redis_host = os.environ.get('REDIS_HOST')
_kubernetes_detected = os.environ.get('KUBERNETES_SERVICE_HOST') is not None
_is_atlas_url = _system_mongo_url.startswith('mongodb+srv') if _system_mongo_url else False
_is_production_redis = _system_redis_host is not None and _system_redis_host != 'localhost'
_is_production_mongo = _system_mongo_url is not None and 'localhost' not in _system_mongo_url

# Debug logging for production troubleshooting
logger.info(f"[ENV DEBUG] Running in container: {_in_container}")
logger.info(f"[ENV DEBUG] KUBERNETES_SERVICE_HOST detected: {_kubernetes_detected}")
logger.info(f"[ENV DEBUG] MONGO_URL pre-set in system env: {bool(_system_mongo_url)}")
logger.info(f"[ENV DEBUG] MONGO_URL is Atlas (mongodb+srv): {_is_atlas_url}")
logger.info(f"[ENV DEBUG] REDIS_HOST pre-set in system env: {_system_redis_host}")
logger.info(f"[ENV DEBUG] Production Redis detected: {_is_production_redis}")
logger.info(f"[ENV DEBUG] Production Mongo detected: {_is_production_mongo}")

# Determine if we're in production
# Production = In container OR Kubernetes OR Atlas OR production Redis/Mongo
is_production = _in_container or _kubernetes_detected or _is_atlas_url or _is_production_redis or _is_production_mongo

if not is_production:
    # Only load .env in local development
    env_path = ROOT_DIR / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=False)  # CRITICAL: override=False preserves existing env vars
        logger.info(f"[ENV] Loaded .env file (development mode) from {env_path}")
    else:
        logger.info(f"[ENV] No .env file found at {env_path}, using system environment only")
else:
    logger.info("[ENV] Production mode detected - using system environment variables only")
    logger.info("[ENV] .env file will NOT be loaded to prevent override of production values")

# MQTT Service import
from mqtt_service import init_mqtt_service, stop_mqtt_service

# Socket.IO Service import
from socketio_service import (
    sio, socket_app,
    broadcast_new_event, broadcast_presence_update,
    broadcast_sensor_status, broadcast_sensor_registered,
    broadcast_fall_event_update, broadcast_ai_event,
    get_connected_clients_info
)

# Vayyar Config Service import
from vayyar_config_service import (
    init_vayyar_config_service, stop_vayyar_config_service,
    get_vayyar_config_service, VayyarConfigService
)
from vayyar_config_schema import (
    VayyarConfig, MqttPublishOptions, ConfigVersionResponse,
    get_default_config_dict
)

# Email Service
from email_service import init_email_service, get_email_service


# Clients & Buildings imports
from clients_buildings_service import init_clients_buildings_service, get_clients_buildings_service
from clients_buildings_routes import create_clients_buildings_router

# RBAC imports
from rbac_service import init_rbac_service, get_rbac_service, RBACService
from rbac_routes import create_rbac_routes
from rbac_models import ClientRole, PermissionEffect, ScopeType, AccessLevel

# Push Notification Service import
from push_notification_service import (
    init_push_notification_service, 
    get_push_notification_service,
    PushNotificationService
)

# Sensor Import Service import
from sensor_import_service import (
    init_sensor_import_service,
    get_sensor_import_service,
    SensorImportService
)

# AI Sensor Service import
from ai_sensor_service import (
    init_ai_sensor_service,
    get_ai_sensor_service,
    AISensorService
)

# Session Service import
from session_service import init_session_service, get_session_service

# Room Contacts & Cascade Notifications
from room_contacts_service import init_room_contacts_service
from cascade_notification_service import init_cascade_service, get_cascade_service
from notification_channels import init_channel_manager

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    raise ValueError("MONGO_URL environment variable is required")

db_name = os.environ.get('DB_NAME', 'ohmguard')

# Log which database we're connecting to (mask password)
safe_url = mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url[:50]
logger.info(f"Connecting to MongoDB: ...@{safe_url} / DB: {db_name}")

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET')
if not SECRET_KEY:
    raise ValueError("JWT_SECRET environment variable is required and must be set before starting the server")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Security
security = HTTPBearer()

# Rate limiter (uses client IP)
limiter = Limiter(key_func=get_remote_address)

# Create the main app
app = FastAPI(title="OhmGuard API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.sse_queues: dict[str, list[asyncio.Queue]] = {}  # SSE queues per tenant
    
    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].remove(websocket)
    
    def add_sse_queue(self, tenant_id: str, queue: asyncio.Queue):
        if tenant_id not in self.sse_queues:
            self.sse_queues[tenant_id] = []
        self.sse_queues[tenant_id].append(queue)
    
    def remove_sse_queue(self, tenant_id: str, queue: asyncio.Queue):
        if tenant_id in self.sse_queues and queue in self.sse_queues[tenant_id]:
            self.sse_queues[tenant_id].remove(queue)
    
    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        # Broadcast to WebSocket clients
        if tenant_id in self.active_connections:
            for connection in self.active_connections[tenant_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass
        
        # Broadcast to SSE clients
        if tenant_id in self.sse_queues:
            for queue in self.sse_queues[tenant_id]:
                try:
                    await queue.put(message)
                except:
                    pass

manager = ConnectionManager()

# ==================== MODELS ====================

# Radar Event Models import
from radar_event_models import (
    RadarEventType, PresenceStatus, EventSeverity, EventStatus as RadarEventStatus,
    RadarEventPayload, RadarEventRequest, RadarEventResponse,
    normalize_radar_event, extract_active_regions, epoch_ms_to_iso,
    format_active_regions_display, format_target_count_display
)

# Role enum
RoleType = Literal["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR", "VIEWER"]
EventType = Literal["FALL", "SENSITIVE_FALL", "PRE_FALL", "BED_EXIT", "PRESENCE", "INACTIVITY", "UNKNOWN"]
SeverityType = Literal["LOW", "MED", "HIGH"]
EventStatus = Literal["NEW", "ACK", "RESOLVED", "FALSE_ALARM"]
SensorType = Literal["RADAR"]
SensorStatus = Literal["ONLINE", "OFFLINE", "MAINTENANCE"]

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: RoleType = "VIEWER"
    tenant_id: Optional[str] = None
    language: str = "fr"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[RoleType] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False

class TokenPayload(BaseModel):
    sub: str
    tenant_id: Optional[str] = None
    role: str
    exp: datetime

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TenantBase(BaseModel):
    name: str
    settings: dict = {}

class TenantCreate(TenantBase):
    pass

class Tenant(TenantBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class SiteBase(BaseModel):
    name: str
    address: Optional[str] = None
    tenant_id: str

class SiteCreate(SiteBase):
    pass

class Site(SiteBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ZoneBase(BaseModel):
    name: str
    site_id: str
    floor: Optional[str] = None
    description: Optional[str] = None

class ZoneCreate(ZoneBase):
    pass

class Zone(ZoneBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SensorBase(BaseModel):
    name: str
    type: SensorType
    model: Optional[str] = None
    firmware: Optional[str] = None
    firmware_version: Optional[str] = None
    # Legacy location fields (deprecated - use new hierarchy)
    zone_id: Optional[str] = None
    site_id: Optional[str] = None
    tenant_id: Optional[str] = None
    # MQTT identifiers
    device_id: Optional[str] = None  # MQTT Device ID for communications
    serial_product: Optional[str] = None  # Physical serial number
    serial_radar: Optional[str] = None
    hardware: Optional[str] = None
    product_type: Optional[str] = None
    # New location hierarchy (Clients & Buildings)
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    room_space_id: Optional[str] = None
    assignment_status: Optional[str] = "PENDING"  # PENDING | ASSIGNED

class SensorCreate(SensorBase):
    pass

class SensorUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    firmware: Optional[str] = None
    status: Optional[SensorStatus] = None
    device_id: Optional[str] = None
    serial_product: Optional[str] = None

class Sensor(SensorBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    api_key: str = Field(default_factory=lambda: f"sk_{uuid.uuid4().hex}")
    status: SensorStatus = "OFFLINE"
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EventBase(BaseModel):
    sensor_id: Optional[str] = None
    type: EventType
    confidence: float = Field(ge=0, le=1, default=1.0)
    severity: SeverityType = "LOW"
    anonymized_snapshot_url: Optional[str] = None
    raw_payload: dict = {}

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    status: Optional[EventStatus] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    notes: Optional[str] = None
    comment: Optional[str] = None  # Comment text for the action
    cc_admin: Optional[bool] = None  # CC site admin on assignment email

class BulkEventUpdate(BaseModel):
    event_ids: List[str]
    status: EventStatus
    comment: Optional[str] = None

# Push Notification Token Models
class PushTokenRequest(BaseModel):
    """Request model for registering a push token"""
    token: str
    device_type: Optional[str] = None  # 'ios' or 'android'

class Event(EventBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    site_id: Optional[str] = None
    zone_id: Optional[str] = None
    device_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # New radar event fields
    presence_status: Optional[str] = None
    presence_detected: Optional[bool] = None
    active_regions: Optional[List[int]] = None
    target_count: Optional[int] = None
    occurred_at: Optional[str] = None
    raw_timestamp: Optional[int] = None
    status: EventStatus = "NEW"
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    notes: Optional[str] = None
    comments: Optional[List[dict]] = None
    # Location fields (enriched from sensor assignment)
    location_path: Optional[str] = None
    location: Optional[dict] = None
    # Radar info fields (enriched from sensor)
    radar_name: Optional[str] = None
    serial_product: Optional[str] = None
    # Fall event specific fields
    fall_status: Optional[str] = None
    fall_status_history: Optional[List[dict]] = None
    fall_loc_x_cm: Optional[float] = None
    fall_loc_y_cm: Optional[float] = None
    fall_loc_z_cm: Optional[float] = None
    tar_height_est: Optional[float] = None
    is_simulated: Optional[bool] = None
    is_learning: Optional[bool] = None
    is_silent: Optional[bool] = None
    exit_reason: Optional[str] = None
    id_of_trigger: Optional[str] = None
    end_timestamp: Optional[int] = None
    end_at: Optional[str] = None
    extra: Optional[str] = None

class AlertRuleBase(BaseModel):
    name: str
    tenant_id: str
    site_id: Optional[str] = None
    event_types: List[EventType] = ["FALL"]
    min_severity: SeverityType = "LOW"
    channels: List[str] = ["in_app"]
    webhook_url: Optional[str] = None
    escalation_minutes: int = 5
    escalation_group: Optional[str] = None
    is_active: bool = True

class AlertRuleCreate(AlertRuleBase):
    pass

class AlertRule(AlertRuleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NotificationLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str
    tenant_id: str
    channel: str
    recipient: str
    status: str
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuditLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tenant_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: dict = {}
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== HELPER FUNCTIONS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using bcrypt."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, jti: str = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    if jti:
        to_encode.update({"jti": jti})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserInDB:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Validate session is still active
    jti = payload.get("jti")
    session_svc = get_session_service()
    if session_svc:
        if jti:
            session = await session_svc.validate_session(jti)
            if not session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired or revoked",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        else:
            # Old token without JTI — force re-login
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalide, veuillez vous reconnecter",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise credentials_exception
    return UserInDB(**user)

def check_permission(user: UserInDB, required_roles: List[RoleType]):
    if user.role not in required_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )

async def log_audit(user_id: str, tenant_id: Optional[str], action: str, resource_type: str, resource_id: Optional[str], details: dict = {}):
    audit = AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details
    )
    doc = audit.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.audit_logs.insert_one(doc)


async def check_event_access(event: dict, current_user: UserInDB) -> bool:
    """
    Vérifie si l'utilisateur a accès à un événement.
    Gère les modèles tenant_id (ancien) et client_id (nouveau).
    Vérifie aussi les location_scopes pour les utilisateurs scopés.
    Retourne True si l'accès est autorisé, False sinon.
    """
    if current_user.role == "SUPER_ADMIN":
        return True

    event_tenant_id = event.get('tenant_id')
    user_tenant_id = current_user.tenant_id
    sensor_id = event.get('sensor_id')

    # Check tenant/client membership first
    has_tenant_access = False

    if event_tenant_id and event_tenant_id == user_tenant_id:
        has_tenant_access = True

    if not has_tenant_access and sensor_id:
        sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0, "client_id": 1, "tenant_id": 1})
        if sensor:
            sensor_client_id = sensor.get("client_id")
            sensor_tenant_id = sensor.get("tenant_id")

            if sensor_tenant_id == user_tenant_id or sensor_client_id == user_tenant_id:
                has_tenant_access = True
            elif sensor_client_id:
                client_user = await db.client_users.find_one({
                    "user_id": current_user.id,
                    "client_id": sensor_client_id,
                    "is_active": True
                })
                if client_user:
                    has_tenant_access = True

    if not has_tenant_access:
        return False

    # Now check location_scope for scoped users
    scoped_ids = await get_scoped_sensor_ids(current_user)
    if scoped_ids is None:
        return True  # Full access (TENANT_ADMIN, CLIENT_ADMIN, or no scope set)

    # User is scoped - check if the event's sensor is in their scope
    if sensor_id and sensor_id in scoped_ids:
        return True

    return False


async def get_scoped_sensor_ids(current_user: UserInDB) -> Optional[list]:
    """
    Get the list of sensor IDs accessible to the user based on location_scopes.
    Returns None if the user has full access (SUPER_ADMIN, TENANT_ADMIN, CLIENT_ADMIN).
    Returns a list of sensor IDs if the user is scoped.
    Returns an empty list if the user has no access.
    """
    if current_user.role in ("SUPER_ADMIN", "TENANT_ADMIN"):
        return None  # Full access

    user_client_id = current_user.tenant_id
    if not user_client_id:
        return []

    # Find the client_user record
    client_user = await db.client_users.find_one(
        {"user_id": current_user.id, "client_id": user_client_id, "is_active": True},
        {"_id": 0, "id": 1, "role": 1}
    )

    if not client_user:
        # No client_user record - fall back to tenant-level access (legacy)
        return None

    if client_user.get("role") == "CLIENT_ADMIN":
        return None  # Full access within client

    # Get accessible locations via RBAC
    rbac = get_rbac_service()
    if not rbac:
        return None  # Graceful degradation

    accessible = await rbac.get_user_accessible_locations(client_user["id"])
    if accessible.get("has_full_access"):
        return None

    # Build scope filter for sensors
    scope_filter = rbac.build_scope_filter(accessible)
    if scope_filter.get("_impossible"):
        return []

    sensor_query = {"client_id": user_client_id, **scope_filter}
    sensors = await db.sensors.find(sensor_query, {"_id": 0, "id": 1}).to_list(10000)
    return [s["id"] for s in sensors]


# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=User)
async def register(user_create: UserCreate):
    existing = await db.users.find_one({"email": user_create.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = user_create.model_dump()
    password = user_dict.pop('password')
    user_in_db = UserInDB(**user_dict, hashed_password=get_password_hash(password))
    
    doc = user_in_db.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    return User(**user_dict, id=user_in_db.id, created_at=user_in_db.created_at)

@api_router.post("/auth/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, login_data: LoginRequest):
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user['hashed_password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not user.get('is_active', True):
        raise HTTPException(status_code=400, detail="User is inactive")

    # Create server-side session
    device_info = {
        "user_agent": request.headers.get("user-agent", ""),
        "ip_address": request.client.host if request.client else "",
    }
    session_svc = get_session_service()
    session_id, jti = await session_svc.create_session(
        user_id=user['id'],
        tenant_id=user.get('tenant_id'),
        device_info=device_info,
    )

    token_data = {"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role'], "jti": jti}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data, jti=jti)

    await log_audit(user['id'], user.get('tenant_id'), "login", "user", user['id'])

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        must_change_password=user.get('must_change_password', False)
    )

@api_router.post("/auth/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        old_jti = payload.get("jti")
        session_svc = get_session_service()

        if not old_jti and session_svc:
            # Old token without JTI — force re-login
            raise HTTPException(status_code=401, detail="Session invalide, veuillez vous reconnecter")

        if old_jti and session_svc:
            import uuid as _uuid
            new_jti = str(_uuid.uuid4())
            session_id = await session_svc.rotate_jti(old_jti, new_jti)
            if not session_id:
                raise HTTPException(status_code=401, detail="Session expired or revoked")
        else:
            import uuid as _uuid
            new_jti = str(_uuid.uuid4())

        token_data = {"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role']}
        token_data["jti"] = new_jti

        access_token = create_access_token(data=token_data)
        new_refresh_token = create_refresh_token(data=token_data, jti=new_jti)
        return Token(access_token=access_token, refresh_token=new_refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    return User(**current_user.model_dump())


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    language: Optional[str] = None


@api_router.put("/auth/profile")
async def update_profile(
    request: UpdateProfileRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update the current user's own profile."""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")

    await db.users.update_one({"id": current_user.id}, {"$set": updates})

    # Also update client_users if full_name changed
    if "full_name" in updates:
        await db.client_users.update_many(
            {"user_id": current_user.id},
            {"$set": {"user_full_name": updates["full_name"]}}
        )

    await log_audit(current_user.id, current_user.tenant_id, "update_profile", "user", current_user.id)
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0})
    return User(**user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Change password (required on first login with temporary password)."""
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 6 caractères")

    new_hash = get_password_hash(request.new_password)
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"hashed_password": new_hash, "must_change_password": False}}
    )

    await log_audit(current_user.id, current_user.tenant_id, "change_password", "user", current_user.id)
    return {"detail": "Mot de passe modifié avec succès"}


# ==================== SESSION ENDPOINTS ====================

def _extract_jti_from_request(request: Request) -> Optional[str]:
    """Extract JTI from the Bearer token in the request."""
    try:
        token = request.headers.get("authorization", "").replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("jti")
    except Exception:
        return None


@api_router.post("/auth/logout")
async def logout(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Logout current session."""
    jti = _extract_jti_from_request(request)
    if jti:
        session_svc = get_session_service()
        if session_svc:
            session = await session_svc.validate_session(jti)
            if session:
                await session_svc.revoke_session(session["session_id"], current_user.id)
    await log_audit(current_user.id, current_user.tenant_id, "logout", "session", None)
    return {"detail": "Logged out successfully"}


@api_router.post("/auth/logout-all")
async def logout_all(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Logout all sessions except the current one."""
    jti = _extract_jti_from_request(request)
    session_svc = get_session_service()
    if session_svc:
        count = await session_svc.revoke_all_sessions(current_user.id, except_jti=jti)
    else:
        count = 0
    await log_audit(current_user.id, current_user.tenant_id, "logout_all", "session", None)
    return {"detail": f"{count} other session(s) revoked"}


@api_router.get("/auth/sessions")
async def list_sessions(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """List active sessions for the current user."""
    session_svc = get_session_service()
    if not session_svc:
        return []
    sessions = await session_svc.list_user_sessions(current_user.id)
    current_jti = _extract_jti_from_request(request)
    for s in sessions:
        s["is_current"] = (s.get("refresh_token_jti") == current_jti)
        s.pop("refresh_token_jti", None)
    return sessions


@api_router.delete("/auth/sessions/{session_id}")
async def revoke_session(session_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Revoke a specific session."""
    session_svc = get_session_service()
    if not session_svc:
        raise HTTPException(status_code=500, detail="Session service not available")
    revoked = await session_svc.revoke_session(session_id, current_user.id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Session not found")
    await log_audit(current_user.id, current_user.tenant_id, "session_revoke", "session", session_id)
    return {"detail": "Session revoked"}


# ==================== TENANT ENDPOINTS ====================

@api_router.post("/tenants", response_model=Tenant)
async def create_tenant(tenant: TenantCreate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN"])
    
    tenant_obj = Tenant(**tenant.model_dump())
    doc = tenant_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.tenants.insert_one(doc)
    
    await log_audit(current_user.id, None, "create", "tenant", tenant_obj.id)
    return tenant_obj

@api_router.get("/tenants", response_model=List[Tenant])
async def list_tenants(current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN"])
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(1000)
    return tenants

@api_router.get("/tenants/{tenant_id}", response_model=Tenant)
async def get_tenant(tenant_id: str, current_user: UserInDB = Depends(get_current_user)):
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant

# ==================== PUSH NOTIFICATION ENDPOINTS ====================

@api_router.post("/push-tokens", status_code=status.HTTP_201_CREATED)
async def register_push_token(
    token_data: PushTokenRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Register or update a push notification token for the current user.
    Called by the mobile app when a user logs in.
    """
    push_service = get_push_notification_service()
    if not push_service:
        raise HTTPException(status_code=503, detail="Push notification service not available")
    
    result = await push_service.register_token(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        token=token_data.token,
        device_type=token_data.device_type
    )
    return result

@api_router.delete("/push-tokens")
async def delete_push_token(
    token: str = Query(..., description="The push token to delete"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Delete a push notification token.
    Called by the mobile app when a user logs out.
    """
    push_service = get_push_notification_service()
    if not push_service:
        raise HTTPException(status_code=503, detail="Push notification service not available")
    
    deleted = await push_service.delete_token(current_user.id, token)
    if not deleted:
        raise HTTPException(status_code=404, detail="Token not found")
    
    return {"message": "Token deleted"}


class NotificationSettingsRequest(BaseModel):
    """Request model for toggling push notifications"""
    token: str
    enabled: bool


@api_router.get("/push-tokens/settings")
async def get_notification_settings(
    token: str = Query(..., description="The Expo push token"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get the current push notification enabled/disabled status for a token.
    Called by the mobile app on startup to restore the toggle state.
    """
    push_service = get_push_notification_service()
    if not push_service:
        raise HTTPException(status_code=503, detail="Push notification service not available")

    return await push_service.get_notifications_status(current_user.id, token)


@api_router.patch("/push-tokens/settings")
async def update_notification_settings(
    settings: NotificationSettingsRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Enable or disable push notifications for a specific device token.
    When disabled, this device will no longer receive fall alerts.
    """
    push_service = get_push_notification_service()
    if not push_service:
        raise HTTPException(status_code=503, detail="Push notification service not available")

    result = await push_service.set_notifications_enabled(
        user_id=current_user.id,
        token=settings.token,
        enabled=settings.enabled
    )

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Token not found"))

    return result


@api_router.get("/push-tokens")
async def list_push_tokens(current_user: UserInDB = Depends(get_current_user)):
    """
    List all push-notification devices registered for the current user.
    Used by the web platform to display and manage mobile devices.
    """
    cursor = db.push_tokens.find(
        {"user_id": current_user.id},
        {"_id": 0, "token": 1, "device_type": 1, "notifications_enabled": 1,
         "created_at": 1, "updated_at": 1}
    )
    docs = await cursor.to_list(length=50)
    return [
        {
            "token_preview": d["token"][-8:] if d.get("token") else "—",
            "device_type": d.get("device_type") or "unknown",
            "notifications_enabled": d.get("notifications_enabled", True),
            "created_at": d.get("created_at"),
            "updated_at": d.get("updated_at"),
        }
        for d in docs
    ]


class BulkNotificationSettingsRequest(BaseModel):
    """Enable or disable push notifications on all devices for the current user"""
    enabled: bool


@api_router.patch("/push-tokens/settings/all")
async def update_all_notification_settings(
    settings: BulkNotificationSettingsRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Enable or disable push notifications on ALL devices of the current user.
    Used from the web platform settings page.
    """
    result = await db.push_tokens.update_many(
        {"user_id": current_user.id},
        {"$set": {
            "notifications_enabled": settings.enabled,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    status_label = "activées" if settings.enabled else "désactivées"
    logger.info(f"[Push] Notifications {status_label} sur {result.modified_count} appareil(s) pour {current_user.id}")
    return {
        "success": True,
        "notifications_enabled": settings.enabled,
        "devices_updated": result.modified_count
    }


@api_router.post("/test-notification")
async def test_notification(current_user: UserInDB = Depends(get_current_user)):
    """
    Send a test notification to the current user's devices.
    Useful for testing push notification configuration.
    """
    push_service = get_push_notification_service()
    if not push_service:
        raise HTTPException(status_code=503, detail="Push notification service not available")
    
    result = await push_service.send_test_notification(current_user.id)
    
    if not result:
        raise HTTPException(status_code=404, detail="No push tokens registered for this user")
    
    return {"message": "Test notification sent", "result": result}

@api_router.post("/create-fall-event")
async def create_fall_event(current_user: UserInDB = Depends(get_current_user)):
    """
    Create a simulated fall event and send push notification.
    Useful for testing the mobile app notifications.
    """
    import uuid
    from datetime import datetime, timezone
    
    push_service = get_push_notification_service()
    
    # Get a sensor for this tenant
    sensor = await db.sensors.find_one({"tenant_id": current_user.tenant_id}, {"_id": 0})
    
    # Create event
    event_id = str(uuid.uuid4())
    event = {
        "id": event_id,
        "sensor_id": sensor["id"] if sensor else None,
        "type": "FALL",
        "eventType": "FALL",
        "severity": "HIGH",
        "status": "NEW",
        "tenant_id": current_user.tenant_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confidence": 0.95
    }
    
    await db.events.insert_one(event)
    
    # Build location string
    location = "Test - Simulation de chute"
    if sensor:
        location = sensor.get("name", "Radar") + " - Simulation"
    
    # Send push notification
    if push_service:
        await push_service.send_fall_alert(
            tenant_id=current_user.tenant_id,
            event_id=event_id,
            location=location,
            severity="HIGH",
            sensor_id=device_id
        )

    logger.info(f"[Test] Fall event created: {event_id}")
    
    return {
        "message": "Fall event created and notification sent",
        "event_id": event_id
    }


@api_router.post("/create-sensitive-fall-event")
async def create_sensitive_fall_event(current_user: UserInDB = Depends(get_current_user)):
    """
    Create a simulated SENSITIVE_FALL event (type 8) for testing.
    """
    import uuid
    from datetime import datetime, timezone
    from radar_event_models import (
        SensitiveFallEventPayload, normalize_sensitive_fall_event
    )
    
    sensor = await db.sensors.find_one({"tenant_id": current_user.tenant_id}, {"_id": 0})
    
    sf_payload = SensitiveFallEventPayload(
        timestamp=int(datetime.now(timezone.utc).timestamp() * 1000),
        status="fall_suspected",
        isSimulated=True,
        isLearning=False,
        isSilent=False,
        fallLocX_cm=150.0,
        fallLocY_cm=200.0,
        fallLocZ_cm=30.0,
        confidenceLevel=0.85,
        suspectedEventsCounter=1,
        lastEventConfidence=0.85
    )
    
    event = normalize_sensitive_fall_event(
        device_id=sensor.get("device_id", f"test_{uuid.uuid4().hex[:8]}") if sensor else f"test_{uuid.uuid4().hex[:8]}",
        payload=sf_payload,
        sensor_id=sensor["id"] if sensor else None,
        site_id=sensor.get("site_id") if sensor else None,
        zone_id=sensor.get("zone_id") if sensor else None,
        tenant_id=current_user.tenant_id
    )
    
    # Enrich with location
    if sensor:
        event["radar_name"] = sensor.get("name")
        location_parts = []
        if sensor.get("client_name"):
            location_parts.append(sensor["client_name"])
        if sensor.get("building_name"):
            location_parts.append(sensor["building_name"])
        if sensor.get("floor_name"):
            location_parts.append(sensor["floor_name"])
        if sensor.get("room_name"):
            location_parts.append(sensor["room_name"])
        if location_parts:
            event["location_path"] = " > ".join(location_parts)
    
    await db.events.insert_one(event)
    
    # Broadcast via WebSocket
    event_for_broadcast = {k: v for k, v in event.items() if k != '_id'}
    await manager.broadcast_to_tenant(current_user.tenant_id, {
        "type": "new_radar_event",
        "event": {
            **event_for_broadcast,
            "sensor_name": sensor.get('name') if sensor else None,
            "urgent": True
        }
    })
    
    logger.info(f"[Test] Sensitive Fall event created: {event['id']}")
    return {
        "message": "Sensitive Fall event created",
        "event_id": event['id']
    }

# ==================== SITE ENDPOINTS ====================

@api_router.post("/sites", response_model=Site)
async def create_site(site: SiteCreate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != site.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    site_obj = Site(**site.model_dump())
    doc = site_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.sites.insert_one(doc)
    
    await log_audit(current_user.id, site.tenant_id, "create", "site", site_obj.id)
    return site_obj

@api_router.get("/sites", response_model=List[Site])
async def list_sites(
    tenant_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    elif tenant_id:
        query["tenant_id"] = tenant_id
    
    sites = await db.sites.find(query, {"_id": 0}).to_list(1000)
    return sites

@api_router.get("/sites/{site_id}", response_model=Site)
async def get_site(site_id: str, current_user: UserInDB = Depends(get_current_user)):
    site = await db.sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != site['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return site

# ==================== ZONE ENDPOINTS ====================

@api_router.post("/zones", response_model=Zone)
async def create_zone(zone: ZoneCreate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    site = await db.sites.find_one({"id": zone.site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != site['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    zone_obj = Zone(**zone.model_dump())
    doc = zone_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.zones.insert_one(doc)
    
    await log_audit(current_user.id, site['tenant_id'], "create", "zone", zone_obj.id)
    return zone_obj

@api_router.get("/zones", response_model=List[Zone])
async def list_zones(
    site_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if site_id:
        query["site_id"] = site_id
    
    if current_user.role != "SUPER_ADMIN":
        sites = await db.sites.find({"tenant_id": current_user.tenant_id}, {"_id": 0, "id": 1}).to_list(1000)
        site_ids = [s['id'] for s in sites]
        query["site_id"] = {"$in": site_ids}
    
    zones = await db.zones.find(query, {"_id": 0}).to_list(1000)
    return zones

# ==================== SENSOR ENDPOINTS ====================

@api_router.post("/sensors", response_model=Sensor)
async def create_sensor(sensor: SensorCreate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    sensor_obj = Sensor(**sensor.model_dump())
    doc = sensor_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    if doc.get('last_seen'):
        doc['last_seen'] = doc['last_seen'].isoformat()
    await db.sensors.insert_one(doc)
    
    await log_audit(current_user.id, sensor.tenant_id, "create", "sensor", sensor_obj.id)
    return sensor_obj

@api_router.get("/sensors", response_model=List[Sensor])
async def list_sensors(
    tenant_id: Optional[str] = None,
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    status: Optional[SensorStatus] = None,
    skip_cache: bool = False,
    current_user: UserInDB = Depends(get_current_user)
):
    from cache_service import get_cache_service
    cache = get_cache_service()
    
    # Determine tenant for cache key
    cache_tenant = current_user.tenant_id if current_user.role != "SUPER_ADMIN" else (tenant_id or "all")
    
    # Try cache first (if no filters and not skipping)
    if not skip_cache and not site_id and not zone_id and not status:
        cached = cache.get_sensors_list(cache_tenant)
        if cached:
            return cached
    
    query = {}
    if current_user.role != "SUPER_ADMIN":
        # Apply location_scope filtering
        scoped_ids = await get_scoped_sensor_ids(current_user)
        if scoped_ids is not None:
            if not scoped_ids:
                return []
            query["id"] = {"$in": scoped_ids}
        else:
            query["tenant_id"] = current_user.tenant_id
    elif tenant_id:
        query["tenant_id"] = tenant_id

    if site_id:
        query["site_id"] = site_id
    if zone_id:
        query["zone_id"] = zone_id
    if status:
        query["status"] = status

    sensors = await db.sensors.find(query, {"_id": 0}).to_list(1000)

    # Cache result if no filters
    if not site_id and not zone_id and not status:
        cache.set_sensors_list(cache_tenant, sensors)

    return sensors

@api_router.get("/sensors/{sensor_id}", response_model=Sensor)
async def get_sensor(sensor_id: str, current_user: UserInDB = Depends(get_current_user)):
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return sensor

@api_router.patch("/sensors/{sensor_id}", response_model=Sensor)
async def update_sensor(sensor_id: str, update: SensorUpdate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.sensors.update_one({"id": sensor_id}, {"$set": update_data})
        await log_audit(current_user.id, sensor['tenant_id'], "update", "sensor", sensor_id, update_data)
        # Invalidate cache
        from cache_service import get_cache_service
        get_cache_service().invalidate_sensors(sensor['tenant_id'])
    
    updated = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    return updated

@api_router.post("/sensors/{sensor_id}/rotate-key", response_model=dict)
async def rotate_sensor_key(sensor_id: str, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    new_key = f"sk_{uuid.uuid4().hex}"
    await db.sensors.update_one({"id": sensor_id}, {"$set": {"api_key": new_key}})
    # Invalidate cache
    from cache_service import get_cache_service
    get_cache_service().invalidate_sensors(sensor['tenant_id'])
    
    await log_audit(current_user.id, sensor['tenant_id'], "rotate_key", "sensor", sensor_id)
    return {"api_key": new_key}

# ==================== SENSOR IMPORT ENDPOINTS ====================

class ImportRequest(BaseModel):
    csv_content: str

@api_router.get("/sensors/import/template")
async def get_import_template(
    format: str = "xlsx",
    current_user: UserInDB = Depends(get_current_user)
):
    """Download template for sensor import (Excel or CSV)"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    import_service = get_sensor_import_service()
    
    if format == "xlsx":
        # Generate Excel template
        excel_bytes = await import_service.get_excel_template()
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=template_import_capteurs.xlsx"}
        )
    else:
        # CSV template
        template = import_service.get_csv_template()
        return StreamingResponse(
            io.StringIO(template),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=sensors_import_template.csv"}
        )

@api_router.post("/sensors/import/preview")
async def preview_sensor_import(request: ImportRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Preview sensor import from CSV.
    Returns analysis of what will be created/updated without making changes.
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    import_service = get_sensor_import_service()
    preview = await import_service.preview_import(request.csv_content, current_user.tenant_id)
    
    return preview.to_dict()

@api_router.post("/sensors/import/execute")
async def execute_sensor_import(request: ImportRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Execute sensor import from CSV.
    Creates/updates sensors and auto-creates missing locations.
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    import_service = get_sensor_import_service()
    result = await import_service.execute_import(request.csv_content, current_user.tenant_id)
    
    # Log audit
    await log_audit(
        current_user.id, 
        current_user.tenant_id, 
        "import_sensors", 
        "sensors", 
        None, 
        {
            "created": result["created_sensors"],
            "updated": result["updated_sensors"]
        }
    )
    
    return result

# ==================== AI SENSOR ENDPOINTS ====================

class AISensorCreate(BaseModel):
    channel: str
    channel_name: str
    name: Optional[str] = None
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    confidence_threshold: Optional[float] = 0.7
    enabled_warnings: Optional[List[str]] = []
    warning_thresholds: Optional[Dict[str, float]] = None
    push_notifications_enabled: Optional[bool] = True

class AISensorUpdate(BaseModel):
    name: Optional[str] = None
    channel_name: Optional[str] = None
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    confidence_threshold: Optional[float] = None
    enabled_warnings: Optional[List[str]] = None
    warning_thresholds: Optional[Dict[str, float]] = None
    push_notifications_enabled: Optional[bool] = None

@api_router.get("/ai-sensors")
async def list_ai_sensors(
    client_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """List all AI sensors"""
    ai_service = get_ai_sensor_service()
    sensors = await ai_service.get_all_sensors(client_id)
    return sensors

@api_router.get("/ai-sensors/{sensor_id}")
async def get_ai_sensor(sensor_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Get a single AI sensor"""
    ai_service = get_ai_sensor_service()
    sensor = await ai_service.get_sensor(sensor_id)
    if not sensor:
        raise HTTPException(status_code=404, detail="AI Sensor not found")
    return sensor

@api_router.post("/ai-sensors")
async def create_ai_sensor(data: AISensorCreate, current_user: UserInDB = Depends(get_current_user)):
    """Create a new AI sensor"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    ai_service = get_ai_sensor_service()
    
    # Check if channel already exists
    existing = await ai_service.get_sensor_by_channel(data.channel)
    if existing:
        raise HTTPException(status_code=400, detail="AI Sensor with this channel already exists")
    
    sensor = await ai_service.create_sensor(data.model_dump())
    return sensor

@api_router.patch("/ai-sensors/{sensor_id}")
async def update_ai_sensor(sensor_id: str, data: AISensorUpdate, current_user: UserInDB = Depends(get_current_user)):
    """Update an AI sensor"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    ai_service = get_ai_sensor_service()
    
    sensor = await ai_service.update_sensor(sensor_id, data.model_dump(exclude_none=True))
    if not sensor:
        raise HTTPException(status_code=404, detail="AI Sensor not found")
    return sensor

@api_router.delete("/ai-sensors/{sensor_id}")
async def delete_ai_sensor(sensor_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Delete an AI sensor"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    ai_service = get_ai_sensor_service()
    
    deleted = await ai_service.delete_sensor(sensor_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="AI Sensor not found")
    return {"status": "success", "message": "AI Sensor deleted"}

# ==================== AI EVENTS ENDPOINTS ====================

@api_router.get("/ai-events")
async def list_ai_events(
    sensor_id: Optional[str] = None,
    client_id: Optional[str] = None,
    warning_type: Optional[str] = None,
    status: Optional[str] = None,
    min_confidence: Optional[float] = None,
    limit: int = Query(50, le=500),
    skip: int = 0,
    current_user: UserInDB = Depends(get_current_user)
):
    """List AI events with filters"""
    ai_service = get_ai_sensor_service()
    events = await ai_service.get_events(
        sensor_id=sensor_id,
        client_id=client_id,
        warning_type=warning_type,
        status=status,
        min_confidence=min_confidence,
        limit=limit,
        skip=skip
    )
    return events

@api_router.get("/ai-events/count")
async def count_ai_events(
    sensor_id: Optional[str] = None,
    client_id: Optional[str] = None,
    warning_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Count AI events"""
    ai_service = get_ai_sensor_service()
    count = await ai_service.count_events(
        sensor_id=sensor_id,
        client_id=client_id,
        warning_type=warning_type,
        status=status
    )
    return {"count": count}

@api_router.get("/ai-events/{event_id}")
async def get_ai_event(event_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Get a single AI event"""
    ai_service = get_ai_sensor_service()
    event = await ai_service.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="AI Event not found")
    return event

@api_router.patch("/ai-events/{event_id}/status")
async def update_ai_event_status(
    event_id: str,
    status: str = Query(..., description="NEW, ACKNOWLEDGED, RESOLVED, FALSE_ALARM"),
    current_user: UserInDB = Depends(get_current_user)
):
    """Update AI event status"""
    ai_service = get_ai_sensor_service()
    event = await ai_service.update_event_status(event_id, status, current_user.id)
    if not event:
        raise HTTPException(status_code=404, detail="AI Event not found")
    return event

@api_router.delete("/ai-events/clear")
async def clear_ai_events(current_user: UserInDB = Depends(get_current_user)):
    """Clear all AI events (admin only)"""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can clear AI events")
    
    ai_service = get_ai_sensor_service()
    deleted = await ai_service.clear_events()
    return {"status": "success", "events_deleted": deleted}

# ==================== RADAR ASSIGNMENT ENDPOINTS ====================

class RadarAssignment(BaseModel):
    # client_id/building_id/floor_id are derived from the target room/space when not
    # provided, so the frontend only needs to send room_space_id or room_id.
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    room_space_id: Optional[str] = None
    reason: Optional[str] = None  # Free-text reason from the UI (kept for audit)

@api_router.post("/radars/{radar_id}/assign")
async def assign_radar(radar_id: str, assignment: RadarAssignment, current_user: UserInDB = Depends(get_current_user)):
    """Assign a radar to a location (client/building/floor/room/space)"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Radar not found")

    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")

    # Resolve the target location from the most specific field provided.
    # Spaces are embedded in the room document's "spaces" array (not a separate collection),
    # so client/building/floor/room are derived from the room that owns the space/room_id.
    room = None
    if assignment.room_space_id:
        room = await db.rooms.find_one({"spaces.id": assignment.room_space_id}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail="Espace introuvable")
    elif assignment.room_id:
        room = await db.rooms.find_one({"id": assignment.room_id}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail="Chambre introuvable")

    if room:
        client_id = room.get("client_id")
        building_id = room.get("building_id")
        floor_id = room.get("floor_id")
        room_id = room["id"]
    else:
        # Fallback: explicit client/building/floor assignment (no room target)
        client_id = assignment.client_id
        building_id = assignment.building_id
        floor_id = assignment.floor_id
        room_id = assignment.room_id

    if not client_id:
        raise HTTPException(status_code=400, detail="Impossible de déterminer le client de destination")

    # Verify client exists
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Resolve human-readable names for location caching
    building = await db.buildings.find_one({"id": building_id}, {"name": 1}) if building_id else None
    floor = await db.floors.find_one({"id": floor_id}, {"name": 1}) if floor_id else None

    # Update sensor with assignment (IDs + cached names for fast location_path)
    update_data = {
        "client_id": client_id,
        "client_name": client.get("name"),
        "building_id": building_id,
        "building_name": building.get("name") if building else None,
        "floor_id": floor_id,
        "floor_name": floor.get("name") if floor else None,
        "room_id": room_id,
        "room_name": room.get("name") if room else None,
        "room_space_id": assignment.room_space_id,
        "assignment_status": "ASSIGNED"
    }

    await db.sensors.update_one({"id": radar_id}, {"$set": update_data})

    from cache_service import get_cache_service
    get_cache_service().invalidate_sensors(sensor['tenant_id'])

    await log_audit(current_user.id, sensor['tenant_id'], "assign", "sensor", radar_id, update_data)

    updated = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
    return {"status": "success", "message": "Radar assigned successfully", "sensor": updated}

@api_router.post("/radars/{radar_id}/unassign")
async def unassign_radar(radar_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Unassign a radar from its current location"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Radar not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Clear placement only — keep the radar attached to its client/organisation so it
    # stays visible in the client's "unassigned radars" list and keeps its history view.
    update_data = {
        "building_id": None,
        "building_name": None,
        "floor_id": None,
        "floor_name": None,
        "room_id": None,
        "room_name": None,
        "room_number": None,
        "room_space_id": None,
        "zone_id": None,
        "assignment_status": "PENDING"
    }

    await db.sensors.update_one({"id": radar_id}, {"$set": update_data})

    from cache_service import get_cache_service
    get_cache_service().invalidate_sensors(sensor['tenant_id'])

    await log_audit(current_user.id, sensor['tenant_id'], "unassign", "sensor", radar_id)

    return {"status": "success", "message": "Radar unassigned successfully"}

@api_router.delete("/sensors/{sensor_id}")
async def delete_sensor(sensor_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Delete a sensor/radar from the system"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Delete the sensor
    await db.sensors.delete_one({"id": sensor_id})
    
    # Also delete related events
    deleted_events = await db.events.delete_many({"sensor_id": sensor_id})
    
    await log_audit(current_user.id, sensor['tenant_id'], "delete", "sensor", sensor_id)
    
    return {
        "status": "success", 
        "message": f"Sensor deleted successfully. {deleted_events.deleted_count} related events also deleted."
    }

# ==================== SENSOR DEVICE API ====================

@api_router.post("/device/heartbeat")
@limiter.limit("60/minute")
async def device_heartbeat(request: Request, api_key: str = Query(...)):
    sensor = await db.sensors.find_one({"api_key": api_key}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    now = datetime.now(timezone.utc)
    await db.sensors.update_one(
        {"api_key": api_key},
        {"$set": {"status": "ONLINE", "last_seen": now.isoformat()}}
    )
    
    return {"status": "ok", "timestamp": now.isoformat()}

@api_router.post("/device/event", response_model=Event)
@limiter.limit("30/minute")
async def device_create_event(request: Request, event: EventCreate, api_key: str = Query(...)):
    sensor = await db.sensors.find_one({"api_key": api_key}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    if event.sensor_id != sensor['id']:
        raise HTTPException(status_code=400, detail="Sensor ID mismatch")
    
    # Deduplication: check for similar event in last 10 seconds
    ten_seconds_ago = datetime.now(timezone.utc) - timedelta(seconds=10)
    existing = await db.events.find_one({
        "sensor_id": sensor['id'],
        "type": event.type,
        "timestamp": {"$gte": ten_seconds_ago.isoformat()}
    }, {"_id": 0})
    
    if existing:
        # Update existing event with higher confidence if applicable
        if event.confidence > existing.get('confidence', 0):
            await db.events.update_one(
                {"id": existing['id']},
                {"$set": {"confidence": event.confidence, "raw_payload": event.raw_payload}}
            )
        return Event(**existing)
    
    # Create new event
    event_obj = Event(
        **event.model_dump(),
        tenant_id=sensor['tenant_id'],
        site_id=sensor['site_id'],
        zone_id=sensor['zone_id']
    )
    doc = event_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.events.insert_one(doc)
    
    # Update sensor last_seen
    await db.sensors.update_one(
        {"id": sensor['id']},
        {"$set": {"status": "ONLINE", "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Broadcast to WebSocket clients
    await manager.broadcast_to_tenant(sensor['tenant_id'], {
        "type": "new_event",
        "event": doc
    })
    
    # Trigger alert rules (simplified)
    asyncio.create_task(process_alert_rules(event_obj))
    
    return event_obj

async def process_alert_rules(event: Event):
    """Process alert rules for a new event"""
    rules = await db.alert_rules.find({
        "tenant_id": event.tenant_id,
        "is_active": True,
        "$or": [
            {"site_id": event.site_id},
            {"site_id": None}
        ]
    }, {"_id": 0}).to_list(100)
    
    severity_order = {"LOW": 1, "MED": 2, "HIGH": 3}
    
    for rule in rules:
        if event.type not in rule.get('event_types', []):
            continue
        if severity_order.get(event.severity, 0) < severity_order.get(rule.get('min_severity', 'LOW'), 0):
            continue
        
        # Create notification log
        for channel in rule.get('channels', ['in_app']):
            notification = NotificationLog(
                event_id=event.id,
                tenant_id=event.tenant_id,
                channel=channel,
                recipient=rule.get('name', 'default'),
                status="sent",
                message=f"Fall alert: {event.type} at sensor {event.sensor_id}"
            )
            doc = notification.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.notification_logs.insert_one(doc)
        
        # Webhook (mock in dev)
        if rule.get('webhook_url'):
            logger.info(f"[MOCK] Webhook to {rule['webhook_url']}: {event.model_dump()}")

# ==================== EVENT ENDPOINTS ====================

@api_router.get("/events", response_model=List[Event])
async def list_events(
    site_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    sensor_id: Optional[str] = None,
    client_id: Optional[str] = None,
    building_id: Optional[str] = None,
    event_type: Optional[EventType] = None,
    status: Optional[EventStatus] = None,
    severity: Optional[SeverityType] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(50, le=500),
    skip: int = 0,
    no_cache: bool = Query(False, description="Bypass cache and fetch from database"),
    current_user: UserInDB = Depends(get_current_user)
):
    # Import cache service
    from config.event_cache import get_event_cache_service
    cache_service = get_event_cache_service()
    
    query = {}
    
    # RBAC-aware filtering: check if user has a client association via tenant_id
    # tenant_id in user might reference a client_id in the new Clients module
    user_client_id = current_user.tenant_id
    cache_tenant_id = None
    cache_client_id = None
    
    if current_user.role == "SUPER_ADMIN":
        # Super admin sees everything - no filter
        cache_tenant_id = "super_admin"
    elif current_user.role in ["TENANT_ADMIN", "SUPERVISOR", "OPERATOR", "VIEWER"]:
        # Filter by client + location scope
        client_exists = await db.clients.find_one({"id": user_client_id})

        if client_exists:
            cache_client_id = user_client_id
            # Apply location_scope filtering
            scoped_ids = await get_scoped_sensor_ids(current_user)
            if scoped_ids is not None:
                # User is scoped to specific sensors
                if not scoped_ids:
                    return []
                query["sensor_id"] = {"$in": scoped_ids}
            else:
                # Full access within client - filter by all client sensors
                client_sensors = await db.sensors.find(
                    {"client_id": user_client_id},
                    {"_id": 0, "id": 1}
                ).to_list(10000)
                client_sensor_ids = [s["id"] for s in client_sensors]
                if client_sensor_ids:
                    query["sensor_id"] = {"$in": client_sensor_ids}
                else:
                    return []
        else:
            # Legacy mode: filter by tenant_id directly
            cache_tenant_id = user_client_id
            query["tenant_id"] = user_client_id
    else:
        # Default: filter by tenant_id
        cache_tenant_id = user_client_id
        query["tenant_id"] = user_client_id
    
    if site_id:
        query["site_id"] = site_id
    if zone_id:
        query["zone_id"] = zone_id
    if sensor_id:
        query["sensor_id"] = sensor_id
    
    # Filtrage par client/building: on doit d'abord trouver les sensors associés
    if client_id or building_id:
        sensor_query = {}
        if client_id:
            sensor_query["client_id"] = client_id
            cache_client_id = client_id
        if building_id:
            sensor_query["building_id"] = building_id
        
        matching_sensors = await db.sensors.find(sensor_query, {"_id": 0, "id": 1}).to_list(1000)
        matching_sensor_ids = [s["id"] for s in matching_sensors]
        
        if matching_sensor_ids:
            query["sensor_id"] = {"$in": matching_sensor_ids}
        else:
            # Aucun capteur correspondant, retourner une liste vide
            return []
    
    if event_type:
        query["type"] = event_type
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    if start_date:
        query["timestamp"] = {"$gte": start_date}
    if end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = end_date
        else:
            query["timestamp"] = {"$lte": end_date}
    
    # Build cache filters (exclude complex query operators for cache key)
    cache_filters = {
        "site_id": site_id,
        "zone_id": zone_id,
        "sensor_id": sensor_id,
        "event_type": event_type,
        "status": status,
        "severity": severity,
        "start_date": start_date,
        "end_date": end_date,
        "limit": limit,
        "skip": skip
    }
    # Remove None values
    cache_filters = {k: v for k, v in cache_filters.items() if v is not None}
    
    # Try to get from cache (only for default queries without skip and small limits)
    use_cache = not no_cache and skip == 0 and limit <= 100 and not start_date and not end_date
    
    if use_cache:
        cached_events = cache_service.get_cached_events(
            tenant_id=cache_tenant_id,
            client_id=cache_client_id,
            filters=cache_filters
        )
        if cached_events is not None:
            logger.debug(f"Returning {len(cached_events)} events from cache")
            return cached_events
    
    # Cache miss or cache disabled - fetch from database
    events = await db.events.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Optimized batch enrichment to avoid N+1 queries
    try:
        # Collect unique sensor IDs
        sensor_ids = list(set(e.get("sensor_id") for e in events if e.get("sensor_id")))
        
        if sensor_ids:
            # Batch fetch all sensors with full info (including name and serial)
            sensors = await db.sensors.find(
                {"id": {"$in": sensor_ids}},
                {"_id": 0, "id": 1, "name": 1, "serial_product": 1, "client_id": 1, "building_id": 1, "floor_id": 1, "room_id": 1, "room_space_id": 1}
            ).to_list(len(sensor_ids))
            sensor_map = {s["id"]: s for s in sensors}
            
            # Collect all entity IDs (use snake_case field names)
            client_ids = list(set(s.get("client_id") for s in sensors if s.get("client_id")))
            building_ids = list(set(s.get("building_id") for s in sensors if s.get("building_id")))
            floor_ids = list(set(s.get("floor_id") for s in sensors if s.get("floor_id")))
            room_ids = list(set(s.get("room_id") for s in sensors if s.get("room_id")))
            
            # Batch fetch all related entities
            clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(client_ids)) if client_ids else []
            buildings = await db.buildings.find({"id": {"$in": building_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(building_ids)) if building_ids else []
            floors = await db.floors.find({"id": {"$in": floor_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(floor_ids)) if floor_ids else []
            rooms = await db.rooms.find({"id": {"$in": room_ids}}, {"_id": 0, "id": 1, "room_number": 1, "name": 1}).to_list(len(room_ids)) if room_ids else []
            
            # Build lookup maps
            client_map = {c["id"]: c for c in clients}
            building_map = {b["id"]: b for b in buildings}
            floor_map = {f["id"]: f for f in floors}
            room_map = {r["id"]: r for r in rooms}
            
            # Enrich events using maps (O(1) lookups)
            for event in events:
                sensor_id = event.get("sensor_id")
                if sensor_id and sensor_id in sensor_map:
                    sensor = sensor_map[sensor_id]
                    # Use snake_case field names
                    client = client_map.get(sensor.get("client_id"), {})
                    building = building_map.get(sensor.get("building_id"), {})
                    floor = floor_map.get(sensor.get("floor_id"), {})
                    room = room_map.get(sensor.get("room_id"), {})
                    
                    # Build location path
                    path_parts = []
                    if client.get("name"): path_parts.append(client["name"])
                    if building.get("name"): path_parts.append(building["name"])
                    if floor.get("name"): path_parts.append(floor["name"])
                    if room.get("room_number"): path_parts.append(f"Ch. {room['room_number']}")
                    elif room.get("name"): path_parts.append(room["name"])
                    
                    event["location_path"] = " > ".join(path_parts) if path_parts else None
                    event["location"] = {
                        "client_name": client.get("name"),
                        "building_name": building.get("name"),
                        "floor_name": floor.get("name"),
                        "room_number": room.get("room_number") or room.get("name"),
                        "zone_name": None
                    }
                    # Ajouter le nom et le numéro de série du radar
                    event["radar_name"] = sensor.get("name")
                    event["serial_product"] = sensor.get("serial_product")
                else:
                    event["location_path"] = None
                    event["location"] = None
                    event["radar_name"] = None
                    event["serial_product"] = None
        else:
            # No sensors to enrich
            for event in events:
                event["location_path"] = None
                event["location"] = None
                event["radar_name"] = None
                event["serial_product"] = None
                
    except Exception as e:
        logger.error(f"Failed to enrich events with location: {e}")
        for event in events:
            event["location_path"] = None
            event["location"] = None
            event["radar_name"] = None
            event["serial_product"] = None
    
    # Cache the enriched results for future requests
    if use_cache and events:
        cache_service.set_cached_events(
            events=events,
            tenant_id=cache_tenant_id,
            client_id=cache_client_id,
            filters=cache_filters
        )
    
    return events

@api_router.get("/events/count")
async def count_events(
    site_id: Optional[str] = None,
    status: Optional[EventStatus] = None,
    client_id: Optional[str] = None,
    building_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}

    # RBAC-aware filtering (same logic as /events endpoint)
    user_client_id = current_user.tenant_id

    if current_user.role == "SUPER_ADMIN":
        # Super admin sees everything
        pass
    elif current_user.role in ["TENANT_ADMIN", "SUPERVISOR", "OPERATOR", "VIEWER"]:
        # Check if tenant_id is actually a client_id (new model)
        client_exists = await db.clients.find_one({"id": user_client_id})

        if client_exists:
            # User's tenant_id is a client_id - filter by sensors assigned to this client
            client_sensors = await db.sensors.find(
                {"client_id": user_client_id},
                {"_id": 0, "id": 1}
            ).to_list(10000)
            client_sensor_ids = [s["id"] for s in client_sensors]

            if client_sensor_ids:
                query["sensor_id"] = {"$in": client_sensor_ids}
            else:
                return {"count": 0}
        else:
            # Legacy mode: filter by tenant_id directly
            query["tenant_id"] = user_client_id
    else:
        # Default: filter by tenant_id
        query["tenant_id"] = user_client_id

    # Filter by client/building: find sensors and filter events by sensor_id
    if client_id or building_id:
        sensor_query = {}
        if client_id:
            sensor_query["client_id"] = client_id
        if building_id:
            sensor_query["building_id"] = building_id

        matching_sensors = await db.sensors.find(sensor_query, {"_id": 0, "id": 1}).to_list(1000)
        matching_sensor_ids = [s["id"] for s in matching_sensors]

        if matching_sensor_ids:
            # Merge with existing sensor_id filter if present
            if "sensor_id" in query:
                existing_ids = set(query["sensor_id"]["$in"])
                query["sensor_id"] = {"$in": list(existing_ids & set(matching_sensor_ids))}
            else:
                query["sensor_id"] = {"$in": matching_sensor_ids}
        else:
            return {"count": 0}

    if site_id:
        query["site_id"] = site_id
    if status:
        query["status"] = status

    count = await db.events.count_documents(query)
    return {"count": count}

@api_router.get("/events/{event_id}", response_model=Event)
async def get_event(event_id: str, current_user: UserInDB = Depends(get_current_user)):
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Use helper function for tenant/client access check
    if not await check_event_access(event, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Enrich with location
    try:
        service = get_clients_buildings_service()
        if event.get("sensor_id"):
            location_path = await service.get_event_location_path(event["sensor_id"])
            event["location_path"] = location_path.full_path
            event["location"] = {
                "client_name": location_path.client_name,
                "building_name": location_path.building_name,
                "floor_name": location_path.floor_name,
                "room_number": location_path.room_number,
                "zone_name": location_path.zone_name
            }
    except Exception:
        pass

    return event

@api_router.patch("/events/{event_id}", response_model=Event)
async def update_event(event_id: str, update: EventUpdate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR"])

    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not await check_event_access(event, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build update data (exclude comment/cc_admin - they're action metadata, not event fields)
    update_data = {}
    if update.status is not None:
        # Require comment for RESOLVED and FALSE_ALARM
        if update.status in ("RESOLVED", "FALSE_ALARM") and not update.comment:
            raise HTTPException(status_code=400, detail="Un commentaire est obligatoire pour cette action")
        update_data["status"] = update.status
        # Consign timestamps for statistics
        if update.status == "ACK":
            update_data["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
            update_data["acknowledged_by"] = current_user.full_name
            update_data["acknowledged_by_id"] = current_user.id
        elif update.status in ("RESOLVED", "FALSE_ALARM"):
            update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
            update_data["resolved_by"] = current_user.full_name
            update_data["resolved_by_id"] = current_user.id
    if update.assigned_to is not None:
        update_data["assigned_to"] = update.assigned_to
    if update.assigned_to_name is not None:
        update_data["assigned_to_name"] = update.assigned_to_name
    if update.notes is not None:
        update_data["notes"] = update.notes
    
    # Build comment entry if provided
    comment_entry = None
    if update.comment:
        action = update.status or ("ASSIGNED" if update.assigned_to else "COMMENT")
        comment_entry = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "user_name": current_user.full_name,
            "user_role": current_user.role,
            "text": update.comment,
            "action": action,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    
    # Apply updates
    mongo_update = {}
    if update_data:
        mongo_update["$set"] = update_data
    if comment_entry:
        mongo_update["$push"] = {"comments": comment_entry}
    
    if mongo_update:
        await db.events.update_one({"id": event_id}, mongo_update)
        await log_audit(current_user.id, event['tenant_id'], f"update_{update_data.get('status', 'event')}", "event", event_id, update_data)
        
        # Invalidate cache
        from config.event_cache import get_event_cache_service
        cache_service = get_event_cache_service()
        cache_service.invalidate_tenant_cache(event.get('tenant_id', 'unknown'))
        
        # Broadcast update
        await manager.broadcast_to_tenant(event['tenant_id'], {
            "type": "event_updated",
            "event_id": event_id,
            "update": {**update_data, "comment": comment_entry}
        })
    
    # Send assignment email notification
    if update.assigned_to:
        try:
            assigned_user = await db.users.find_one({"id": update.assigned_to}, {"_id": 0})
            if assigned_user and assigned_user.get("email"):
                from email_service import get_email_service
                email_svc = get_email_service()
                config = await email_svc.get_smtp_config()
                if config and config.get("enabled"):
                    location = event.get("location_path", "Localisation inconnue")
                    sensor_name = event.get("radar_name", event.get("device_id", "Capteur"))
                    subject = f"[OhmGuard] Alerte assignee - {sensor_name}"
                    html_body = f"""
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:#dc2626;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
                            <h2 style="margin:0;">Alerte assignee</h2>
                        </div>
                        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
                            <p>Bonjour <strong>{assigned_user['full_name']}</strong>,</p>
                            <p>Une alerte vous a ete assignee par <strong>{current_user.full_name}</strong> :</p>
                            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Type</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">{event.get('type', 'FALL')}</td></tr>
                                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Capteur</td><td style="padding:8px;border-bottom:1px solid #eee;">{sensor_name}</td></tr>
                                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Localisation</td><td style="padding:8px;border-bottom:1px solid #eee;">{location}</td></tr>
                                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Statut</td><td style="padding:8px;border-bottom:1px solid #eee;">{event.get('fall_status', event.get('status', 'NEW'))}</td></tr>
                                {f'<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Commentaire</td><td style="padding:8px;border-bottom:1px solid #eee;">{update.comment}</td></tr>' if update.comment else ''}
                            </table>
                        </div>
                    </div>
                    """
                    recipients = [assigned_user['email']]
                    # CC site admin if requested
                    if update.cc_admin:
                        admins = await db.users.find({"role": {"$in": ["SUPER_ADMIN", "TENANT_ADMIN"]}, "tenant_id": event.get("tenant_id")}, {"_id": 0, "email": 1}).to_list(10)
                        for a in admins:
                            if a.get("email") and a["email"] not in recipients:
                                recipients.append(a["email"])
                    for email in recipients:
                        try:
                            loop = asyncio.get_event_loop()
                            await loop.run_in_executor(
                                None,
                                lambda e=email: email_svc._send_email_sync(config=config, to_email=e, subject=subject, html_body=html_body)
                            )
                        except Exception as e:
                            logger.warning(f"Failed to send assignment email to {email}: {e}")
        except Exception as e:
            logger.warning(f"Failed to send assignment notification: {e}")
    
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    return updated


@api_router.post("/events/bulk-update")
async def bulk_update_events(update: BulkEventUpdate, current_user: UserInDB = Depends(get_current_user)):
    """Bulk update status for multiple events at once (ACK, RESOLVED, FALSE_ALARM)."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR"])

    if not update.event_ids:
        raise HTTPException(status_code=400, detail="Aucun identifiant d'événement fourni")

    if update.status in ("RESOLVED", "FALSE_ALARM") and not update.comment:
        raise HTTPException(status_code=400, detail="Un commentaire est obligatoire pour cette action")

    success_count = 0
    failed_ids = []
    tenant_ids = set()

    for event_id in update.event_ids:
        try:
            event = await db.events.find_one({"id": event_id}, {"_id": 0})
            if not event:
                failed_ids.append(event_id)
                continue
            if not await check_event_access(event, current_user):
                failed_ids.append(event_id)
                continue

            mongo_update: dict = {"$set": {"status": update.status}}
            if update.comment:
                comment_entry = {
                    "id": str(uuid.uuid4()),
                    "user_id": current_user.id,
                    "user_name": current_user.full_name,
                    "user_role": current_user.role,
                    "text": update.comment,
                    "action": update.status,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                mongo_update["$push"] = {"comments": comment_entry}

            await db.events.update_one({"id": event_id}, mongo_update)
            tenant_ids.add(event.get("tenant_id", "unknown"))
            success_count += 1

            await manager.broadcast_to_tenant(event["tenant_id"], {
                "type": "event_updated",
                "event_id": event_id,
                "update": {"status": update.status}
            })
        except Exception as e:
            logger.warning(f"bulk_update_events: failed on event {event_id}: {e}")
            failed_ids.append(event_id)

    from config.event_cache import get_event_cache_service
    cache_service = get_event_cache_service()
    for tid in tenant_ids:
        cache_service.invalidate_tenant_cache(tid)

    await log_audit(
        current_user.id, current_user.tenant_id,
        f"bulk_update_{update.status}", "events",
        ",".join(update.event_ids),
        {"status": update.status, "count": success_count}
    )

    return {"success_count": success_count, "failed_count": len(failed_ids), "failed_ids": failed_ids}


@api_router.get("/events/{event_id}/comments")
async def get_event_comments(event_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Get comments for an event - admin only."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    event = await db.events.find_one({"id": event_id}, {"_id": 0, "comments": 1, "tenant_id": 1})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not await check_event_access(event, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return event.get("comments", [])

@api_router.get("/users/assignable")
async def list_assignable_users(current_user: UserInDB = Depends(get_current_user)):
    """List users who can be assigned to events."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR"])
    
    query = {"role": {"$in": ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "OPERATOR"]}}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    users = await db.users.find(query, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "role": 1}).to_list(100)
    return users


# ==================== RADAR EVENT ENDPOINTS ====================

@api_router.post("/events/radar")
async def create_radar_event(request: RadarEventRequest):
    """
    Ingest raw radar event payload and create normalized platform event.
    This endpoint is called by MQTT service or external radar integrations.
    
    Body format:
    {
        "payload": {
            "presenceDetected": false,
            "presenceRegionMap": {"0": 0, "1": 0, ...},
            "presenceTargetType": 0,
            "roomPresenceIndication": 0,
            "timestamp": 1768397944445,
            "trackerTargets": []
        },
        "type": 4,
        "deviceId": "device-123"
    }
    """
    # Find sensor by device_id
    sensor = await db.sensors.find_one(
        {"$or": [
            {"device_id": request.deviceId},
            {"serial_product": request.deviceId},
            {"model": request.deviceId}
        ]},
        {"_id": 0}
    )
    
    sensor_id = sensor['id'] if sensor else None
    site_id = sensor['site_id'] if sensor else None
    zone_id = sensor['zone_id'] if sensor else None
    tenant_id = sensor['tenant_id'] if sensor else None
    
    # Normalize the event
    normalized = normalize_radar_event(
        request=request,
        sensor_id=sensor_id,
        site_id=site_id,
        zone_id=zone_id,
        tenant_id=tenant_id
    )
    
    # Prepare document for MongoDB
    event_doc = {
        "id": normalized.id,
        "device_id": normalized.deviceId,
        "sensor_id": normalized.sensorId,
        "site_id": normalized.siteId,
        "zone_id": normalized.zoneId,
        "tenant_id": normalized.tenantId,
        "type": normalized.eventType.value,
        "presence_status": normalized.presenceStatus.value,
        "presence_detected": normalized.presenceDetected,
        "active_regions": normalized.activeRegions,
        "target_count": normalized.targetCount,
        "occurred_at": normalized.occurredAt,
        "raw_timestamp": normalized.rawTimestamp,
        "timestamp": normalized.createdAt,
        "severity": normalized.severity.value,
        "status": normalized.status.value,
        "raw_payload": normalized.rawPayloadJson,
        "confidence": 1.0  # Direct radar events have full confidence
    }
    
    # Store in events collection
    await db.events.insert_one(event_doc)
    
    # Invalidate cache for this tenant
    if tenant_id:
        from config.event_cache import get_event_cache_service
        cache_service = get_event_cache_service()
        cache_service.invalidate_tenant_cache(tenant_id)
    
    # Update sensor last_seen if found
    if sensor:
        await db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": {"status": "ONLINE", "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Enrich with location path for WebSocket broadcast
    location_path_str = None
    location_dict = None
    if sensor and sensor_id:
        try:
            cb_service = get_clients_buildings_service()
            loc = await cb_service.get_event_location_path(sensor_id)
            location_path_str = loc.full_path
            location_dict = {
                "client_name": loc.client_name,
                "building_name": loc.building_name,
                "floor_name": loc.floor_name,
                "room_number": loc.room_number,
                "zone_name": loc.zone_name
            }
        except Exception:
            pass

    # Broadcast to WebSocket if tenant known
    if tenant_id:
        await manager.broadcast_to_tenant(tenant_id, {
            "type": "new_radar_event",
            "event": {
                **event_doc,
                "sensor_name": sensor.get('name') if sensor else None,
                "active_regions_display": format_active_regions_display(normalized.activeRegions),
                "target_count_display": format_target_count_display(normalized.targetCount),
                "location_path": location_path_str,
                "location": location_dict
            }
        })
    
    # Send push notification for FALL events
    if tenant_id and normalized.eventType.value == "FALL":
        push_service = get_push_notification_service()
        if push_service:
            # Build location string
            location_parts = []
            if sensor:
                location_parts.append(sensor.get('name', 'Radar'))
            location = " - ".join(location_parts) if location_parts else "Localisation inconnue"
            
            await push_service.send_fall_alert(
                tenant_id=tenant_id,
                event_id=normalized.id,
                location=location,
                severity=normalized.severity.value,
                sensor_id=sensor.get('id') if sensor else None
            )
            logger.info(f"[Push] Fall alert sent for event {normalized.id}")
    
    logger.info(f"Created radar event {normalized.id} from device {request.deviceId}, type={normalized.eventType.value}")
    
    return {
        "id": normalized.id,
        "eventType": normalized.eventType.value,
        "presenceStatus": normalized.presenceStatus.value,
        "presenceDetected": normalized.presenceDetected,
        "activeRegions": normalized.activeRegions,
        "activeRegionsDisplay": format_active_regions_display(normalized.activeRegions),
        "targetCount": normalized.targetCount,
        "targetCountDisplay": format_target_count_display(normalized.targetCount),
        "occurredAt": normalized.occurredAt,
        "severity": normalized.severity.value,
        "status": normalized.status.value,
        "sensorId": normalized.sensorId,
        "deviceId": normalized.deviceId
    }


@api_router.get("/events/{event_id}/detail")
async def get_event_detail(event_id: str, current_user: UserInDB = Depends(get_current_user)):
    """
    Get detailed event information including raw payload
    """
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Use helper function for tenant/client access check
    if not await check_event_access(event, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Get sensor info
    sensor = None
    if event.get('sensor_id'):
        sensor = await db.sensors.find_one({"id": event['sensor_id']}, {"_id": 0})
    
    # Format response with enriched data
    return {
        **event,
        "sensor_name": sensor.get('name') if sensor else None,
        "sensor_serial": sensor.get('serial_product') if sensor else None,
        "active_regions_display": format_active_regions_display(event.get('active_regions', [])),
        "target_count_display": format_target_count_display(event.get('target_count', 0)),
        "presence_display": "Présence détectée" if event.get('presence_detected') else "Aucune présence"
    }


# ==================== ALERT RULE ENDPOINTS ====================

@api_router.post("/rules", response_model=AlertRule)
async def create_rule(rule: AlertRuleCreate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != rule.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    rule_obj = AlertRule(**rule.model_dump())
    doc = rule_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.alert_rules.insert_one(doc)
    
    await log_audit(current_user.id, rule.tenant_id, "create", "alert_rule", rule_obj.id)
    return rule_obj

@api_router.get("/rules", response_model=List[AlertRule])
async def list_rules(current_user: UserInDB = Depends(get_current_user)):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    rules = await db.alert_rules.find(query, {"_id": 0}).to_list(1000)
    return rules

@api_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    rule = await db.alert_rules.find_one({"id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != rule['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.alert_rules.delete_one({"id": rule_id})
    await log_audit(current_user.id, rule['tenant_id'], "delete", "alert_rule", rule_id)
    
    return {"status": "deleted"}

# ==================== USER MANAGEMENT ====================

@api_router.get("/users", response_model=List[User])
async def list_users(current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    users = await db.users.find(query, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return users

@api_router.patch("/users/{user_id}", response_model=User)
async def update_user(user_id: str, update: UserUpdate, current_user: UserInDB = Depends(get_current_user)):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != user.get('tenant_id'):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
        await log_audit(current_user.id, user.get('tenant_id'), "update", "user", user_id, update_data)
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return updated

# ==================== NOTIFICATION LOG ====================

@api_router.get("/notifications", response_model=List[NotificationLog])
async def list_notifications(
    event_id: Optional[str] = None,
    limit: int = Query(50, le=500),
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    if event_id:
        query["event_id"] = event_id
    
    notifications = await db.notification_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return notifications

# ==================== AUDIT LOG ====================

@api_router.get("/audit-logs")
async def list_audit_logs(
    resource_type: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: UserInDB = Depends(get_current_user)
):
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    if resource_type:
        query["resource_type"] = resource_type
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs

# ==================== STATS ====================

@api_router.get("/stats/overview")
async def get_stats_overview(current_user: UserInDB = Depends(get_current_user)):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    total_events = await db.events.count_documents(query)
    new_events = await db.events.count_documents({**query, "status": "NEW"})
    ack_events = await db.events.count_documents({**query, "status": "ACK"})
    resolved_events = await db.events.count_documents({**query, "status": "RESOLVED"})
    false_alarms = await db.events.count_documents({**query, "status": "FALSE_ALARM"})
    
    sensor_query = query.copy()
    total_sensors = await db.sensors.count_documents(sensor_query)
    online_sensors = await db.sensors.count_documents({**sensor_query, "status": "ONLINE"})
    
    site_query = query.copy()
    total_sites = await db.sites.count_documents(site_query)
    
    return {
        "events": {
            "total": total_events,
            "new": new_events,
            "acknowledged": ack_events,
            "resolved": resolved_events,
            "false_alarms": false_alarms
        },
        "sensors": {
            "total": total_sensors,
            "online": online_sensors
        },
        "sites": {
            "total": total_sites
        }
    }

@api_router.get("/stats/events-by-type")
async def get_events_by_type(current_user: UserInDB = Depends(get_current_user)):
    """Get event distribution by type"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    return [{"type": r["_id"], "count": r["count"]} for r in results]

@api_router.get("/stats/events-by-severity")
async def get_events_by_severity(current_user: UserInDB = Depends(get_current_user)):
    """Get event distribution by severity"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    return [{"severity": r["_id"], "count": r["count"]} for r in results]

@api_router.get("/stats/events-by-status")
async def get_events_by_status(current_user: UserInDB = Depends(get_current_user)):
    """Get event distribution by status"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    return [{"status": r["_id"], "count": r["count"]} for r in results]

@api_router.get("/stats/events-by-site")
async def get_events_by_site(current_user: UserInDB = Depends(get_current_user)):
    """Get event distribution by site"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$site_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    
    # Get site names
    site_ids = [r["_id"] for r in results]
    sites = await db.sites.find({"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    site_map = {s["id"]: s["name"] for s in sites}
    
    return [{"site_id": r["_id"], "site_name": site_map.get(r["_id"], "Unknown"), "count": r["count"]} for r in results]

@api_router.get("/stats/events-timeline")
async def get_events_timeline(
    days: int = Query(7, le=30),
    current_user: UserInDB = Depends(get_current_user)
):
    """Get events count per day for the last N days"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    # Get all events and group by date in Python (MongoDB aggregation with dates is complex)
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    query["timestamp"] = {"$gte": start_date.isoformat()}
    
    events = await db.events.find(query, {"_id": 0, "timestamp": 1, "type": 1}).to_list(10000)
    
    # Group by date - include all event types
    from collections import defaultdict
    daily_counts = defaultdict(lambda: {"total": 0, "FALL": 0, "SENSITIVE_FALL": 0, "PRE_FALL": 0, "BED_EXIT": 0, "PRESENCE": 0, "INACTIVITY": 0, "UNKNOWN": 0})
    
    for event in events:
        date_str = event["timestamp"][:10]  # Extract YYYY-MM-DD
        daily_counts[date_str]["total"] += 1
        event_type = event.get("type", "UNKNOWN")
        # Ensure we handle any event type
        if event_type not in daily_counts[date_str]:
            daily_counts[date_str][event_type] = 0
        daily_counts[date_str][event_type] += 1
    
    # Generate all dates in range
    result = []
    for i in range(days):
        date = start_date + timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        counts = daily_counts.get(date_str, {"total": 0, "FALL": 0, "SENSITIVE_FALL": 0, "PRE_FALL": 0, "BED_EXIT": 0, "PRESENCE": 0, "INACTIVITY": 0, "UNKNOWN": 0})
        result.append({
            "date": date_str,
            "total": counts["total"],
            "fall": counts.get("FALL", 0),
            "sensitive_fall": counts.get("SENSITIVE_FALL", 0),
            "pre_fall": counts.get("PRE_FALL", 0),
            "bed_exit": counts.get("BED_EXIT", 0),
            "presence": counts.get("PRESENCE", 0),
            "inactivity": counts.get("INACTIVITY", 0),
            "unknown": counts.get("UNKNOWN", 0)
        })
    
    return result

@api_router.get("/stats/sensors-status")
async def get_sensors_status(current_user: UserInDB = Depends(get_current_user)):
    """Get sensor status distribution"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.sensors.aggregate(pipeline).to_list(100)
    return [{"status": r["_id"], "count": r["count"]} for r in results]

@api_router.get("/stats/sensors-by-type")
async def get_sensors_by_type(current_user: UserInDB = Depends(get_current_user)):
    """Get sensor distribution by type"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await db.sensors.aggregate(pipeline).to_list(100)
    return [{"type": r["_id"], "count": r["count"]} for r in results]

@api_router.get("/stats/response-time")
async def get_response_time_stats(current_user: UserInDB = Depends(get_current_user)):
    """Get average response time statistics (mock data for demo)"""
    # In real implementation, this would calculate time between event creation and ACK/RESOLVE
    return {
        "avg_ack_time_minutes": 3.5,
        "avg_resolve_time_minutes": 12.8,
        "fastest_response_minutes": 0.5,
        "slowest_response_minutes": 45.2
    }

@api_router.get("/stats/widget")
async def get_widget_stats(current_user: UserInDB = Depends(get_current_user)):
    """Compact stats for widget display"""
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    # Get critical stats
    new_events = await db.events.count_documents({**query, "status": "NEW"})
    high_severity = await db.events.count_documents({**query, "status": "NEW", "severity": "HIGH"})
    online_sensors = await db.sensors.count_documents({**query, "status": "ONLINE"})
    total_sensors = await db.sensors.count_documents(query)
    
    # Recent events (last 5)
    recent = await db.events.find(query, {"_id": 0}).sort("timestamp", -1).limit(5).to_list(5)
    
    return {
        "alerts": {
            "new": new_events,
            "critical": high_severity
        },
        "sensors": {
            "online": online_sensors,
            "total": total_sensors,
            "health_percent": round((online_sensors / total_sensors * 100) if total_sensors > 0 else 0)
        },
        "recent_events": recent
    }

# ==================== CACHE MANAGEMENT ====================

@api_router.get("/cache/stats")
async def get_cache_stats(current_user: UserInDB = Depends(get_current_user)):
    """
    Get cache statistics (hits, misses, hit rate).
    Requires SUPER_ADMIN or TENANT_ADMIN role.
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    from config.event_cache import get_event_cache_service
    cache_service = get_event_cache_service()
    
    return {
        "cache_type": "redis",
        "stats": cache_service.get_stats(),
        "config": {
            "ttl_seconds": 300,
            "max_cached_events": 100
        }
    }

@api_router.post("/cache/invalidate")
async def invalidate_cache(
    scope: str = Query("tenant", description="Scope: 'tenant', 'client', or 'all'"),
    target_id: Optional[str] = Query(None, description="Tenant or Client ID (required for tenant/client scope)"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Manually invalidate event cache.
    - scope='tenant': Invalidate cache for a specific tenant
    - scope='client': Invalidate cache for a specific client
    - scope='all': Invalidate ALL event caches (SUPER_ADMIN only)
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    from config.event_cache import get_event_cache_service
    cache_service = get_event_cache_service()
    
    if scope == "all":
        if current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can invalidate all caches")
        invalidated = cache_service.invalidate_all_events_cache()
        return {"status": "success", "scope": "all", "keys_invalidated": invalidated}
    
    elif scope == "tenant":
        if not target_id:
            # Default to current user's tenant
            target_id = current_user.tenant_id
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != target_id:
            raise HTTPException(status_code=403, detail="Access denied")
        invalidated = cache_service.invalidate_tenant_cache(target_id)
        return {"status": "success", "scope": "tenant", "tenant_id": target_id, "keys_invalidated": invalidated}
    
    elif scope == "client":
        if not target_id:
            raise HTTPException(status_code=400, detail="client_id required for client scope")
        invalidated = cache_service.invalidate_client_cache(target_id)
        return {"status": "success", "scope": "client", "client_id": target_id, "keys_invalidated": invalidated}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid scope. Use 'tenant', 'client', or 'all'")

@api_router.post("/cache/reset-stats")
async def reset_cache_stats(current_user: UserInDB = Depends(get_current_user)):
    """
    Reset cache statistics counters.
    Requires SUPER_ADMIN role.
    """
    check_permission(current_user, ["SUPER_ADMIN"])
    
    from config.event_cache import get_event_cache_service
    cache_service = get_event_cache_service()
    cache_service.reset_stats()
    
    return {"status": "success", "message": "Cache statistics reset"}

# ==================== HEALTH CHECK ====================

@api_router.get("/health")
async def health_check():
    try:
        await client.admin.command('ping')
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    
    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/health/redis")
async def health_redis():
    """
    Check Redis connection health.
    Returns detailed status information about the Redis connection.
    """
    from config.redis import check_redis_health
    return check_redis_health()


@api_router.get("/health/websocket")
async def websocket_health(current_user: UserInDB = Depends(get_current_user)):
    """Get WebSocket connection info with room assignments (admin only)."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    clients = get_connected_clients_info()
    return {
        "total_connected": len(clients),
        "clients": clients
    }


# ==================== SMTP / Email Settings ====================

class SmtpConfig(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = "OhmGuard Alerts"
    use_tls: bool = True
    enabled: bool = False

@api_router.get("/settings/smtp")
async def get_smtp_config(current_user: UserInDB = Depends(get_current_user)):
    """Get SMTP configuration (admin only). Password is masked."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    email_svc = get_email_service()
    if not email_svc:
        raise HTTPException(status_code=503, detail="Email service not available")
    config = await email_svc.get_smtp_config()
    if config:
        # Mask password
        if config.get("password"):
            config["password"] = "••••••••"
        return config
    return {"host": "", "port": 587, "username": "", "password": "", "from_email": "", "from_name": "OhmGuard Alerts", "use_tls": True, "enabled": False}

@api_router.put("/settings/smtp")
async def update_smtp_config(config: SmtpConfig, current_user: UserInDB = Depends(get_current_user)):
    """Update SMTP configuration (admin only)."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    email_svc = get_email_service()
    if not email_svc:
        raise HTTPException(status_code=503, detail="Email service not available")
    
    config_dict = config.model_dump()
    
    # Keep existing password if user didn't change it (masked bullets)
    existing = await email_svc.get_smtp_config()
    pwd = config_dict.get("password", "")
    if existing and (not pwd or all(c == '\u2022' for c in pwd)):
        config_dict["password"] = existing.get("password", "")
    
    await email_svc.save_smtp_config(config_dict)
    return {"success": True, "message": "Configuration SMTP enregistrée"}

@api_router.post("/settings/smtp/test")
async def test_smtp_config(config: SmtpConfig, current_user: UserInDB = Depends(get_current_user)):
    """Test SMTP connection by sending a test email."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    email_svc = get_email_service()
    if not email_svc:
        raise HTTPException(status_code=503, detail="Email service not available")
    
    config_dict = config.model_dump()
    
    # Always use stored password unless user typed a new one (not masked bullets)
    existing = await email_svc.get_smtp_config()
    pwd = config_dict.get("password", "")
    if existing and (not pwd or all(c == '\u2022' for c in pwd) or pwd == existing.get("password")):
        config_dict["password"] = existing.get("password", "")
    
    result = await email_svc.test_connection(config_dict)
    if result["success"]:
        return result
    raise HTTPException(status_code=400, detail=result["error"])

# ==================== Twilio / Telegram Channel Settings ====================

class TwilioConfigRequest(BaseModel):
    account_sid: str = ""
    auth_token: str = ""
    from_number: str = ""
    whatsapp_from_number: str = ""
    enabled: bool = False

class TelegramConfigRequest(BaseModel):
    bot_token: str = ""
    enabled: bool = False

@api_router.get("/settings/twilio")
async def get_twilio_config(current_user: UserInDB = Depends(get_current_user)):
    """Get Twilio configuration (admin only). Secrets are masked."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    config = await db.settings.find_one({"key": "twilio"}, {"_id": 0})
    if config and config.get("value"):
        val = config["value"]
        if val.get("auth_token"):
            val["auth_token"] = "\u2022" * 8
        return val
    return {"account_sid": "", "auth_token": "", "from_number": "", "whatsapp_from_number": "", "enabled": False}

@api_router.put("/settings/twilio")
async def update_twilio_config(config: TwilioConfigRequest, current_user: UserInDB = Depends(get_current_user)):
    """Update Twilio configuration (admin only)."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    config_dict = config.model_dump()
    # Preserve existing auth_token if masked
    existing = await db.settings.find_one({"key": "twilio"}, {"_id": 0})
    if existing and existing.get("value"):
        token = config_dict.get("auth_token", "")
        if not token or all(c == '\u2022' for c in token):
            config_dict["auth_token"] = existing["value"].get("auth_token", "")
    await db.settings.update_one(
        {"key": "twilio"},
        {"$set": {"key": "twilio", "value": config_dict, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    # Reload channel manager config
    from notification_channels import get_channel_manager
    mgr = get_channel_manager()
    if mgr:
        await mgr.reload_configs()
    return {"success": True, "message": "Configuration Twilio enregistrée"}

@api_router.get("/settings/telegram")
async def get_telegram_config(current_user: UserInDB = Depends(get_current_user)):
    """Get Telegram configuration (admin only). Token is masked."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    config = await db.settings.find_one({"key": "telegram"}, {"_id": 0})
    if config and config.get("value"):
        val = config["value"]
        if val.get("bot_token"):
            val["bot_token"] = val["bot_token"][:8] + "\u2022" * 20
        return val
    return {"bot_token": "", "enabled": False}

@api_router.put("/settings/telegram")
async def update_telegram_config(config: TelegramConfigRequest, current_user: UserInDB = Depends(get_current_user)):
    """Update Telegram configuration (admin only)."""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    config_dict = config.model_dump()
    existing = await db.settings.find_one({"key": "telegram"}, {"_id": 0})
    if existing and existing.get("value"):
        token = config_dict.get("bot_token", "")
        if not token or "\u2022" in token:
            config_dict["bot_token"] = existing["value"].get("bot_token", "")
    await db.settings.update_one(
        {"key": "telegram"},
        {"$set": {"key": "telegram", "value": config_dict, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    from notification_channels import get_channel_manager
    mgr = get_channel_manager()
    if mgr:
        await mgr.reload_configs()
    return {"success": True, "message": "Configuration Telegram enregistrée"}

# ==================== Cascade Alert Acknowledgment ====================

@api_router.get("/cascade/{cascade_id}/ack")
async def acknowledge_cascade(cascade_id: str, contact: str, token: str):
    """Acknowledge a cascade alert (unauthenticated, HMAC-verified)."""
    svc = get_cascade_service()
    if not svc:
        raise HTTPException(status_code=503, detail="Service indisponible")
    result = await svc.acknowledge(cascade_id, contact, "link", token)
    if result.get("success"):
        return {"message": result.get("message", "Alerte acquittée"), "acknowledged": True}
    raise HTTPException(status_code=400, detail=result.get("error", "Erreur"))

# ==================== User Email Notification Preferences ====================

@api_router.put("/users/me/notifications")
async def update_notification_preferences(
    prefs: dict,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update current user's notification preferences."""
    update_fields = {}
    if "email_notifications" in prefs:
        update_fields["email_notifications"] = bool(prefs["email_notifications"])
    if "alert_banner_enabled" in prefs:
        update_fields["alert_banner_enabled"] = bool(prefs["alert_banner_enabled"])
    if update_fields:
        await db.users.update_one(
            {"id": current_user.id},
            {"$set": update_fields}
        )
    return {"success": True, **update_fields}

@api_router.get("/users/me/notifications")
async def get_notification_preferences(current_user: UserInDB = Depends(get_current_user)):
    """Get current user's notification preferences."""
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "email_notifications": 1, "email": 1, "alert_banner_enabled": 1})
    return {
        "email_notifications": user.get("email_notifications", False) if user else False,
        "alert_banner_enabled": user.get("alert_banner_enabled", True) if user else True,
        "email": user.get("email", "") if user else ""
    }



@api_router.get("/health/debug")
async def health_debug():
    """
    Detailed health check with environment diagnostics.
    Useful for debugging production deployment issues.
    """
    # Get safe MongoDB URL (hide credentials)
    mongo_url = os.environ.get('MONGO_URL', 'NOT_SET')
    if mongo_url != 'NOT_SET' and '@' in mongo_url:
        safe_mongo = f"...@{mongo_url.split('@')[-1]}"
    else:
        safe_mongo = mongo_url[:30] + '...' if len(mongo_url) > 30 else mongo_url
    
    # Check DB connection
    try:
        await client.admin.command('ping')
        db_status = "connected"
        db_name_actual = db.name
    except Exception as e:
        db_status = f"error: {str(e)}"
        db_name_actual = "unknown"
    
    # Get Socket.IO status
    from socketio_service import get_connected_count
    from config.redis import check_redis_health
    socketio_clients = get_connected_count()
    
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "environment": {
            "is_production": is_production,
            "kubernetes_detected": os.environ.get('KUBERNETES_SERVICE_HOST') is not None,
            "mongo_url_source": "system_env" if _system_mongo_url else "dotenv_file",
            "mongo_url_preview": safe_mongo,
            "db_name": db_name_actual,
        },
        "database": {
            "status": db_status,
            "is_atlas": "mongodb+srv" in (os.environ.get('MONGO_URL') or ''),
        },
        "redis": check_redis_health(),
        "socketio": {
            "connected_clients": socketio_clients,
            "mount_path": "/api/socket.io"
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ==================== ADMIN DATABASE OPERATIONS ====================

@api_router.delete("/admin/events/clear")
async def clear_all_events(current_user: UserInDB = Depends(get_current_user)):
    """
    Clear all events from the database.
    Only SUPER_ADMIN can perform this operation.
    Sensors, users, clients, buildings, etc. are preserved.
    """
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can clear events")
    
    # Count events before deletion
    event_count = await db.events.count_documents({})
    
    # Delete all events
    result = await db.events.delete_many({})
    
    # Invalidate Redis cache
    cache_invalidated = 0
    try:
        from config.event_cache import get_event_cache_service
        cache_service = get_event_cache_service()
        cache_invalidated = cache_service.invalidate_all_events_cache()
        logger.info(f"ADMIN: Invalidated {cache_invalidated} cache keys")
    except Exception as e:
        logger.warning(f"Failed to invalidate cache: {e}")
    
    logger.info(f"ADMIN: Cleared {result.deleted_count} events from database by {current_user.email}")
    
    return {
        "status": "success",
        "message": f"Cleared {result.deleted_count} events",
        "events_deleted": result.deleted_count,
        "previous_count": event_count,
        "cache_invalidated": cache_invalidated
    }

@api_router.get("/admin/stats")
async def get_admin_stats(current_user: UserInDB = Depends(get_current_user)):
    """
    Get detailed database statistics for admin dashboard.
    """
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can view admin stats")
    
    # Count all collections
    events_count = await db.events.count_documents({})
    sensors_count = await db.sensors.count_documents({})
    assigned_sensors = await db.sensors.count_documents({"room_id": {"$ne": None}})
    unassigned_sensors = await db.sensors.count_documents({"room_id": None})
    clients_count = await db.clients.count_documents({})
    buildings_count = await db.buildings.count_documents({})
    floors_count = await db.floors.count_documents({})
    rooms_count = await db.rooms.count_documents({})
    users_count = await db.users.count_documents({})
    
    return {
        "events": events_count,
        "sensors": {
            "total": sensors_count,
            "assigned": assigned_sensors,
            "unassigned": unassigned_sensors
        },
        "clients": clients_count,
        "buildings": buildings_count,
        "floors": floors_count,
        "rooms": rooms_count,
        "users": users_count
    }


# ==================== REAL-TIME PRESENCE STATE ====================

@api_router.get("/presence/sensors")
async def get_sensors_presence_state(current_user: UserInDB = Depends(get_current_user)):
    """
    Get the current real-time presence state for all sensors.
    Returns a map of sensor_id -> presence state for efficient frontend updates.
    
    This endpoint is used by the polling mechanism to update presence badges
    in real-time without relying on historical events.
    """
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    sensors = await db.sensors.find(
        query, 
        {
            "_id": 0, 
            "id": 1, 
            "device_id": 1,
            "name": 1,
            "status": 1,
            "current_presence": 1,
            "current_target_count": 1,
            "current_active_regions": 1,
            "presence_updated_at": 1,
            "last_seen": 1
        }
    ).to_list(1000)
    
    # Build a map for efficient lookup
    presence_map = {}
    for sensor in sensors:
        presence_map[sensor['id']] = {
            "sensor_id": sensor['id'],
            "device_id": sensor.get('device_id'),
            "name": sensor.get('name'),
            "status": sensor.get('status', 'OFFLINE'),
            "presence_detected": sensor.get('current_presence', False),
            "target_count": sensor.get('current_target_count', 0),
            "active_regions": sensor.get('current_active_regions', []),
            "presence_updated_at": sensor.get('presence_updated_at'),
            "last_seen": sensor.get('last_seen'),
            "is_online": sensor.get('status') == 'ONLINE'
        }
    
    return {
        "sensors": presence_map,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ==================== PRESENCE SESSIONS API ====================
# These endpoints provide aggregated presence history (sessions) instead of raw events

from presence_session_service import get_presence_session_service, init_presence_session_service

# Initialize presence session service with db
@app.on_event("startup")
async def init_presence_sessions():
    init_presence_session_service(db)


@api_router.get("/presence-sessions")
async def list_presence_sessions(
    building_id: Optional[str] = None,
    room_id: Optional[str] = None,
    sensor_id: Optional[str] = None,
    status: Optional[str] = Query(None, description="ACTIVE or COMPLETED"),
    date_from: Optional[str] = Query(None, description="ISO date string (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="ISO date string (YYYY-MM-DD)"),
    limit: int = Query(100, le=500),
    skip: int = 0,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get presence sessions (aggregated presence periods).
    A session represents a continuous period of presence detection.
    """
    service = get_presence_session_service()
    
    # Determine tenant - SUPER_ADMIN can see all sessions (tenant_id=None bypasses filter)
    user_client_id = current_user.tenant_id
    if current_user.role == "SUPER_ADMIN":
        if building_id:
            # Filter by building's tenant
            building = await db.buildings.find_one({"id": building_id}, {"_id": 0, "tenant_id": 1, "client_id": 1})
            if building:
                user_client_id = building.get("tenant_id") or building.get("client_id")
        else:
            # SUPER_ADMIN without building filter sees all sessions
            user_client_id = None
    
    # Parse dates
    date_from_dt = None
    date_to_dt = None
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except:
            date_from_dt = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except:
            date_to_dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    
    sessions = await service.get_sessions(
        tenant_id=user_client_id,
        sensor_id=sensor_id,
        building_id=building_id,
        room_id=room_id,
        date_from=date_from_dt,
        date_to=date_to_dt,
        status=status,
        limit=limit,
        skip=skip
    )
    
    return {
        "sessions": sessions,
        "count": len(sessions),
        "filters": {
            "building_id": building_id,
            "room_id": room_id,
            "sensor_id": sensor_id,
            "status": status,
            "date_from": date_from,
            "date_to": date_to
        }
    }


@api_router.get("/presence-sessions/active")
async def get_active_presence_sessions(
    building_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get currently active presence sessions (presence detected, not yet ended).
    """
    service = get_presence_session_service()
    
    # SUPER_ADMIN can see all sessions
    user_client_id = current_user.tenant_id
    if current_user.role == "SUPER_ADMIN":
        if building_id:
            building = await db.buildings.find_one({"id": building_id}, {"_id": 0, "tenant_id": 1, "client_id": 1})
            if building:
                user_client_id = building.get("tenant_id") or building.get("client_id")
        else:
            user_client_id = None  # See all sessions
    
    sessions = await service.get_active_sessions(
        tenant_id=user_client_id,
        building_id=building_id
    )
    
    return {
        "active_sessions": sessions,
        "count": len(sessions)
    }


@api_router.get("/presence-sessions/stats")
async def get_presence_session_stats(
    building_id: Optional[str] = None,
    date_from: Optional[str] = Query(None, description="ISO date string (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="ISO date string (YYYY-MM-DD)"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get aggregated statistics for presence sessions.
    Includes total sessions, total/average duration, min/max duration.
    """
    service = get_presence_session_service()
    
    # SUPER_ADMIN can see all stats
    user_client_id = current_user.tenant_id
    if current_user.role == "SUPER_ADMIN":
        if building_id:
            building = await db.buildings.find_one({"id": building_id}, {"_id": 0, "tenant_id": 1, "client_id": 1})
            if building:
                user_client_id = building.get("tenant_id") or building.get("client_id")
        else:
            user_client_id = None  # See all stats
    
    # Parse dates
    date_from_dt = None
    date_to_dt = None
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except:
            date_from_dt = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except:
            date_to_dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    
    stats = await service.get_session_stats(
        tenant_id=user_client_id,
        building_id=building_id,
        date_from=date_from_dt,
        date_to=date_to_dt
    )
    
    return stats


@api_router.get("/presence-sessions/daily")
async def get_daily_presence_stats(
    building_id: Optional[str] = None,
    days: int = Query(7, le=30, description="Number of days to fetch"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get daily presence session statistics for charts.
    """
    service = get_presence_session_service()
    
    # SUPER_ADMIN can see all daily stats
    user_client_id = current_user.tenant_id
    if current_user.role == "SUPER_ADMIN":
        if building_id:
            building = await db.buildings.find_one({"id": building_id}, {"_id": 0, "tenant_id": 1, "client_id": 1})
            if building:
                user_client_id = building.get("tenant_id") or building.get("client_id")
        else:
            user_client_id = None  # See all daily stats
    
    daily_stats = await service.get_daily_stats(
        tenant_id=user_client_id,
        building_id=building_id,
        days=days
    )
    
    return {
        "daily_stats": daily_stats,
        "days": days
    }


@api_router.get("/presence-sessions/{session_id}")
async def get_presence_session(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get a specific presence session by ID.
    """
    service = get_presence_session_service()
    
    session = await service.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check access
    if current_user.role != "SUPER_ADMIN" and session.get("tenant_id") != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return session


# ==================== LAST STATE API ====================

from last_state_service import get_last_state_service, init_last_state_service

# Initialize last state service with db
@app.on_event("startup")
async def init_last_state():
    init_last_state_service(db)


async def check_building_access(user: UserInDB, building_id: str) -> bool:
    """
    Check if user has access to a building.
    - SUPER_ADMIN: access to all
    - TENANT_ADMIN / ORG_ADMIN: access to all buildings in their tenant
    - SUPERVISOR / OPERATOR: check allowed_building_ids or assignments
    """
    if user.role == "SUPER_ADMIN":
        return True
    
    # Get building to check tenant
    building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
    if not building:
        return False
    
    # Get tenant_id from building or from client
    building_tenant_id = building.get("tenant_id")
    if not building_tenant_id:
        # Try to get tenant from client
        client = await db.clients.find_one({"id": building.get("client_id")}, {"_id": 0})
        if client:
            building_tenant_id = client.get("tenant_id")
    
    # If still no tenant_id, allow access for admins (legacy data)
    if not building_tenant_id:
        if user.role in ["TENANT_ADMIN", "ORG_ADMIN"]:
            return True
        # For other roles, deny access to unassigned buildings
        return False
    
    # Check tenant match
    if building_tenant_id != user.tenant_id:
        return False
    
    # Org/Tenant admins have access to all buildings in their tenant
    if user.role in ["TENANT_ADMIN", "ORG_ADMIN"]:
        return True
    
    # Check allowed_building_ids
    if hasattr(user, 'allowed_building_ids') and user.allowed_building_ids:
        if building_id in user.allowed_building_ids:
            return True
    
    # Check assignments
    assignment = await db.user_assignments.find_one({
        "user_id": user.id,
        "building_id": building_id
    })
    
    return assignment is not None


async def check_floor_access(user: UserInDB, floor_id: str) -> bool:
    """Check if user has access to a floor via building access"""
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        return False
    
    return await check_building_access(user, floor.get("building_id"))


@api_router.get("/last-state/sensors")
async def get_last_state_sensors(
    building_id: Optional[str] = None,
    floor_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get last state of all sensors in a building or floor.
    Uses Redis for fast access with MongoDB fallback.
    """
    if not building_id and not floor_id:
        raise HTTPException(status_code=400, detail="building_id or floor_id is required")
    
    # Determine tenant_id from building or floor
    tenant_id = None
    building = None
    floor = None
    
    if building_id:
        building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        # Get tenant from client
        client = await db.clients.find_one({"id": building.get("client_id")}, {"_id": 0})
        tenant_id = (client.get("tenant_id") if client else None) or building.get("tenant_id") or current_user.tenant_id
    else:
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        # Get building then client
        building = await db.buildings.find_one({"id": floor.get("building_id")}, {"_id": 0})
        if building:
            client = await db.clients.find_one({"id": building.get("client_id")}, {"_id": 0})
            tenant_id = (client.get("tenant_id") if client else None) or floor.get("tenant_id") or current_user.tenant_id
        else:
            tenant_id = floor.get("tenant_id") or current_user.tenant_id
    
    # Final fallback to user's tenant or a default
    if not tenant_id:
        tenant_id = current_user.tenant_id or "default"
    
    # Check access - skip for SUPER_ADMIN
    if current_user.role != "SUPER_ADMIN":
        if building_id:
            if not await check_building_access(current_user, building_id):
                raise HTTPException(status_code=403, detail="Access denied to this building")
        elif floor_id:
            if not await check_floor_access(current_user, floor_id):
                raise HTTPException(status_code=403, detail="Access denied to this floor")
    
    # Get last states
    last_state_service = get_last_state_service()
    
    if building_id:
        states = await last_state_service.get_building_sensors_state(tenant_id, building_id)
        stats = await last_state_service.get_building_stats(tenant_id, building_id)
        
        return {
            "building_id": building_id,
            "building_name": building.get("name") if building else None,
            "tenant_id": tenant_id,
            "sensors_count": stats["total"],
            "online_count": stats["online"],
            "offline_count": stats["offline"],
            "unknown_count": stats["unknown"],
            "sensors": states,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    else:
        states = await last_state_service.get_floor_sensors_state(tenant_id, floor_id)
        stats = await last_state_service.get_floor_stats(tenant_id, floor_id)
        
        # Get floor info
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        
        return {
            "floor_id": floor_id,
            "floor_name": floor.get("name") if floor else None,
            "building_id": floor.get("building_id") if floor else None,
            "tenant_id": tenant_id,
            "sensors_count": stats["total"],
            "online_count": stats["online"],
            "offline_count": stats["offline"],
            "unknown_count": stats["unknown"],
            "sensors": states,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@api_router.get("/last-state/sensor/{sensor_id}")
async def get_last_state_sensor(
    sensor_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get last state of a specific sensor.
    """
    # Get sensor to check access
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    # Check tenant access
    if current_user.role != "SUPER_ADMIN" and sensor.get("tenant_id") != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check building access for non-admin users
    if sensor.get("building_id") and current_user.role not in ["SUPER_ADMIN", "TENANT_ADMIN", "ORG_ADMIN"]:
        if not await check_building_access(current_user, sensor["building_id"]):
            raise HTTPException(status_code=403, detail="Access denied to this sensor's building")
    
    # Get last state
    last_state_service = get_last_state_service()
    state = await last_state_service.get_sensor_state(
        sensor_id=sensor_id,
        tenant_id=sensor.get("tenant_id")
    )
    
    if not state:
        return {
            "sensor_id": sensor_id,
            "status": "unknown",
            "sensor_name": sensor.get("name"),
            "message": "No state data available"
        }
    
    return state


@api_router.post("/last-state/rehydrate")
async def rehydrate_last_state(
    building_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Manually trigger rehydration of Redis cache from MongoDB.
    Admin only.
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    tenant_id = current_user.tenant_id if current_user.role != "SUPER_ADMIN" else None
    
    if building_id:
        # Rehydrate specific building
        building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN" and building.get("tenant_id") != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        tenant_id = building.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id required for SUPER_ADMIN")
    
    last_state_service = get_last_state_service()
    await last_state_service.rehydrate_from_mongo(tenant_id, building_id)
    
    return {"status": "success", "message": f"Rehydrated cache for tenant {tenant_id}"}


@api_router.get("/last-state/stats")
async def get_last_state_stats(
    building_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get aggregated stats for last states.
    """
    tenant_id = current_user.tenant_id if current_user.role != "SUPER_ADMIN" else None
    
    if building_id:
        if not await check_building_access(current_user, building_id):
            raise HTTPException(status_code=403, detail="Access denied")
        
        building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
        if building:
            tenant_id = building.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Cannot determine tenant")
    
    last_state_service = get_last_state_service()
    
    if building_id:
        stats = await last_state_service.get_building_stats(tenant_id, building_id)
        return {
            "building_id": building_id,
            **stats,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    # Get all buildings for tenant
    buildings = await db.buildings.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(100)
    
    all_stats = {"total": 0, "online": 0, "offline": 0, "unknown": 0}
    building_stats = []
    
    for building in buildings:
        stats = await last_state_service.get_building_stats(tenant_id, building["id"])
        all_stats["total"] += stats["total"]
        all_stats["online"] += stats["online"]
        all_stats["offline"] += stats["offline"]
        all_stats["unknown"] += stats["unknown"]
        
        building_stats.append({
            "building_id": building["id"],
            "building_name": building.get("name"),
            **stats
        })
    
    return {
        "tenant_id": tenant_id,
        **all_stats,
        "buildings": building_stats,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ==================== WEBSOCKET ====================

@app.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str, token: Optional[str] = None):
    # Simple token validation for WebSocket
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_tenant = payload.get("tenant_id")
            if user_tenant and user_tenant != tenant_id and payload.get("role") != "SUPER_ADMIN":
                await websocket.close(code=4003)
                return
        except JWTError:
            await websocket.close(code=4001)
            return
    
    await manager.connect(websocket, tenant_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_id)

# ==================== SSE (Server-Sent Events) ====================

@app.get("/api/events/stream/{tenant_id}")
async def events_stream(tenant_id: str, token: str = Query(...)):
    """
    Server-Sent Events endpoint for real-time event streaming.
    More reliable than WebSocket in proxy/Kubernetes environments.
    """
    # Validate token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_tenant = payload.get("tenant_id")
        user_role = payload.get("role")
        if user_tenant and user_tenant != tenant_id and user_role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Access denied")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    async def event_generator():
        queue = asyncio.Queue()
        manager.add_sse_queue(tenant_id, queue)
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connected', 'tenant_id': tenant_id})}\n\n"
            
            while True:
                try:
                    # Wait for events with timeout (for keepalive)
                    message = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(message)}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            manager.remove_sse_queue(tenant_id, queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )

# ==================== SIMULATOR ====================

@api_router.post("/simulator/event")
@api_router.post("/simulate/event")
async def simulate_event(
    sensor_id: str = None,
    device_id: str = None,
    event_type: EventType = "FALL",
    severity: SeverityType = "HIGH",
    confidence: float = 0.95,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Simulate a fall event for testing/demo purposes.
    Accepts either sensor_id (internal) or device_id (MQTT identifier).
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    # Find sensor by sensor_id or device_id
    sensor = None
    if device_id:
        sensor = await db.sensors.find_one(
            {"$or": [{"device_id": device_id}, {"serial_product": device_id}]},
            {"_id": 0}
        )
    elif sensor_id:
        sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found. Provide valid sensor_id or device_id")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    event_obj = Event(
        sensor_id=sensor['id'],
        device_id=sensor.get('device_id'),
        type=event_type,
        confidence=confidence,
        severity=severity,
        tenant_id=sensor['tenant_id'],
        site_id=sensor['site_id'],
        zone_id=sensor['zone_id'],
        raw_payload={"simulated": True, "device_id": sensor.get('device_id')}
    )
    doc = event_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.events.insert_one(doc)
    
    # Broadcast to WebSocket
    await manager.broadcast_to_tenant(sensor['tenant_id'], {
        "type": "new_event",
        "event": doc
    })
    
    return event_obj

# ==================== MQTT CONFIGURATION ====================

MQTT_BROKER_HOST = os.environ.get('MQTT_BROKER_HOST', '38.242.254.49')
MQTT_BROKER_PORT = int(os.environ.get('MQTT_BROKER_PORT', '1883'))
MQTT_ENABLED = os.environ.get('MQTT_ENABLED', 'true').lower() == 'true'

# Seedoo AI Camera MQTT Configuration
SEEDOO_MQTT_HOST = os.environ.get('SEEDOO_MQTT_HOST', '51.91.9.198')
SEEDOO_MQTT_PORT = int(os.environ.get('SEEDOO_MQTT_PORT', '1883'))
SEEDOO_MQTT_ENABLED = os.environ.get('SEEDOO_MQTT_ENABLED', 'true').lower() == 'true'

# ==================== MQTT ENDPOINTS ====================

@api_router.get("/mqtt/status")
async def get_mqtt_status(current_user: UserInDB = Depends(get_current_user)):
    """Get MQTT service status"""
    from mqtt_service import mqtt_service
    from seedoo_mqtt_service import get_seedoo_mqtt_service
    
    seedoo_service = get_seedoo_mqtt_service()
    
    return {
        "enabled": MQTT_ENABLED,
        "broker_host": MQTT_BROKER_HOST,
        "broker_port": MQTT_BROKER_PORT,
        "running": mqtt_service.running if mqtt_service else False,
        "connected": mqtt_service._client is not None if mqtt_service else False,
        "seedoo": {
            "enabled": SEEDOO_MQTT_ENABLED,
            "broker_host": SEEDOO_MQTT_HOST,
            "broker_port": SEEDOO_MQTT_PORT,
            "running": seedoo_service.running if seedoo_service else False,
            "connected": seedoo_service._client is not None if seedoo_service else False,
            "message_count": seedoo_service._message_count if seedoo_service else 0
        }
    }

@api_router.post("/mqtt/register-device")
async def register_mqtt_device(
    device_id: str,
    sensor_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Manually map a MQTT device to an existing sensor"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update sensor with device_id
    await db.sensors.update_one(
        {"id": sensor_id},
        {"$set": {"model": device_id}}
    )
    
    # Clear cache in MQTT service
    from mqtt_service import mqtt_service
    if mqtt_service and device_id in mqtt_service._device_sensor_cache:
        del mqtt_service._device_sensor_cache[device_id]
    
    await log_audit(current_user.id, sensor['tenant_id'], "register_mqtt_device", "sensor", sensor_id, {"device_id": device_id})
    
    return {"status": "ok", "message": f"Device {device_id} mapped to sensor {sensor_id}"}

# ==================== VAYYAR CONFIG ENDPOINTS ====================

class ConfigPayload(BaseModel):
    config: dict
    mqttOptions: Optional[dict] = None

@api_router.get("/devices/{device_id}/config/schema")
async def get_config_schema(device_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Get the default Vayyar configuration schema"""
    # Valider la propriété du tenant sur l'appareil
    sensor = await db.sensors.find_one({"id": device_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Appareil non trouvé")

    if current_user.role != "SUPER_ADMIN":
        # Vérifier tenant_id (ancien modèle) et client_id (nouveau modèle)
        sensor_tenant = sensor.get("tenant_id")
        sensor_client = sensor.get("client_id")
        user_tenant = current_user.tenant_id

        if sensor_tenant != user_tenant and sensor_client != user_tenant:
            # Vérifier aussi l'accès via client_users
            if sensor_client:
                client_user = await db.client_users.find_one({
                    "user_id": current_user.id,
                    "client_id": sensor_client,
                    "is_active": True
                })
                if not client_user:
                    raise HTTPException(status_code=403, detail="Accès refusé")
            else:
                raise HTTPException(status_code=403, detail="Accès refusé")

    return get_default_config_dict()

@api_router.get("/devices/{device_id}/config/latest")
async def get_latest_config(
    device_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get the latest configuration version for a sensor"""

    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")

    # Récupérer les infos du capteur
    sensor = await db.sensors.find_one({"id": device_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Appareil non trouvé")

    # Valider la propriété du tenant
    if current_user.role != "SUPER_ADMIN":
        sensor_tenant = sensor.get("tenant_id")
        sensor_client = sensor.get("client_id")
        user_tenant = current_user.tenant_id

        if sensor_tenant != user_tenant and sensor_client != user_tenant:
            # Vérifier aussi l'accès via client_users
            if sensor_client:
                client_user = await db.client_users.find_one({
                    "user_id": current_user.id,
                    "client_id": sensor_client,
                    "is_active": True
                })
                if not client_user:
                    raise HTTPException(status_code=403, detail="Accès refusé")
            else:
                raise HTTPException(status_code=403, detail="Accès refusé")

    version = await get_vayyar_config_service().get_latest_config(device_id)
    if not version:
        return {
            "config": get_default_config_dict(),
            "isDefault": True,
            "sensorId": device_id,
            "deviceId": sensor.get("device_id") if sensor else None,
            "serialProduct": sensor.get("serial_product") if sensor else None
        }

    return version

@api_router.post("/devices/{device_id}/config/validate")
async def validate_config(
    device_id: str,
    payload: ConfigPayload,
    current_user: UserInDB = Depends(get_current_user)
):
    """Validate a configuration payload"""
    try:
        validated = VayyarConfig(**payload.config)
        return {
            "valid": True,
            "normalized": validated.model_dump(),
            "errors": []
        }
    except Exception as e:
        return {
            "valid": False,
            "normalized": None,
            "errors": [str(e)]
        }

@api_router.post("/devices/{device_id}/config/send")
async def send_config(
    device_id: str,
    payload: ConfigPayload,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send configuration to device via MQTT
    
    device_id here is the platform sensor ID. The service will lookup
    the MQTT device_id from the sensor record.
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    # Validate config
    try:
        validated = VayyarConfig(**payload.config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config: {str(e)}")
    
    # Parse MQTT options
    mqtt_opts = MqttPublishOptions(**(payload.mqttOptions or {}))
    
    try:
        result = await get_vayyar_config_service().publish_config(
            sensor_id=device_id,  # Platform sensor ID
            config=validated.model_dump(),
            options=mqtt_opts,
            tenant_id=current_user.tenant_id
        )
        
        await log_audit(
            current_user.id,
            current_user.tenant_id,
            "send_config",
            "device",
            device_id,
            {"versionNumber": result.versionNumber}
        )
        
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send config: {str(e)}")

@api_router.get("/devices/{device_id}/config/versions")
async def get_config_versions(
    device_id: str,
    limit: int = Query(default=20, le=100),
    skip: int = Query(default=0, ge=0),
    current_user: UserInDB = Depends(get_current_user)
):
    """Get configuration version history"""
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await get_vayyar_config_service().get_config_versions(device_id, limit, skip)

@api_router.post("/devices/{device_id}/config/rollback/{version_number}")
async def rollback_config(
    device_id: str,
    version_number: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Rollback to a specific configuration version"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    try:
        result = await get_vayyar_config_service().rollback_to_version(
            device_id=device_id,
            version_number=version_number,
            tenant_id=current_user.tenant_id
        )
        
        await log_audit(
            current_user.id,
            current_user.tenant_id,
            "rollback_config",
            "device",
            device_id,
            {"toVersion": version_number, "newVersion": result.versionNumber}
        )
        
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@api_router.post("/devices/{device_id}/config/retry/{version_id}")
async def retry_config(
    device_id: str,
    version_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Retry sending a failed configuration"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    try:
        result = await get_vayyar_config_service().retry_send(version_id)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Config Templates
@api_router.get("/config/templates")
async def get_templates(current_user: UserInDB = Depends(get_current_user)):
    """Get all configuration templates"""
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await get_vayyar_config_service().get_templates(current_user.tenant_id)

@api_router.post("/config/templates")
async def create_template(
    name: str,
    payload: ConfigPayload,
    description: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Create a configuration template"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await get_vayyar_config_service().create_template(
        name=name,
        config=payload.config,
        description=description,
        tenant_id=current_user.tenant_id
    )

@api_router.get("/config/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get a specific template"""
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    template = await get_vayyar_config_service().get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@api_router.delete("/config/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete a configuration template"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    if await get_vayyar_config_service().delete_template(template_id):
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Template not found")


class TemplateUpdatePayload(BaseModel):
    """Payload for updating a template"""
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    isSystem: Optional[bool] = None


@api_router.put("/config/templates/{template_id}")
async def update_template(
    template_id: str,
    payload: TemplateUpdatePayload,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update a configuration template"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    result = await get_vayyar_config_service().update_template(
        template_id=template_id,
        name=payload.name,
        description=payload.description,
        config=payload.config,
        is_system=payload.isSystem
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result


class BulkConfigPayload(BaseModel):
    """Payload for bulk config send"""
    device_ids: List[str] = Field(..., description="List of device IDs to send config to")
    config: dict = Field(..., description="Configuration to send")
    mqttOptions: Optional[dict] = None


@api_router.post("/devices/bulk-config")
async def send_bulk_config(
    payload: BulkConfigPayload,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send configuration to multiple devices"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    from vayyar_config_service import MqttPublishOptions
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    if not payload.device_ids:
        raise HTTPException(status_code=400, detail="No devices specified")
    
    options = MqttPublishOptions(**(payload.mqttOptions or {}))
    
    result = await get_vayyar_config_service().send_bulk_config(
        device_ids=payload.device_ids,
        config=payload.config,
        options=options,
        tenant_id=current_user.tenant_id
    )
    
    return result


class CreateTemplatePayload(BaseModel):
    """Payload for creating a template"""
    name: str
    description: Optional[str] = None
    config: dict
    isSystem: Optional[bool] = False


@api_router.post("/config/templates/create")
async def create_template_v2(
    payload: CreateTemplatePayload,
    current_user: UserInDB = Depends(get_current_user)
):
    """Create a configuration template (v2 with proper body)"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    template = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description,
        "config": payload.config,
        "isSystem": payload.isSystem if current_user.role == "SUPER_ADMIN" else False,
        "tenantId": None if payload.isSystem else current_user.tenant_id,
        "createdBy": current_user.id,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    await db.config_templates.insert_one(template)
    return {k: v for k, v in template.items() if k != "_id"}


# ==================== DEVICE COMMANDS ENDPOINTS ====================

class DeviceCommandRequest(BaseModel):
    """Request to send a command to a device"""
    command_type: int = Field(..., description="Command type (1=UploadAppLogs, 2=UploadDevLogs, 3=Reboot, 4=CancelAlarm, 6=RebootUploadLog, 7=CancelFall, 8=UpdateBaseUrl, 10=DownloadFirmware, 16=UpdateWifi)")
    params: Optional[Dict] = Field(default=None, description="Additional parameters for certain commands")


@api_router.post("/devices/{device_id}/command")
async def send_device_command(
    device_id: str,
    request: DeviceCommandRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Send a command to a Vayyar radar device.
    
    Command types:
    - 1: Upload App Logs
    - 2: Upload Dev Logs  
    - 3: Reboot Device
    - 4: Cancel Alarm
    - 6: Reboot + Upload Log
    - 7: Cancel Fall
    - 8: Update Base URL (requires params.baseUrl)
    - 10: Download Firmware (optional params.url, params.version)
    - 16: Update WiFi Credentials (requires params.ssid, params.password) - deprecated
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    try:
        result = await get_vayyar_config_service().send_command(
            sensor_id=device_id,
            command_type=request.command_type,
            params=request.params,
            tenant_id=current_user.tenant_id
        )
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to send command: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send command: {str(e)}")


class BulkCommandRequest(BaseModel):
    """Request model for bulk device commands"""
    device_ids: List[str] = Field(..., description="List of device IDs to send command to")
    command_type: int = Field(..., description="Command type")
    params: Optional[Dict] = Field(default=None, description="Additional parameters")


@api_router.post("/devices/bulk-command")
async def send_bulk_device_command(
    request: BulkCommandRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Send a command to multiple Vayyar radar devices using a single MQTT connection.
    device_ids should be platform sensor IDs (not MQTT device IDs).
    """
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR"])
    
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    bulk_results = await get_vayyar_config_service().send_bulk_commands(
        sensor_ids=request.device_ids,
        command_type=request.command_type,
        params=request.params,
        tenant_id=current_user.tenant_id
    )
    
    return {
        "success": bulk_results["success"],
        "failed": bulk_results["failed"],
        "total": len(request.device_ids),
        "success_count": len(bulk_results["success"]),
        "failed_count": len(bulk_results["failed"])
    }


@api_router.get("/devices/{device_id}/commands/history")
async def get_command_history(
    device_id: str,
    limit: int = Query(20, le=100),
    skip: int = 0,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get command history for a device"""
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await get_vayyar_config_service().get_command_history(device_id, limit, skip)


@api_router.get("/devices/{device_id}/state")
async def get_device_state(
    device_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get the current state of a device (from cache).
    Returns the last received state message from the device.
    """
    
    if not get_vayyar_config_service():
        raise HTTPException(status_code=503, detail="Config service not available")
    
    # First try to get from cache
    state = get_vayyar_config_service().get_device_state(device_id)
    
    if not state:
        # Try to get sensor info from database
        sensor = await db.sensors.find_one(
            {"$or": [{"id": device_id}, {"device_id": device_id}]},
            {"_id": 0}
        )
        if sensor:
            state = {
                "deviceId": sensor.get("device_id", device_id),
                "status": sensor.get("device_status", "unknown"),
                "last_seen": sensor.get("last_seen"),
                "firmware": sensor.get("firmware"),
                "serial_product": sensor.get("serial_product"),
                "hardware": sensor.get("hardware"),
                "temperature": sensor.get("temperature"),
                "cached": False
            }
        else:
            raise HTTPException(status_code=404, detail="Device not found")
    else:
        state["cached"] = True
    
    return state


@api_router.get("/devices/command-types")
async def get_command_types(current_user: UserInDB = Depends(get_current_user)):
    """Get available command types with descriptions"""
    from vayyar_config_schema import COMMAND_TYPES
    return COMMAND_TYPES


@api_router.get("/devices/config-enums")
async def get_config_enums(current_user: UserInDB = Depends(get_current_user)):
    """Get all enum values for configuration fields"""
    from vayyar_config_schema import ENUM_VALUES
    return ENUM_VALUES


# Include the router in the main app
# Create and include Clients & Buildings router
clients_buildings_router = create_clients_buildings_router(
    get_current_user=get_current_user,
    check_permission=check_permission,
    db=db,
    get_password_hash=get_password_hash
)
api_router.include_router(clients_buildings_router)

# Create and include RBAC router
rbac_router = create_rbac_routes(
    get_current_user=get_current_user,
    check_permission=check_permission,
    db=db
)
app.include_router(rbac_router)

app.include_router(api_router)

# Mount Socket.IO at /api/socket.io path
app.mount("/api/socket.io", socket_app)

_cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
if not _cors_origins_raw or _cors_origins_raw.strip() == '*':
    logger.warning(
        "SECURITY WARNING: CORS is configured to allow ALL origins ('*'). "
        "Set the CORS_ORIGINS environment variable to a comma-separated list of allowed origins "
        "before deploying to production (e.g. CORS_ORIGINS=https://app.ohmguard.fr)."
    )
_cors_origins = _cors_origins_raw.split(',') if _cors_origins_raw else ['*']

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def auto_seed_if_empty():
    """
    Auto-seed the database with default admin user and tenant if empty.
    This ensures the application works immediately after deployment.
    """
    try:
        # Check if users exist
        user_count = await db.users.count_documents({})
        if user_count > 0:
            logger.info(f"Database already has {user_count} users, skipping auto-seed")
            return
        
        logger.info("Database is empty, starting auto-seed...")
        
        # Create default tenant
        default_tenant_id = str(uuid.uuid4())
        default_tenant = {
            "id": default_tenant_id,
            "name": "Default Organization",
            "slug": "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        }
        await db.tenants.insert_one(default_tenant)
        logger.info(f"Created default tenant: {default_tenant_id}")
        
        # Create admin user
        admin_password = "admin123"  # Default password - should be changed after first login
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": "admin@ohmguard.io",
            "hashed_password": get_password_hash(admin_password),
            "full_name": "Administrator",
            "role": "SUPER_ADMIN",
            "tenant_id": default_tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Created admin user: admin@ohmguard.io (password: {admin_password})")
        
        # Create a default client for testing
        default_client = {
            "id": str(uuid.uuid4()),
            "name": "OhmCare Demo",
            "tenant_id": default_tenant_id,
            "address": "Demo Address",
            "contact_email": "demo@ohmcare.io",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.insert_one(default_client)
        logger.info("Created default client: OhmCare Demo")
        
        logger.info("Auto-seed completed successfully!")
        
    except Exception as e:
        logger.error(f"Auto-seed failed: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    
    # Auto-seed database if empty (for production deployment)
    await auto_seed_if_empty()

    # Initialize Session service
    init_session_service(db)
    logger.info("Session service initialized")

    # Start session cleanup background task
    async def _session_cleanup_loop():
        while True:
            await asyncio.sleep(3600)  # Every hour
            try:
                svc = get_session_service()
                if svc:
                    await svc.cleanup_expired_sessions()
            except Exception as e:
                logger.error(f"Session cleanup error: {e}")
    asyncio.create_task(_session_cleanup_loop())

    # Initialize Push Notification service
    init_push_notification_service(db)
    logger.info("Push Notification service initialized")
    
    # Initialize Sensor Import service
    init_sensor_import_service(db)
    logger.info("Sensor Import service initialized")
    
    # Initialize AI Sensor service
    init_ai_sensor_service(db)
    logger.info("AI Sensor service initialized")
    
    # Initialize Clients & Buildings service
    init_clients_buildings_service(db)
    logger.info("Clients & Buildings service initialized")
    
    # Initialize Email service
    init_email_service(db)
    logger.info("Email service initialized")

    # Initialize Room Contacts & Cascade services
    init_room_contacts_service(db)
    init_channel_manager(db)
    cascade_svc = init_cascade_service(db)
    cascade_svc.start_escalation_checker()
    logger.info("Room contacts, channel manager & cascade notification services initialized")
    
    # Initialize RBAC service
    rbac_service = init_rbac_service(db)
    await rbac_service.init_permissions_catalog()
    logger.info("RBAC service initialized with permissions catalog")
    
    # Socket.IO broadcast callback for MQTT service
    async def socketio_broadcast(tenant_id: str, message: dict):
        """Broadcast message via Socket.IO with room-based routing"""
        msg_type = message.get('type', '')
        
        if msg_type == 'new_radar_event' or msg_type == 'new_event':
            await broadcast_new_event(tenant_id, message.get('event', message))
        elif msg_type == 'new_ai_event':
            await broadcast_ai_event(message.get('event', message))
        elif msg_type == 'presence_update':
            await broadcast_presence_update(tenant_id, message)
        elif msg_type == 'sensor_status':
            await broadcast_sensor_status(
                tenant_id,
                message.get('sensor_id', ''),
                message.get('status', ''),
                message.get('last_seen', ''),
                building_id=message.get('building_id'),
                floor_id=message.get('floor_id')
            )
        elif msg_type == 'sensor_registered':
            await broadcast_sensor_registered(tenant_id, message.get('sensor', message))
        elif msg_type == 'fall_event_update':
            await broadcast_fall_event_update(tenant_id, message)
        else:
            await broadcast_new_event(tenant_id, message)
    
    # Always initialize Vayyar Config service (DB/template ops available even without MQTT)
    try:
        config_svc = await init_vayyar_config_service(
            db=db,
            broker_host=MQTT_BROKER_HOST,
            broker_port=MQTT_BROKER_PORT,
            start_listener=MQTT_ENABLED
        )
        config_svc.set_broadcast_callback(socketio_broadcast)
        logger.info(f"Vayyar Config service initialized (MQTT listener: {MQTT_ENABLED})")
    except Exception as e:
        logger.error(f"Failed to initialize Vayyar Config service: {e}")

    if MQTT_ENABLED:
        try:
            # Initialize main MQTT service for events with Socket.IO broadcast
            await init_mqtt_service(
                db=db,
                broadcast_callback=socketio_broadcast,  # Use Socket.IO instead of WebSocket
                broker_host=MQTT_BROKER_HOST,
                broker_port=MQTT_BROKER_PORT
            )
            logger.info(f"MQTT service initialized - connected to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}")
        except Exception as e:
            logger.error(f"Failed to initialize MQTT service: {e}")
    else:
        logger.info("MQTT event service disabled")
    
    # Initialize Seedoo MQTT service (separate broker for AI cameras)
    if SEEDOO_MQTT_ENABLED:
        try:
            from seedoo_mqtt_service import start_seedoo_mqtt_service
            await start_seedoo_mqtt_service(
                broker_host=SEEDOO_MQTT_HOST,
                broker_port=SEEDOO_MQTT_PORT,
                db=db,
                broadcast_callback=socketio_broadcast
            )
            logger.info(f"Seedoo MQTT service initialized - connected to {SEEDOO_MQTT_HOST}:{SEEDOO_MQTT_PORT}")
        except Exception as e:
            logger.error(f"Failed to initialize Seedoo MQTT service: {e}")
    else:
        logger.info("Seedoo MQTT service disabled")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Cleanup on shutdown"""
    await stop_vayyar_config_service()
    if MQTT_ENABLED:
        await stop_mqtt_service()
    
    if SEEDOO_MQTT_ENABLED:
        from seedoo_mqtt_service import stop_seedoo_mqtt_service
        await stop_seedoo_mqtt_service()
        logger.info("MQTT services stopped")
    client.close()
