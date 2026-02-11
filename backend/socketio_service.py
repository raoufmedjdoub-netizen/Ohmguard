"""
Socket.IO Service for OhmGuard
Handles real-time communication with room-based filtering.

Room hierarchy:
- admin_all: SUPER_ADMIN receives ALL events
- tenant_{tenant_id}: TENANT_ADMIN receives all events for their tenant
- building_{building_id}: Scoped users receive events for their assigned buildings
- floor_{floor_id}: Fine-grained filtering by floor

Events emitted:
- new_event: New radar event (fall, presence, etc.)
- presence_update: Presence state change for a sensor
- sensor_status: Sensor online/offline status change
- sensor_registered: New sensor auto-registered

Events received:
- join_rooms: Client joins rooms based on their role and permissions
- leave_rooms: Client leaves all rooms
"""
import socketio
import logging
import jwt
import os
from typing import Optional, Dict, Any, List
from bson import ObjectId
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")

def sanitize_for_json(obj):
    """Recursively convert MongoDB ObjectId to string for JSON serialization."""
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items() if k != '_id'}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(sanitize_for_json(item) for item in obj)
    else:
        return obj


# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[],
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e6
)

socket_app = socketio.ASGIApp(sio, socketio_path='')

# Track connected clients: sid -> { user_id, role, tenant_id, rooms }
client_sessions: Dict[str, Dict] = {}


