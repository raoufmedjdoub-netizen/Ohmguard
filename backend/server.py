from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import json
import asyncio

# Configure logging early
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent

# =============================================================================
# ENVIRONMENT VARIABLE LOADING STRATEGY (Critical for Production)
# =============================================================================
# In Kubernetes/production: Environment variables are injected directly by the platform.
# We should NEVER override them with values from .env file.
# 
# Strategy:
# 1. Check if MONGO_URL is already set in the system environment BEFORE loading .env
# 2. Only load .env if running locally (MONGO_URL not pre-set and no K8s indicators)
# =============================================================================

# Capture system env vars BEFORE any .env loading
_system_mongo_url = os.environ.get('MONGO_URL')
_kubernetes_detected = os.environ.get('KUBERNETES_SERVICE_HOST') is not None
_is_atlas_url = _system_mongo_url.startswith('mongodb+srv') if _system_mongo_url else False

# Debug logging for production troubleshooting
logger.info(f"[ENV DEBUG] KUBERNETES_SERVICE_HOST detected: {_kubernetes_detected}")
logger.info(f"[ENV DEBUG] MONGO_URL pre-set in system env: {bool(_system_mongo_url)}")
logger.info(f"[ENV DEBUG] MONGO_URL is Atlas (mongodb+srv): {_is_atlas_url}")

# Determine if we're in production
# Production = Kubernetes OR Atlas URL already set OR running in Emergent deployment
is_production = _kubernetes_detected or _is_atlas_url or _system_mongo_url is not None

if not is_production:
    # Only load .env in local development when MONGO_URL is NOT set
    env_path = ROOT_DIR / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=False)  # CRITICAL: override=False preserves existing env vars
        logger.info(f"[ENV] Loaded .env file (development mode) from {env_path}")
    else:
        logger.info(f"[ENV] No .env file found at {env_path}, using system environment only")
else:
    logger.info(f"[ENV] Production mode detected - using system environment variables only")
    logger.info(f"[ENV] .env file will NOT be loaded to prevent override of production values")

# MQTT Service import
from mqtt_service import init_mqtt_service, stop_mqtt_service

# Socket.IO Service import
from socketio_service import (
    sio, socket_app,
    broadcast_new_event, broadcast_presence_update,
    broadcast_sensor_status, broadcast_sensor_registered
)

# Vayyar Config Service import
from vayyar_config_service import (
    init_vayyar_config_service, stop_vayyar_config_service,
    vayyar_config_service, VayyarConfigService
)
from vayyar_config_schema import (
    VayyarConfig, MqttPublishOptions, ConfigVersionResponse,
    get_default_config_dict
)

