"""
Socket.IO Service for OhmGuard
Handles real-time communication with room-based filtering.

Room hierarchy:
- admin_all: SUPER_ADMIN receives ALL events
- tenant_{tenant_id}: TENANT_ADMIN receives all events for their tenant
- building_{building_id}: Scoped users receive events for their assigned buildings
- floor_{floor_id}: Fine-grained filtering by floor
- sensor_{sensor_id}: Clients currently displaying a sensor's live positions

Events emitted:
- new_event: New radar event (fall, presence, etc.)
- presence_update: Presence state change for a sensor
- sensor_status: Sensor online/offline status change
- sensor_registered: New sensor auto-registered
- target_positions: Live positions of people tracked by a sensor (sensor_{id} room only)

Events received:
- join_rooms: Client joins rooms based on their role and permissions
- leave_rooms: Client leaves all rooms
- watch_sensor / unwatch_sensor: Start/stop receiving a sensor's live positions
"""
import socketio
import logging
import jwt
import os
from typing import Optional, Dict, Any, List
from bson import ObjectId
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Same secret as server.py (which refuses to start without it) — no insecure fallback here
JWT_SECRET = os.environ.get("JWT_SECRET")

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

# Database handle (set at startup) for user/scope/sensor lookups
_db = None


def set_database(db):
    global _db
    _db = db


def _decode_token(token: str) -> Optional[Dict]:
    """Decode JWT token to get user info."""
    if not JWT_SECRET:
        logger.error("JWT_SECRET is not set: refusing Socket.IO authentication")
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception as e:
        logger.warning(f"JWT decode failed: {e}")
        return None