def _decode_token(token: str) -> Optional[Dict]:
    """Decode JWT token to get user info."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception as e:
        logger.warning(f"JWT decode failed: {e}")
        return None


@sio.event
async def connect(sid, environ, auth):
    """Handle client connection."""
    logger.info(f"Client connected: {sid}")
    return True


@sio.event
async def disconnect(sid):
    """Handle client disconnection - leave all rooms."""
    session = client_sessions.pop(sid, None)
    if session:
        for room in session.get('rooms', []):
            await sio.leave_room(sid, room)
        logger.info(f"Client {sid} ({session.get('email','?')}) disconnected, left {len(session.get('rooms',[]))} rooms")


@sio.event
async def join_tenant(sid, data):
    """
    Legacy join_tenant handler - redirects to join_rooms logic.
    Kept for backward compatibility.
    """
    return await join_rooms(sid, data)


@sio.event
async def join_rooms(sid, data):
    """
    Client joins rooms based on their role and location scopes.
    Expected data: {"tenant_id": "xxx", "token": "jwt_token"}
    
    Room assignment:
    - SUPER_ADMIN -> admin_all + tenant_{id}
    - TENANT_ADMIN -> tenant_{id}
    - SUPERVISOR/OPERATOR/VIEWER -> building_{id} rooms from location_scopes
    """
    token = data.get('token')
    tenant_id = data.get('tenant_id')

    if not token or not tenant_id:
        return {"success": False, "error": "token and tenant_id required"}

    # Decode JWT to get user info
    payload = _decode_token(token)
    if not payload:
        return {"success": False, "error": "invalid token"}

    user_id = payload.get('sub')
    role = payload.get('role', 'VIEWER')

    rooms = []

    if role == 'SUPER_ADMIN':
        # Super admin sees everything
        rooms.append('admin_all')
        rooms.append(f'tenant_{tenant_id}')
    elif role == 'TENANT_ADMIN':
        # Tenant admin sees everything in their tenant
        rooms.append(f'tenant_{tenant_id}')
    else:
        # Scoped users: look up their location_scopes in DB
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'test_database')
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]

            # Find user's location scopes
            scopes = await db.location_scopes.find(
                {"client_user_id": user_id},
                {"_id": 0, "building_id": 1, "floor_id": 1}
            ).to_list(100)

            if scopes:
                building_ids = set()
                for scope in scopes:
                    bid = scope.get('building_id')
                    if bid:
                        building_ids.add(bid)
                        rooms.append(f'building_{bid}')
                    fid = scope.get('floor_id')
                    if fid:
                        rooms.append(f'floor_{fid}')
                logger.info(f"User {user_id} ({role}) scoped to {len(building_ids)} buildings")
            else:
                # No specific scopes: fall back to tenant room (see all tenant events)
                rooms.append(f'tenant_{tenant_id}')
                logger.info(f"User {user_id} ({role}) has no scopes, falling back to tenant room")

            client.close()
        except Exception as e:
            logger.error(f"Error loading location scopes for {user_id}: {e}")
            # Fallback to tenant room on error
            rooms.append(f'tenant_{tenant_id}')

    # Join all rooms
    for room in rooms:
        await sio.enter_room(sid, room)

    # Store session info
    client_sessions[sid] = {
        'user_id': user_id,
        'email': payload.get('email', ''),
        'role': role,
        'tenant_id': tenant_id,
        'rooms': rooms,
        'joined_at': datetime.now(timezone.utc).isoformat()
    }

    logger.info(f"Client {sid} ({role}) joined rooms: {rooms}")

    await sio.emit('joined', {
        'tenant_id': tenant_id,
        'rooms': rooms,
        'role': role,
        'message': f'Joined {len(rooms)} room(s)'
    }, room=sid)

    return {"success": True, "rooms": rooms}


@sio.event
async def leave_tenant(sid, data):
    """Client leaves all rooms."""
    session = client_sessions.pop(sid, None)
    if session:
        for room in session.get('rooms', []):
            await sio.leave_room(sid, room)
    return {"success": True}


# ==================== Broadcast Functions ====================

async def broadcast_new_event(tenant_id: str, event: Dict[str, Any]):
    """Broadcast a new radar event to relevant rooms."""
    clean_event = sanitize_for_json(event)
    payload = {'type': 'new_event', 'event': clean_event}

    await _broadcast_to_rooms(tenant_id, clean_event, 'new_event', payload)


async def broadcast_presence_update(tenant_id: str, data: Dict[str, Any]):
    """Broadcast presence state update to relevant rooms."""
    clean_data = sanitize_for_json(data)
    payload = {'type': 'presence_update', **clean_data}

    await _broadcast_to_rooms(tenant_id, clean_data, 'presence_update', payload)


async def broadcast_sensor_status(tenant_id: str, sensor_id: str, status: str, last_seen: str, building_id: str = None, floor_id: str = None):
    """Broadcast sensor status change to relevant rooms."""
    payload = {
        'type': 'sensor_status',
        'sensor_id': str(sensor_id) if sensor_id else sensor_id,
        'status': status,
        'last_seen': last_seen
    }

    # Build data dict with location info for room routing
    data = {**payload, 'building_id': building_id, 'floor_id': floor_id}
    await _broadcast_to_rooms(tenant_id, data, 'sensor_status', payload)


async def broadcast_sensor_registered(tenant_id: str, sensor: Dict[str, Any]):
    """Broadcast new sensor registration to relevant rooms."""
    clean_sensor = sanitize_for_json(sensor)
    payload = {'type': 'sensor_registered', 'sensor': clean_sensor}

    await _broadcast_to_rooms(tenant_id, clean_sensor, 'sensor_registered', payload)


async def broadcast_fall_event_update(tenant_id: str, data: Dict[str, Any]):
    """Broadcast fall event status update to relevant rooms."""
    clean_data = sanitize_for_json(data)
    payload = {'type': 'fall_event_update', **clean_data}
    await _broadcast_to_rooms(tenant_id, clean_data, 'fall_event_update', payload)


async def broadcast_ai_event(event: Dict[str, Any]):
    """Broadcast a new AI camera event to all connected clients."""
    clean_event = sanitize_for_json(event)
    payload = {'type': 'new_ai_event', 'event': clean_event}
    # AI events go to all clients (no tenant scoping for now)
    await sio.emit('new_ai_event', payload, room='admin_all')
    # Also emit to the specific tenant room if tenant_id is available
    tenant_id = clean_event.get('client_id')
    if tenant_id:
        await sio.emit('new_ai_event', payload, room=f'tenant_{tenant_id}')


async def broadcast_to_all(event_name: str, data: Dict[str, Any]):
    """Broadcast to all connected clients (for super admin notifications)."""
    clean_data = sanitize_for_json(data)
    await sio.emit(event_name, clean_data)


async def _broadcast_to_rooms(tenant_id: str, data: Dict[str, Any], event_name: str, payload: Dict[str, Any]):
    """
    Internal: broadcast to the right rooms based on location data.
    
    Always sends to:
    - admin_all (super admins)
    - tenant_{tenant_id} (tenant admins)
    
    If building_id available:
    - building_{building_id} (scoped users)
    
    If floor_id available:
    - floor_{floor_id} (floor-scoped users)
    """
    # Always notify super admins and tenant admins
    await sio.emit(event_name, payload, room='admin_all')
    await sio.emit(event_name, payload, room=f'tenant_{tenant_id}')

    # Building-level room
    building_id = data.get('building_id')
    if building_id:
        await sio.emit(event_name, payload, room=f'building_{building_id}')

    # Floor-level room
    floor_id = data.get('floor_id')
    if floor_id:
        await sio.emit(event_name, payload, room=f'floor_{floor_id}')


def get_connected_count(tenant_id: Optional[str] = None) -> int:
    """Get count of connected clients."""
    if tenant_id:
        return sum(1 for s in client_sessions.values() if s.get('tenant_id') == tenant_id)
    return len(client_sessions)


def get_connected_clients_info() -> List[Dict]:
    """Get info about all connected clients (for admin dashboard)."""
    return [
        {
            'sid': sid,
            'user_id': s.get('user_id'),
            'email': s.get('email'),
            'role': s.get('role'),
            'rooms': s.get('rooms', []),
            'joined_at': s.get('joined_at')
        }
        for sid, s in client_sessions.items()
    ]