# Clients & Buildings imports
from clients_buildings_service import init_clients_buildings_service, get_clients_buildings_service
from clients_buildings_routes import create_clients_buildings_router

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
SECRET_KEY = os.environ.get('JWT_SECRET', 'ohmguard-super-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI(title="OhmGuard API", version="1.0.0")

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
EventType = Literal["FALL", "PRE_FALL", "PRESENCE", "INACTIVITY", "UNKNOWN"]
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

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
    notes: Optional[str] = None

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
    notes: Optional[str] = None
    # Location fields (enriched from sensor assignment)
    location_path: Optional[str] = None
    location: Optional[dict] = None

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
    resource_id: str
    details: dict = {}
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== HELPER FUNCTIONS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
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

async def log_audit(user_id: str, tenant_id: Optional[str], action: str, resource_type: str, resource_id: str, details: dict = {}):
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
async def login(login_data: LoginRequest):
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user['hashed_password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.get('is_active', True):
        raise HTTPException(status_code=400, detail="User is inactive")
    
    access_token = create_access_token(
        data={"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role']}
    )
    refresh_token = create_refresh_token(
        data={"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role']}
    )
    
    await log_audit(user['id'], user.get('tenant_id'), "login", "user", user['id'])
    
    return Token(access_token=access_token, refresh_token=refresh_token)

@api_router.post("/auth/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        access_token = create_access_token(
            data={"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role']}
        )
        new_refresh_token = create_refresh_token(
            data={"sub": user['id'], "tenant_id": user.get('tenant_id'), "role": user['role']}
        )
        return Token(access_token=access_token, refresh_token=new_refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    return User(**current_user.model_dump())

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
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if current_user.role != "SUPER_ADMIN":
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
    
    await log_audit(current_user.id, sensor['tenant_id'], "rotate_key", "sensor", sensor_id)
    return {"api_key": new_key}

# ==================== RADAR ASSIGNMENT ENDPOINTS ====================

class RadarAssignment(BaseModel):
    client_id: str
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    room_space_id: Optional[str] = None

@api_router.post("/radars/{radar_id}/assign")
async def assign_radar(radar_id: str, assignment: RadarAssignment, current_user: UserInDB = Depends(get_current_user)):
    """Assign a radar to a location (client/building/floor/room/space)"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    sensor = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Radar not found")
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != sensor['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verify client exists
    client = await db.clients.find_one({"id": assignment.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Update sensor with assignment
    update_data = {
        "client_id": assignment.client_id,
        "building_id": assignment.building_id,
        "floor_id": assignment.floor_id,
        "room_id": assignment.room_id,
        "room_space_id": assignment.room_space_id,
        "assignment_status": "ASSIGNED"
    }
    
    await db.sensors.update_one({"id": radar_id}, {"$set": update_data})
    
    await log_audit(current_user.id, sensor['tenant_id'], "assign", "sensor", radar_id)
    
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
    
    # Clear assignment
    update_data = {
        "client_id": None,
        "building_id": None,
        "floor_id": None,
        "room_id": None,
        "room_space_id": None,
        "assignment_status": "PENDING"
    }
    
    await db.sensors.update_one({"id": radar_id}, {"$set": update_data})
    
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
async def device_heartbeat(api_key: str = Query(...)):
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
async def device_create_event(event: EventCreate, api_key: str = Query(...)):
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
    event_type: Optional[EventType] = None,
    status: Optional[EventStatus] = None,
    severity: Optional[SeverityType] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(50, le=500),
    skip: int = 0,
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
    
    if site_id:
        query["site_id"] = site_id
    if zone_id:
        query["zone_id"] = zone_id
    if sensor_id:
        query["sensor_id"] = sensor_id
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
    
    events = await db.events.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Optimized batch enrichment to avoid N+1 queries
    try:
        # Collect unique sensor IDs
        sensor_ids = list(set(e.get("sensor_id") for e in events if e.get("sensor_id")))
        
        if sensor_ids:
            # Batch fetch all sensors
            sensors = await db.sensors.find(
                {"id": {"$in": sensor_ids}},
                {"_id": 0, "id": 1, "client_id": 1, "building_id": 1, "floor_id": 1, "room_id": 1, "room_space_id": 1}
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
                else:
                    event["location_path"] = None
                    event["location"] = None
        else:
            # No sensors to enrich
            for event in events:
                event["location_path"] = None
                event["location"] = None
                
    except Exception as e:
        logger.error(f"Failed to enrich events with location: {e}")
        for event in events:
            event["location_path"] = None
            event["location"] = None
    
    return events

@api_router.get("/events/count")
async def count_events(
    site_id: Optional[str] = None,
    status: Optional[EventStatus] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    query = {}
    if current_user.role != "SUPER_ADMIN":
        query["tenant_id"] = current_user.tenant_id
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
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != event['tenant_id']:
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
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != event['tenant_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.events.update_one({"id": event_id}, {"$set": update_data})
        await log_audit(current_user.id, event['tenant_id'], f"update_{update_data.get('status', 'event')}", "event", event_id, update_data)
        
        # Broadcast update
        await manager.broadcast_to_tenant(event['tenant_id'], {
            "type": "event_updated",
            "event_id": event_id,
            "update": update_data
        })
    
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    return updated

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
    
    # Update sensor last_seen if found
    if sensor:
        await db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": {"status": "ONLINE", "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Broadcast to WebSocket if tenant known
    if tenant_id:
        await manager.broadcast_to_tenant(tenant_id, {
            "type": "new_radar_event",
            "event": {
                **event_doc,
                "sensor_name": sensor.get('name') if sensor else None,
                "active_regions_display": format_active_regions_display(normalized.activeRegions),
                "target_count_display": format_target_count_display(normalized.targetCount)
            }
        })
    
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
    
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != event.get('tenant_id'):
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
    daily_counts = defaultdict(lambda: {"total": 0, "FALL": 0, "PRE_FALL": 0, "PRESENCE": 0, "INACTIVITY": 0, "UNKNOWN": 0})
    
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
        counts = daily_counts.get(date_str, {"total": 0, "FALL": 0, "PRE_FALL": 0, "PRESENCE": 0, "INACTIVITY": 0, "UNKNOWN": 0})
        result.append({
            "date": date_str,
            "total": counts["total"],
            "fall": counts.get("FALL", 0),
            "pre_fall": counts.get("PRE_FALL", 0),
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
    
    logger.info(f"ADMIN: Cleared {result.deleted_count} events from database by {current_user.email}")
    
    return {
        "status": "success",
        "message": f"Cleared {result.deleted_count} events",
        "events_deleted": result.deleted_count,
        "previous_count": event_count
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

# ==================== MQTT ENDPOINTS ====================

@api_router.get("/mqtt/status")
async def get_mqtt_status(current_user: UserInDB = Depends(get_current_user)):
    """Get MQTT service status"""
    from mqtt_service import mqtt_service
    
    return {
        "enabled": MQTT_ENABLED,
        "broker_host": MQTT_BROKER_HOST,
        "broker_port": MQTT_BROKER_PORT,
        "running": mqtt_service.running if mqtt_service else False,
        "connected": mqtt_service._client is not None if mqtt_service else False
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
async def get_config_schema(current_user: UserInDB = Depends(get_current_user)):
    """Get the default Vayyar configuration schema"""
    return get_default_config_dict()

@api_router.get("/devices/{device_id}/config/latest")
async def get_latest_config(
    device_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get the latest configuration version for a sensor"""
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    # Get sensor info to show device_id
    sensor = await db.sensors.find_one({"id": device_id}, {"_id": 0})
    
    version = await vayyar_config_service.get_latest_config(device_id)
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
    
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    # Validate config
    try:
        validated = VayyarConfig(**payload.config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config: {str(e)}")
    
    # Parse MQTT options
    mqtt_opts = MqttPublishOptions(**(payload.mqttOptions or {}))
    
    try:
        result = await vayyar_config_service.publish_config(
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
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await vayyar_config_service.get_config_versions(device_id, limit, skip)

@api_router.post("/devices/{device_id}/config/rollback/{version_number}")
async def rollback_config(
    device_id: str,
    version_number: int,
    current_user: UserInDB = Depends(get_current_user)
):
    """Rollback to a specific configuration version"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    try:
        result = await vayyar_config_service.rollback_to_version(
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
    
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    try:
        result = await vayyar_config_service.retry_send(version_id)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Config Templates
@api_router.get("/config/templates")
async def get_templates(current_user: UserInDB = Depends(get_current_user)):
    """Get all configuration templates"""
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await vayyar_config_service.get_templates(current_user.tenant_id)

@api_router.post("/config/templates")
async def create_template(
    name: str,
    payload: ConfigPayload,
    description: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Create a configuration template"""
    check_permission(current_user, ["SUPER_ADMIN", "TENANT_ADMIN"])
    
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    return await vayyar_config_service.create_template(
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
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    template = await vayyar_config_service.get_template(template_id)
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
    
    from vayyar_config_service import vayyar_config_service
    
    if not vayyar_config_service:
        raise HTTPException(status_code=503, detail="Config service not available")
    
    if await vayyar_config_service.delete_template(template_id):
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Template not found")

# Include the router in the main app
# Create and include Clients & Buildings router
clients_buildings_router = create_clients_buildings_router(
    get_current_user=get_current_user,
    check_permission=check_permission,
    db=db,
    pwd_context=pwd_context
)
api_router.include_router(clients_buildings_router)

app.include_router(api_router)

# Mount Socket.IO at /api/socket.io path
from socketio_service import socket_app
app.mount("/api/socket.io", socket_app)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
            "password_hash": pwd_context.hash(admin_password),
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
        logger.info(f"Created default client: OhmCare Demo")
        
        logger.info("Auto-seed completed successfully!")
        
    except Exception as e:
        logger.error(f"Auto-seed failed: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    
    # Auto-seed database if empty (for production deployment)
    await auto_seed_if_empty()
    
    # Initialize Clients & Buildings service
    init_clients_buildings_service(db)
    logger.info("Clients & Buildings service initialized")
    
    # Socket.IO broadcast callback for MQTT service
    async def socketio_broadcast(tenant_id: str, message: dict):
        """Broadcast message via Socket.IO instead of WebSocket"""
        msg_type = message.get('type', '')
        
        if msg_type == 'new_radar_event' or msg_type == 'new_event':
            await broadcast_new_event(tenant_id, message.get('event', message))
        elif msg_type == 'presence_update':
            await broadcast_presence_update(tenant_id, message)
        elif msg_type == 'sensor_status':
            await broadcast_sensor_status(
                tenant_id,
                message.get('sensor_id', ''),
                message.get('status', ''),
                message.get('last_seen', '')
            )
        elif msg_type == 'sensor_registered':
            await broadcast_sensor_registered(tenant_id, message.get('sensor', message))
        else:
            # Fallback: broadcast as generic event
            await broadcast_new_event(tenant_id, message)
    
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
            
            # Initialize Vayyar Config service
            config_svc = await init_vayyar_config_service(
                db=db,
                broker_host=MQTT_BROKER_HOST,
                broker_port=MQTT_BROKER_PORT
            )
            config_svc.set_broadcast_callback(socketio_broadcast)  # Use Socket.IO
            logger.info("Vayyar Config service initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize MQTT services: {e}")
    else:
        logger.info("MQTT services disabled")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Cleanup on shutdown"""
    if MQTT_ENABLED:
        await stop_mqtt_service()
        await stop_vayyar_config_service()
        logger.info("MQTT services stopped")
    client.close()