async def _authenticate(token: Optional[str]) -> Optional[Dict]:
    """
    Authenticate a Socket.IO client the same way REST endpoints do (get_current_user):
    valid signature + active session (jti) + user still present in the database.
    Returns {user_id, email, role, tenant_id, jti} from the database, never from client-provided data.
    """
    if not token:
        return None
    payload = _decode_token(token)
    if not payload or not payload.get('sub'):
        return None

    # Session must still be active (revoked / expired sessions cannot join rooms)
    from session_service import get_session_service
    session_svc = get_session_service()
    jti = payload.get('jti')
    if session_svc:
        if not jti or not await session_svc.validate_session(jti):
            logger.info(f"Socket.IO auth refused for {payload.get('sub')}: session invalid or revoked")
            return None

    identity = {
        'user_id': payload['sub'],
        'email': payload.get('email', ''),
        'role': payload.get('role', 'VIEWER'),
        'tenant_id': payload.get('tenant_id'),
        'jti': jti,
    }

    # Role and tenant come from the database (source of truth), the token only identifies the user
    if _db is not None:
        user = await _db.users.find_one(
            {"id": payload['sub']}, {"_id": 0, "email": 1, "role": 1, "tenant_id": 1}
        )
        if not user:
            return None
        identity['email'] = user.get('email', identity['email'])
        identity['role'] = user.get('role', identity['role'])
        identity['tenant_id'] = user.get('tenant_id')

    return identity


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
    Kept for backward compatibility (web and mobile clients still emit it).
    """
    return await join_rooms(sid, data)


@sio.event
async def join_rooms(sid, data):
    """
    Client joins rooms based on their role and location scopes.
    Expected data: {"token": "jwt_token"}

    The tenant is taken from the authenticated user, NEVER from the client payload
    (a "tenant_id" sent by the client is ignored: it would let any user join another
    organisation's rooms).

    Room assignment:
    - SUPER_ADMIN -> admin_all + tenant_{id}
    - TENANT_ADMIN -> tenant_{id}
    - SUPERVISOR/OPERATOR/VIEWER -> building_{id} rooms from location_scopes
    """
    identity = await _authenticate((data or {}).get('token'))
    if not identity:
        return {"success": False, "error": "invalid token"}

    user_id = identity['user_id']
    role = identity['role']
    tenant_id = identity['tenant_id']

    requested = (data or {}).get('tenant_id')
    if requested and requested != tenant_id:
        logger.warning(f"User {user_id} requested rooms of tenant {requested} but belongs to {tenant_id}: ignored")

    if not tenant_id and role != 'SUPER_ADMIN':
        return {"success": False, "error": "user has no organisation"}

    rooms = []

    if role == 'SUPER_ADMIN':
        # Super admin sees everything
        rooms.append('admin_all')
        if tenant_id:
            rooms.append(f'tenant_{tenant_id}')
    elif role == 'TENANT_ADMIN':
        # Tenant admin sees everything in their tenant
        rooms.append(f'tenant_{tenant_id}')
    else:
        # Scoped users: look up their location_scopes in DB
        # location_scopes.client_user_id stores ClientUser.id, not User.id
        # So we must find the ClientUser record first, then query scopes by its id.
        try:
            if _db is None:
                raise RuntimeError("database not available")

            # Step 1: find the ClientUser record for (user_id, client/tenant)
            client_user = await _db.client_users.find_one(
                {"user_id": user_id, "client_id": tenant_id, "is_active": True},
                {"_id": 0, "id": 1}
            )

            scopes = []
            if client_user:
                # Step 2: query scopes by client_user.id (not user_id!)
                scopes = await _db.location_scopes.find(
                    {"client_user_id": client_user["id"]},
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
                # No specific scopes: fall back to tenant room (see all tenant/client events)
                rooms.append(f'tenant_{tenant_id}')
                logger.info(f"User {user_id} ({role}) has no scopes, falling back to tenant room")
        except Exception as e:
            logger.error(f"Error loading location scopes for {user_id}: {e}")
            # Fallback to tenant room on error
            rooms.append(f'tenant_{tenant_id}')

    # Leave rooms from a previous join on this connection (re-join after token refresh)
    previous = client_sessions.get(sid)
    if previous:
        for room in previous.get('rooms', []):
            await sio.leave_room(sid, room)

    # Join all rooms
    for room in rooms:
        await sio.enter_room(sid, room)

    # Store session info
    client_sessions[sid] = {
        'user_id': user_id,
        'email': identity['email'],
        'role': role,
        'tenant_id': tenant_id,
        'rooms': rooms,
        'jti': identity['jti'],
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


def _session_can_see_sensor(session: Dict, sensor: Dict) -> bool:
    """Same visibility as presence_update: the sensor must be routed to one of the session's rooms."""
    rooms = set(session.get('rooms', []))
    if 'admin_all' in rooms:
        return True
    # Unassigned radar (no building yet): visible to its organisation, like on the sensors page
    if not sensor.get('building_id') and session.get('tenant_id') in (sensor.get('tenant_id'), sensor.get('client_id')):
        return True
    candidates = {
        f"tenant_{sensor.get('tenant_id')}",
        f"tenant_{sensor.get('client_id')}",
        f"building_{sensor.get('building_id')}",
        f"floor_{sensor.get('floor_id')}",
    }
    return bool(rooms & candidates)


@sio.event
async def watch_sensor(sid, data):
    """Client starts receiving target_positions for a sensor. Expected data: {"sensor_id": "xxx"}"""
    session = client_sessions.get(sid)
    sensor_id = (data or {}).get('sensor_id')
    if not session or not sensor_id:
        return {"success": False, "error": "join_rooms first and provide sensor_id"}
    if _db is None:
        return {"success": False, "error": "database not available"}

    sensor = await _db.sensors.find_one(
        {"id": sensor_id},
        {"_id": 0, "tenant_id": 1, "client_id": 1, "building_id": 1, "floor_id": 1}
    )
    if not sensor or not _session_can_see_sensor(session, sensor):
        return {"success": False, "error": "access denied"}

    await sio.enter_room(sid, f'sensor_{sensor_id}')
    return {"success": True}


@sio.event
async def unwatch_sensor(sid, data):
    """Client stops receiving target_positions for a sensor."""
    sensor_id = (data or {}).get('sensor_id')
    if sensor_id:
        await sio.leave_room(sid, f'sensor_{sensor_id}')
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


async def broadcast_target_positions(data: Dict[str, Any]):
    """Broadcast live target positions only to clients watching this sensor."""
    sensor_id = data.get('sensor_id')
    if not sensor_id:
        return
    await sio.emit('target_positions', sanitize_for_json(data), room=f'sensor_{sensor_id}')


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


async def disconnect_by_jti(jti: str):
    """Force disconnect a client by their session JTI."""
    if not jti:
        return
    for sid, session in list(client_sessions.items()):
        if session.get('jti') == jti:
            try:
                await sio.disconnect(sid)
            except Exception as e:
                logger.warning(f"Failed to disconnect sid {sid}: {e}")
            break
