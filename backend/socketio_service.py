"""
Socket.IO Service for OhmGuard
Handles real-time communication between backend and frontend clients.

Events emitted:
- new_event: New radar event (fall, presence, etc.)
- presence_update: Presence state change for a sensor
- sensor_status: Sensor online/offline status change
- sensor_registered: New sensor auto-registered

Events received:
- join_tenant: Client joins a tenant room for filtered events
- leave_tenant: Client leaves a tenant room
"""
import socketio
import logging
from typing import Optional, Dict, Any
from bson import ObjectId

logger = logging.getLogger(__name__)


def sanitize_for_json(obj):
    """
    Recursively convert MongoDB ObjectId to string for JSON serialization.
    This ensures all data can be safely sent via Socket.IO.
    """
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
# IMPORTANT: CORS is handled by FastAPI CORSMiddleware, so we set cors_allowed_origins=[]
# to avoid duplicate CORS headers which cause browser errors.
# In production, the Kubernetes ingress also handles CORS.
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[],  # Disable Socket.IO CORS - let FastAPI handle it
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e6  # 1MB max message size
)

# Create ASGI app - will be mounted on FastAPI
socket_app = socketio.ASGIApp(
    sio,
    socketio_path=''
)

# Store connected clients by tenant_id
connected_clients: Dict[str, set] = {}


@sio.event
async def connect(sid, environ, auth):
    """Handle client connection."""
    logger.info(f"Client connected: {sid}")
    # Client will join tenant room after authentication
    return True


@sio.event
async def disconnect(sid):
    """Handle client disconnection."""
    logger.info(f"Client disconnected: {sid}")
    # Remove from all tenant rooms
    for tenant_id, clients in connected_clients.items():
        if sid in clients:
            clients.discard(sid)
            await sio.leave_room(sid, f"tenant_{tenant_id}")


@sio.event
async def join_tenant(sid, data):
    """
    Client joins a tenant room to receive filtered events.
    Expected data: {"tenant_id": "xxx", "token": "jwt_token"}
    """
    tenant_id = data.get('tenant_id')
    if not tenant_id:
        logger.warning(f"Client {sid} tried to join without tenant_id")
        return {"success": False, "error": "tenant_id required"}
    
    room = f"tenant_{tenant_id}"
    await sio.enter_room(sid, room)
    
    # Track connected clients
    if tenant_id not in connected_clients:
        connected_clients[tenant_id] = set()
    connected_clients[tenant_id].add(sid)
    
    logger.info(f"Client {sid} joined room {room}")
    
    # Send confirmation
    await sio.emit('joined', {
        'tenant_id': tenant_id,
        'room': room,
        'message': 'Successfully joined tenant room'
    }, room=sid)
    
    return {"success": True, "room": room}


@sio.event
async def leave_tenant(sid, data):
    """Client leaves a tenant room."""
    tenant_id = data.get('tenant_id')
    if tenant_id:
        room = f"tenant_{tenant_id}"
        await sio.leave_room(sid, room)
        if tenant_id in connected_clients:
            connected_clients[tenant_id].discard(sid)
        logger.info(f"Client {sid} left room {room}")
    return {"success": True}


# ==================== Broadcast Functions ====================
# These are called by mqtt_service.py to emit events to clients

async def broadcast_new_event(tenant_id: str, event: Dict[str, Any]):
    """Broadcast a new radar event to all clients in the tenant room."""
    room = f"tenant_{tenant_id}"
    logger.debug(f"Broadcasting new_event to room {room}, event_id: {event.get('id', 'N/A')}")
    # Sanitize data to ensure no ObjectId fields
    clean_event = sanitize_for_json(event)
    await sio.emit('new_event', {
        'type': 'new_event',
        'event': clean_event
    }, room=room)


async def broadcast_presence_update(tenant_id: str, data: Dict[str, Any]):
    """Broadcast presence state update to all clients in the tenant room."""
    room = f"tenant_{tenant_id}"
    logger.debug(f"Broadcasting presence_update to room {room}")
    # Sanitize data to ensure no ObjectId fields
    clean_data = sanitize_for_json(data)
    await sio.emit('presence_update', {
        'type': 'presence_update',
        **clean_data
    }, room=room)


async def broadcast_sensor_status(tenant_id: str, sensor_id: str, status: str, last_seen: str):
    """Broadcast sensor status change to all clients in the tenant room."""
    room = f"tenant_{tenant_id}"
    logger.debug(f"Broadcasting sensor_status to room {room}")
    await sio.emit('sensor_status', {
        'type': 'sensor_status',
        'sensor_id': str(sensor_id) if sensor_id else sensor_id,
        'status': status,
        'last_seen': last_seen
    }, room=room)


async def broadcast_sensor_registered(tenant_id: str, sensor: Dict[str, Any]):
    """Broadcast new sensor registration to all clients in the tenant room."""
    room = f"tenant_{tenant_id}"
    logger.debug(f"Broadcasting sensor_registered to room {room}")
    # Sanitize sensor data to ensure no ObjectId fields
    clean_sensor = sanitize_for_json(sensor)
    await sio.emit('sensor_registered', {
        'type': 'sensor_registered',
        'sensor': clean_sensor
    }, room=room)


async def broadcast_to_all(event_name: str, data: Dict[str, Any]):
    """Broadcast to all connected clients (for super admin notifications)."""
    # Sanitize data to ensure no ObjectId fields
    clean_data = sanitize_for_json(data)
    await sio.emit(event_name, clean_data)


def get_connected_count(tenant_id: Optional[str] = None) -> int:
    """Get count of connected clients."""
    if tenant_id:
        return len(connected_clients.get(tenant_id, set()))
    return sum(len(clients) for clients in connected_clients.values())
