"""
MQTT Service for Vayyar Radar Integration
Connects to MQTT broker and processes fall detection events from radar devices
Enhanced with RadarEvent model support for normalized event processing
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Callable, Dict, Any
import uuid
import time

import aiomqtt
from motor.motor_asyncio import AsyncIOMotorDatabase

# Import radar event models
from radar_event_models import (
    RadarEventType, PresenceStatus, EventSeverity, EventStatus,
    RadarEventPayload, RadarEventRequest,
    normalize_radar_event, extract_active_regions, epoch_ms_to_iso,
    format_active_regions_display, format_target_count_display
)

# Import cache service
from cache_service import get_cache_service

# Import presence session service for aggregated presence tracking
from presence_session_service import get_presence_session_service

logger = logging.getLogger(__name__)

# Vayyar event type mapping (updated based on actual Vayyar API)
VAYYAR_EVENT_TYPES = {
    4: "PRESENCE",      # Person detected in room (LOW)
    5: "FALL",          # Standard fall detected (HIGH)
    8: "SENSITIVE_FALL", # Suspected fall - confidence based (HIGH)
    10: "BED_EXIT",     # Person exiting bed (MED)
}

# Posture mapping from trackerTargets
POSTURE_MAP = {
    0: "STANDING",
    1: "SITTING", 
    2: "LYING",
    3: "FALLING",
}

# Device status mapping
DEVICE_STATUS_MAP = {
    "monitoring": "ONLINE",
    "idle": "ONLINE",
    "offline": "OFFLINE",
    "error": "MAINTENANCE",
    "calibrating": "MAINTENANCE",
}


class MQTTService:
    """MQTT Service for Vayyar radar integration"""
    
    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        db: AsyncIOMotorDatabase,
        broadcast_callback: Optional[Callable] = None,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.db = db
        self.broadcast_callback = broadcast_callback
        self.username = username
        self.password = password
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[aiomqtt.Client] = None
        
        # Throttle for PRESENCE events (avoid flooding WebSocket)
        self._last_presence_broadcast = {}  # device_id -> timestamp
        self._presence_broadcast_interval = 5  # seconds between PRESENCE broadcasts per device
        
        # Cache for device to sensor mapping
        self._device_sensor_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 300  # 5 minutes cache
        self._cache_timestamp: Dict[str, datetime] = {}
    
    async def start(self):
        """Start the MQTT service"""
        if self.running:
            logger.warning("MQTT service is already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run())
        logger.info(f"MQTT service started, connecting to {self.broker_host}:{self.broker_port}")
    
    async def stop(self):
        """Stop the MQTT service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("MQTT service stopped")
    
    async def _run(self):
        """Main MQTT loop with reconnection logic"""
        reconnect_interval = 5
        
        while self.running:
            try:
                async with aiomqtt.Client(
                    hostname=self.broker_host,
                    port=self.broker_port,
                    username=self.username,
                    password=self.password,
                    keepalive=60
                ) as client:
                    self._client = client
                    logger.info(f"Connected to MQTT broker {self.broker_host}:{self.broker_port}")
                    
                    # Subscribe to device topics
                    await client.subscribe("/devices/+/state")
                    await client.subscribe("/devices/+/events")
                    logger.info("Subscribed to /devices/+/state and /devices/+/events")
                    
                    # Subscribe to Seedoo AI camera topics
                    await client.subscribe("/seedoo/#")
                    logger.info("Subscribed to /seedoo/# (AI cameras)")
                    
                    # Process messages
                    async for message in client.messages:
                        try:
                            await self._handle_message(message)
                        except Exception as e:
                            logger.error(f"Error handling MQTT message: {e}", exc_info=True)
                            
            except aiomqtt.MqttError as e:
                logger.error(f"MQTT connection error: {e}. Reconnecting in {reconnect_interval}s...")
                await asyncio.sleep(reconnect_interval)
            except asyncio.CancelledError:
                logger.info("MQTT service cancelled")
                break
            except Exception as e:
                logger.error(f"Unexpected MQTT error: {e}. Reconnecting in {reconnect_interval}s...", exc_info=True)
                await asyncio.sleep(reconnect_interval)
    
    async def _handle_message(self, message):
        """Handle incoming MQTT message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON payload on topic {topic}")
            return
        
        # Check if this is a Seedoo AI camera message
        if topic.startswith("/seedoo/"):
            await self._handle_seedoo_event(topic, payload)
            return
        
        # Extract deviceId from topic: /devices/{deviceId}/state or /devices/{deviceId}/events
        parts = topic.split('/')
        if len(parts) < 4:
            logger.warning(f"Invalid topic format: {topic}")
            return
        
        device_id = parts[2]
        message_type = parts[3]  # "state" or "events"
        
        logger.debug(f"Received {message_type} from device {device_id}")
        
        if message_type == "state":
            await self._handle_device_state(device_id, payload)
        elif message_type == "events":
            logger.info(f"EVENT received from {device_id}: {json.dumps(payload)[:500]}")
            await self._handle_device_event(device_id, payload)
    
    async def _get_sensor_by_device_id(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get sensor info from database by device_id (with caching)"""
        now = datetime.now(timezone.utc)
        
        # Check cache
        if device_id in self._device_sensor_cache:
            cache_time = self._cache_timestamp.get(device_id)
            if cache_time and (now - cache_time).total_seconds() < self._cache_ttl:
                return self._device_sensor_cache[device_id]
        
        # Query database - look for sensor with matching deviceId or serialProduct
        sensor = await self.db.sensors.find_one(
            {"$or": [
                {"device_id": device_id},
                {"serial_product": device_id},
                {"model": device_id}
            ]},
            {"_id": 0}
        )
        
        if sensor:
            self._device_sensor_cache[device_id] = sensor
            self._cache_timestamp[device_id] = now
            logger.info(f"Mapped device {device_id} to sensor {sensor['id']} (serial: {sensor.get('serial_product', 'N/A')})")
        
        return sensor
    
    async def _auto_register_sensor(self, device_id: str, payload: Dict) -> Optional[Dict[str, Any]]:
        """Auto-register a new sensor from MQTT device
        
        Sensors are registered WITHOUT location assignment.
        Administrators must manually assign them via Clients & Buildings UI.
        """
        # Get default tenant for the sensor (for multi-tenant filtering)
        tenant = await self.db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            logger.warning(f"No tenant found for auto-registration of device {device_id}")
            return None
        
        # Extract serial product from state payload - THE REAL SERIAL NUMBER
        serial_product = payload.get("serialProduct", "")
        serial_radar = payload.get("serialRadar", "")
        model_info = payload.get("model", "Vayyar Home")
        hardware_info = payload.get("hardware", "")
        product_type = payload.get("productType", "Falling")
        
        # Generate a readable name
        if serial_product:
            radar_name = f"Radar {serial_product}"
        else:
            radar_name = f"Radar {device_id[:12]}"
        
        # Create sensor WITHOUT location assignment (pending assignment via UI)
        sensor = {
            "id": str(uuid.uuid4()),
            "name": radar_name,
            "type": "RADAR",
            "serial_product": serial_product,  # From payload serialProduct field
            "serial_radar": serial_radar,      # From payload serialRadar field
            "device_id": device_id,            # deviceId for MQTT communications
            "model": model_info,
            "hardware": hardware_info,
            "product_type": product_type,
            "firmware": payload.get("versionName", "unknown"),
            # Location fields - NULL until manually assigned
            "zone_id": None,
            "site_id": None,
            "client_id": None,
            "building_id": None,
            "floor_id": None,
            "room_id": None,
            "room_space_id": None,
            # Tenant and status
            "tenant_id": tenant['id'],
            "api_key": f"sk_{uuid.uuid4().hex}",
            "status": "ONLINE",
            "assignment_status": "PENDING",  # PENDING | ASSIGNED
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.sensors.insert_one(sensor)
        
        # Cache it
        self._device_sensor_cache[device_id] = sensor
        self._cache_timestamp[device_id] = datetime.now(timezone.utc)
        
        logger.info(f"Auto-registered new sensor: {radar_name} (device: {device_id}, serial: {serial_product}) - PENDING ASSIGNMENT")
        
        # Broadcast new sensor to WebSocket (exclude _id for JSON serialization)
        if self.broadcast_callback:
            sensor_for_broadcast = {k: v for k, v in sensor.items() if k != '_id'}
            await self.broadcast_callback(tenant['id'], {
                "type": "sensor_registered",
                "sensor": sensor_for_broadcast
            })
        
        return sensor
    
    async def _handle_device_state(self, device_id: str, payload: Dict):
        """Handle device state update - extracts serialProduct from payload"""
        # Log full state payload for first device (for debugging)
        if not hasattr(self, '_state_logged'):
            self._state_logged = True
            logger.info(f"STATE payload sample from {device_id}: {json.dumps(payload)[:800]}")
        
        sensor = await self._get_sensor_by_device_id(device_id)
        
        if not sensor:
            # Auto-register the sensor
            sensor = await self._auto_register_sensor(device_id, payload)
            if not sensor:
                return
        
        # Update sensor status
        status = payload.get("status", "monitoring")
        new_status = DEVICE_STATUS_MAP.get(status, "ONLINE")
        
        update_data = {
            "status": new_status,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "firmware": payload.get("versionName", sensor.get("firmware")),
        }
        
        # Extract serialProduct from state payload - this is the real serial number
        if "serialProduct" in payload and payload["serialProduct"]:
            update_data["serial_product"] = payload["serialProduct"]
            # Update name if it's still using device_id
            if sensor.get("name", "").startswith("Radar ") and device_id in sensor.get("name", ""):
                update_data["name"] = f"Radar {payload['serialProduct'][:12]}"
            logger.info(f"Updated serial_product for device {device_id}: {payload['serialProduct']}")
        
        # Extract serialRadar if present
        if "serialRadar" in payload and payload["serialRadar"]:
            update_data["serial_radar"] = payload["serialRadar"]
        
        # Store model info from payload
        if "model" in payload and payload["model"]:
            update_data["model"] = payload["model"]
        
        # Store hardware info
        if "hardware" in payload and payload["hardware"]:
            update_data["hardware"] = payload["hardware"]
        
        # Add extra telemetry info
        if "temperature" in payload:
            update_data["temperature"] = payload["temperature"]
        if "memoryUsage" in payload:
            update_data["memory_usage"] = payload["memoryUsage"]
        if "upTime" in payload:
            update_data["uptime"] = payload["upTime"]
        if "productType" in payload:
            update_data["product_type"] = payload["productType"]
        
        # WiFi info
        wifi_state = payload.get("wifiState", {})
        if wifi_state:
            update_data["wifi_ssid"] = wifi_state.get("ssid")
            update_data["wifi_rssi"] = wifi_state.get("rssi")
        
        await self.db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": update_data}
        )
        
        # Broadcast status update
        if self.broadcast_callback:
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "sensor_status",
                "sensor_id": sensor['id'],
                "device_id": device_id,
                "serial_product": update_data.get("serial_product", sensor.get("serial_product")),
                "status": new_status,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        
        logger.debug(f"Updated sensor {sensor['id']} status to {new_status}")
    
    async def _handle_device_event(self, device_id: str, payload: Dict):
        """
        Handle device event using new RadarEvent model.
        Normalizes raw Vayyar payload into platform event with:
        - Proper event type mapping (FALL, PRE_FALL, PRESENCE, INACTIVITY, UNKNOWN)
        - Presence detection status
        - Active regions extraction
        - Target count
        
        IMPORTANT: Only radars with assigned locations (room_id set) will have their
        events recorded in the database and displayed on the Live page.
        """
        sensor = await self._get_sensor_by_device_id(device_id)
        
        if not sensor:
            logger.warning(f"Unknown device {device_id} sent event, attempting auto-registration")
            sensor = await self._auto_register_sensor(device_id, {})
            if not sensor:
                return
        
        # CHECK: Only record events for ASSIGNED radars (those with a room location)
        # Radars without assignment will still update their status but won't create events
        is_assigned = (
            sensor.get('assignment_status') == 'ASSIGNED' or 
            sensor.get('room_id') is not None or
            sensor.get('room_space_id') is not None
        )
        
        # Log the raw payload for debugging
        logger.info(f"Event from {device_id}: type={payload.get('type')}, assigned={is_assigned}, payload_keys={list(payload.get('payload', {}).keys()) if isinstance(payload.get('payload'), dict) else 'N/A'}")
        
        event_type_code = payload.get("type", 0)
        event_payload = payload.get("payload", {})
        
        # If payload is not a dict, try to use the root payload
        if not isinstance(event_payload, dict):
            logger.warning(f"Event payload is not a dict, using root payload. Type: {type(event_payload)}")
            event_payload = payload
        
        # ===================================================================================
        # PRESENCE EVENT HANDLING (type 4)
        # Instead of saving raw presence events, we use the PresenceSessionService
        # to track presence sessions (start time, end time, duration).
        # ===================================================================================
        presence_detected = event_payload.get("presenceDetected", False)
        
        if event_type_code == 4:  # PRESENCE event type
            # Update sensor with current presence state and last_seen
            await self.db.sensors.update_one(
                {"id": sensor['id']},
                {"$set": {
                    "status": "ONLINE", 
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                    "current_presence": presence_detected,
                    "current_target_count": len(event_payload.get('trackerTargets', [])) if presence_detected else 0,
                    "presence_updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Handle presence session lifecycle (only for assigned radars)
            if is_assigned:
                try:
                    presence_service = get_presence_session_service()
                    # Build metadata for the session
                    session_metadata = {
                        "client_id": sensor.get('client_id'),
                        "building_id": sensor.get('building_id'),
                        "floor_id": sensor.get('floor_id'),
                        "room_id": sensor.get('room_id'),
                        "space_id": sensor.get('room_space_id'),
                        "sensor_name": sensor.get('name'),
                        "room_name": sensor.get('room_name'),
                        "space_name": sensor.get('space_name')
                    }
                    
                    # Handle session start (presence=true) or end (presence=false)
                    completed_session = await presence_service.handle_presence_event(
                        sensor_id=sensor['id'],
                        device_id=device_id,
                        tenant_id=sensor['tenant_id'],
                        presence_detected=presence_detected,
                        metadata=session_metadata
                    )
                    
                    if completed_session:
                        logger.info(f"Presence session completed for {sensor.get('name')}: "
                                   f"duration={completed_session.get('duration_sec')}s")
                        
                        # Broadcast session completion
                        if self.broadcast_callback:
                            await self.broadcast_callback(sensor['tenant_id'], {
                                "type": "presence_session_completed",
                                "session": completed_session,
                                "sensor_id": sensor['id'],
                                "sensor_name": sensor.get('name')
                            })
                    
                except Exception as e:
                    logger.error(f"Failed to handle presence session: {e}")
                
                # Broadcast presence update to frontend
                if self.broadcast_callback:
                    await self.broadcast_callback(sensor['tenant_id'], {
                        "type": "presence_update",
                        "sensor_id": sensor['id'],
                        "device_id": device_id,
                        "presence_detected": presence_detected,
                        "target_count": len(event_payload.get('trackerTargets', [])) if presence_detected else 0,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                
                # Update Last State in Redis
                try:
                    from last_state_service import get_last_state_service
                    last_state_service = get_last_state_service()
                    await last_state_service.update_sensor_state(
                        sensor_id=sensor['id'],
                        tenant_id=sensor['tenant_id'],
                        building_id=sensor.get('building_id'),
                        floor_id=sensor.get('floor_id'),
                        state_data={
                            "device_id": device_id,
                            "sensor_name": sensor.get('name'),
                            "room_id": sensor.get('room_id'),
                            "room_name": sensor.get('room_name'),
                            "space_id": sensor.get('space_id'),
                            "space_name": sensor.get('space_name'),
                            "last_event_type": "PRESENCE",
                            "last_event_severity": "LOW",
                            "presence_detected": presence_detected,
                            "target_count": len(event_payload.get('trackerTargets', [])) if presence_detected else 0,
                            "model": sensor.get('model'),
                            "firmware_version": sensor.get('firmware_version')
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to update last state in Redis for presence: {e}")
            
            # PRESENCE events are NOT saved in the events collection anymore
            # They are tracked via presence_sessions for aggregated reporting
            logger.debug(f"Presence event from {device_id}: detected={presence_detected} (session-based tracking)")
            return
        
        # IMPORTANT: For unassigned radars, we update their status but do NOT create events
        # This keeps the Live page clean with only events from radars with known locations
        if not is_assigned:
            logger.debug(f"Skipping event creation for unassigned radar {device_id} (sensor: {sensor['id']})")
            # Still update sensor status and presence
            await self.db.sensors.update_one(
                {"id": sensor['id']},
                {"$set": {
                    "status": "ONLINE",
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                    "current_presence": presence_detected,
                    "current_target_count": len(event_payload.get('trackerTargets', [])),
                    "presence_updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return
        
        # Log extracted presence data
        logger.debug(f"Presence data: detected={event_payload.get('presenceDetected')}, regionMap={event_payload.get('presenceRegionMap')}, targets={len(event_payload.get('trackerTargets', []))}")
        
        # Build RadarEventRequest for normalization
        try:
            radar_payload = RadarEventPayload(
                presenceDetected=event_payload.get("presenceDetected", False),
                presenceRegionMap=event_payload.get("presenceRegionMap", {}),
                presenceTargetType=event_payload.get("presenceTargetType", 0),
                roomPresenceIndication=event_payload.get("roomPresenceIndication", 0),
                timestamp=event_payload.get("timestamp", 0),
                trackerTargets=event_payload.get("trackerTargets", [])
            )
            
            radar_request = RadarEventRequest(
                payload=radar_payload,
                type=event_type_code,
                deviceId=device_id
            )
        except Exception as e:
            logger.error(f"Failed to parse radar event payload: {e}")
            # Fall back to legacy processing
            return await self._handle_device_event_legacy(device_id, payload, sensor)
        
        # Normalize the event
        normalized = normalize_radar_event(
            request=radar_request,
            sensor_id=sensor['id'],
            site_id=sensor['site_id'],
            zone_id=sensor['zone_id'],
            tenant_id=sensor['tenant_id']
        )
        
        # NOTE: PRESENCE events (type 4) are already handled above and returned early
        # This code only processes FALL, SENSITIVE_FALL, BED_EXIT, and other critical events
        
        # Deduplication: check for similar event in last 10 seconds
        from datetime import timedelta
        ten_seconds_ago = datetime.now(timezone.utc) - timedelta(seconds=10)
        existing = await self.db.events.find_one({
            "sensor_id": sensor['id'],
            "type": normalized.eventType.value,
            "timestamp": {"$gte": ten_seconds_ago.isoformat()}
        }, {"_id": 0})
        
        if existing:
            # Update if this has more data
            if normalized.targetCount > existing.get('target_count', 0):
                await self.db.events.update_one(
                    {"id": existing['id']},
                    {"$set": {
                        "raw_payload": normalized.rawPayloadJson,
                        "active_regions": normalized.activeRegions,
                        "target_count": normalized.targetCount,
                        "presence_detected": normalized.presenceDetected
                    }}
                )
            logger.debug(f"Deduplicated event from {device_id}")
            return
        
        # Create new event document
        event = {
            "id": normalized.id,
            "device_id": device_id,
            "sensor_id": sensor['id'],
            "tenant_id": sensor['tenant_id'],
            "site_id": sensor['site_id'],
            "zone_id": sensor['zone_id'],
            "type": normalized.eventType.value,
            "presence_status": normalized.presenceStatus.value,
            "presence_detected": normalized.presenceDetected,
            "active_regions": normalized.activeRegions,
            "target_count": normalized.targetCount,
            "occurred_at": normalized.occurredAt,
            "raw_timestamp": normalized.rawTimestamp,
            "severity": normalized.severity.value,
            "status": normalized.status.value,
            "confidence": 1.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "raw_payload": normalized.rawPayloadJson,
            "tracker_targets": event_payload.get("trackerTargets", [])
        }
        
        await self.db.events.insert_one(event)
        
        # Update sensor last_seen for critical events (FALL, SENSITIVE_FALL, BED_EXIT)
        sensor_update = {
            "status": "ONLINE", 
            "last_seen": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": sensor_update}
        )
        
        # Update Last State in Redis
        try:
            from last_state_service import get_last_state_service
            last_state_service = get_last_state_service()
            await last_state_service.update_sensor_state(
                sensor_id=sensor['id'],
                tenant_id=sensor['tenant_id'],
                building_id=sensor.get('building_id'),
                floor_id=sensor.get('floor_id'),
                state_data={
                    "device_id": device_id,
                    "sensor_name": sensor.get('name'),
                    "room_id": sensor.get('room_id'),
                    "room_name": sensor.get('room_name'),
                    "space_id": sensor.get('space_id'),
                    "space_name": sensor.get('space_name'),
                    "last_event_type": normalized.eventType.value,
                    "last_event_severity": normalized.severity.value,
                    "presence_detected": normalized.presenceDetected,
                    "target_count": normalized.targetCount,
                    "active_regions": normalized.activeRegions,
                    "model": sensor.get('model'),
                    "firmware_version": sensor.get('firmware_version')
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update last state in Redis: {e}")
        
        logger.info(f"Created {normalized.eventType.value} event from device {device_id}, "
                   f"severity={normalized.severity.value}, regions={normalized.activeRegions}, "
                   f"targets={normalized.targetCount}")
        
        # Broadcast critical events (FALL, SENSITIVE_FALL, BED_EXIT) to WebSocket
        if self.broadcast_callback:
            # Create a clean copy of event without MongoDB _id
            event_for_broadcast = {k: v for k, v in event.items() if k != '_id'}
            
            # Send new event notification
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "new_radar_event",
                "event": {
                    **event_for_broadcast,
                    "sensor_name": sensor.get('name'),
                    "active_regions_display": format_active_regions_display(normalized.activeRegions),
                    "target_count_display": format_target_count_display(normalized.targetCount),
                    "presence_display": "Présence détectée" if normalized.presenceDetected else "Aucune présence",
                    "urgent": normalized.severity == EventSeverity.HIGH
                }
            })
        
        # Trigger alert rules for HIGH severity events (FALL, SENSITIVE_FALL)
        if normalized.severity == EventSeverity.HIGH:
            await self._process_alert_rules(event, sensor)
            # Send push notification for fall events
            await self._send_fall_push_notification(event, sensor, normalized.eventType.value)
    
    async def _handle_device_event_legacy(self, device_id: str, payload: Dict, sensor: Dict):
        """Legacy event handler for non-standard payloads"""
        event_type_code = payload.get("type", 0)
        event_payload = payload.get("payload", {})
        
        # Determine event type and severity using legacy methods
        event_type = self._determine_event_type(event_type_code, event_payload)
        severity = self._determine_severity(event_type_code, event_payload)
        confidence = self._calculate_confidence(event_payload)
        
        # Create legacy event
        event = {
            "id": str(uuid.uuid4()),
            "sensor_id": sensor['id'],
            "tenant_id": sensor['tenant_id'],
            "site_id": sensor['site_id'],
            "zone_id": sensor['zone_id'],
            "type": event_type,
            "severity": severity,
            "confidence": confidence,
            "status": "NEW",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "raw_payload": payload
        }
        
        await self.db.events.insert_one(event)
        logger.info(f"Created legacy event {event_type} from device {device_id}")
        
        if self.broadcast_callback:
            # Exclude _id for JSON serialization
            event_for_broadcast = {k: v for k, v in event.items() if k != '_id'}
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "new_event",
                "event": event_for_broadcast
            })
    
    def _determine_event_type(self, event_type_code: int, payload: Dict) -> str:
        """Determine the event type from Vayyar payload"""
        # Check tracker targets for posture
        tracker_targets = payload.get("trackerTargets", [])
        
        for target in tracker_targets:
            posture = target.get("posture", 0)
            if posture == 3:  # Falling
                return "FALL"
            elif posture == 2:  # Lying
                # Could be a fall if sudden
                z_pos = target.get("zPosCm", 100)
                if z_pos < 50:  # Very low position
                    return "FALL"
                return "PRE_FALL"
        
        # Use event type code
        if event_type_code == 4:
            return "FALL"
        elif event_type_code == 3:
            return "PRE_FALL"
        elif event_type_code in [5, 6, 7, 8]:
            return "PRE_FALL"  # Posture changes
        
        return "UNKNOWN"
    
    def _determine_severity(self, event_type_code: int, payload: Dict) -> str:
        """Determine severity based on event type and payload"""
        tracker_targets = payload.get("trackerTargets", [])
        
        # Fall events are always HIGH severity
        if event_type_code == 4:
            return "HIGH"
        
        for target in tracker_targets:
            posture = target.get("posture", 0)
            if posture == 3:  # Falling
                return "HIGH"
            elif posture == 2:  # Lying
                z_pos = target.get("zPosCm", 100)
                if z_pos < 30:
                    return "HIGH"
                return "MED"
        
        if event_type_code == 3:  # Pre-fall
            return "MED"
        
        return "LOW"
    
    def _calculate_confidence(self, payload: Dict) -> float:
        """Calculate confidence score from payload"""
        tracker_targets = payload.get("trackerTargets", [])
        
        if not tracker_targets:
            return 0.5
        
        # Use amplitude as confidence indicator
        max_amplitude = max((t.get("amplitude", 0) for t in tracker_targets), default=0)
        
        # Normalize to 0-1 range (assuming amplitude is 0-100)
        confidence = min(max(max_amplitude / 100, 0.5), 1.0)
        
        return round(confidence, 2)
    
    async def _handle_seedoo_event(self, topic: str, payload: Dict):
        """Handle Seedoo AI camera events from /seedoo/{channel} topic"""
        # Extract channel from topic: /seedoo/{channel}
        parts = topic.split('/')
        channel = parts[2] if len(parts) >= 3 else payload.get("channel", "unknown")
        
        logger.info(f"SEEDOO AI event received on {topic}: warning_type={payload.get('warning_type')}, confidence={payload.get('confidence')}")
        
        # Import AI sensor service
        try:
            from ai_sensor_service import get_ai_sensor_service
            ai_service = get_ai_sensor_service()
        except Exception as e:
            logger.error(f"Failed to get AI sensor service: {e}")
            return
        
        # Get or create the AI sensor
        channel_name = payload.get("channel_name", "")
        sensor = await ai_service.get_or_create_sensor(channel, channel_name)
        
        # Check confidence threshold (per warning type or global)
        confidence = payload.get("confidence", 0)
        warning_type = payload.get("warning_type", "Unknown")
        
        # Use per-type threshold if available, otherwise use global threshold
        warning_thresholds = sensor.get("warning_thresholds", {})
        threshold = warning_thresholds.get(warning_type, sensor.get("confidence_threshold", 0.7))
        
        if confidence < threshold:
            logger.debug(f"Ignoring low confidence AI event: {confidence} < {threshold} (type: {warning_type})")
            return
        
        # Check if warning type is enabled
        enabled_warnings = sensor.get("enabled_warnings", [])
        if enabled_warnings and warning_type not in enabled_warnings:
            logger.debug(f"Ignoring disabled warning type: {warning_type}")
            return
        
        # Create the AI event
        event = await ai_service.create_event(payload)
        
        # Broadcast to WebSocket
        if self.broadcast_callback:
            # Determine severity
            high_severity_types = ["Fall_Detected", "Violence", "Fire", "Smoke", "Intrusion"]
            severity = "HIGH" if warning_type in high_severity_types else "MEDIUM" if warning_type != "Normal_Activity" else "LOW"
            
            # Broadcast the AI event
            await self.broadcast_callback("all", {
                "type": "new_ai_event",
                "event": {
                    **event,
                    "sensor_name": sensor.get("name", channel_name),
                    "severity": severity,
                    "event_source": "ai_camera"
                }
            })
            
            logger.info(f"Broadcasted AI event: {event['id']} (type: {warning_type}, severity: {severity})")
        
        # Send push notifications for critical AI alerts
        critical_types = ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion']
        if warning_type in critical_types:
            await self._send_ai_push_notification(event, sensor, warning_type)
    
    async def _send_ai_push_notification(self, event: Dict, sensor: Dict, warning_type: str):
        """Send push notification for critical AI events"""
        try:
            from push_notification_service import send_expo_push_notification
            
            # Get all push tokens
            tokens_cursor = self.db.push_tokens.find({}, {"_id": 0, "push_token": 1})
            tokens = [doc['push_token'] async for doc in tokens_cursor]
            
            if not tokens:
                logger.debug("No push tokens found for AI notification")
                return
            
            # Build notification message based on warning type
            alert_titles = {
                'Fall_Detected': '🚨 Chute détectée (IA)',
                'Violence': '⚠️ Violence détectée',
                'Fire': '🔥 Feu détecté',
                'Smoke': '💨 Fumée détectée',
                'Intrusion': '🚷 Intrusion détectée'
            }
            
            title = alert_titles.get(warning_type, '⚠️ Alerte IA')
            body = f"{sensor.get('name', event.get('channel_name', 'Caméra'))} - Confiance: {int(event.get('confidence', 0) * 100)}%"
            
            # Send push notification
            result = await send_expo_push_notification(
                tokens=tokens,
                title=title,
                body=body,
                data={
                    "type": "ai_event",
                    "event_id": event.get("id"),
                    "warning_type": warning_type,
                    "video_url": event.get("video_url"),
                    "channel": event.get("channel"),
                    "confidence": event.get("confidence")
                }
            )
            
            if result:
                logger.info(f"AI push notification sent for {warning_type}: {len(tokens)} recipients")
            
        except Exception as e:
            logger.error(f"Failed to send AI push notification: {e}")
    
    async def _process_alert_rules(self, event: Dict, sensor: Dict):
        """Process alert rules for a new event"""
        rules = await self.db.alert_rules.find({
            "tenant_id": event['tenant_id'],
            "is_active": True,
            "$or": [
                {"site_id": event['site_id']},
                {"site_id": None}
            ]
        }, {"_id": 0}).to_list(100)
        
        severity_order = {"LOW": 1, "MED": 2, "HIGH": 3}
        
        for rule in rules:
            if event['type'] not in rule.get('event_types', []):
                continue
            if severity_order.get(event['severity'], 0) < severity_order.get(rule.get('min_severity', 'LOW'), 0):
                continue
            
            # Create notification log
            for channel in rule.get('channels', ['in_app']):
                notification = {
                    "id": str(uuid.uuid4()),
                    "event_id": event['id'],
                    "tenant_id": event['tenant_id'],
                    "channel": channel,
                    "recipient": rule.get('name', 'default'),
                    "status": "sent",
                    "message": f"Alerte {event['type']} détectée par {sensor.get('name', 'capteur')}",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await self.db.notification_logs.insert_one(notification)
            
            # Webhook (mock in dev)
            if rule.get('webhook_url'):
                logger.info(f"[MOCK] Webhook to {rule['webhook_url']}: {event}")
    
    async def _send_fall_push_notification(self, event: Dict, sensor: Dict, event_type: str):
        """Send push notification for FALL and SENSITIVE_FALL events"""
        try:
            from push_notification_service import send_expo_push_notification
            
            # Get all push tokens for this tenant
            tokens_cursor = self.db.push_tokens.find(
                {"tenant_id": event.get('tenant_id')}, 
                {"_id": 0, "push_token": 1}
            )
            tokens = [doc['push_token'] async for doc in tokens_cursor]
            
            # If no tenant-specific tokens, get all tokens
            if not tokens:
                tokens_cursor = self.db.push_tokens.find({}, {"_id": 0, "push_token": 1})
                tokens = [doc['push_token'] async for doc in tokens_cursor]
            
            if not tokens:
                logger.debug("No push tokens found for fall notification")
                return
            
            # Build notification message based on event type
            if event_type == "FALL":
                title = "🚨 CHUTE DÉTECTÉE"
                body = f"Chute détectée par {sensor.get('name', 'Radar')} - Intervention requise!"
            elif event_type == "SENSITIVE_FALL":
                title = "⚠️ Chute suspectée"
                body = f"Chute possible détectée par {sensor.get('name', 'Radar')} - Vérification recommandée"
            else:
                title = "⚠️ Alerte Radar"
                body = f"Alerte {event_type} de {sensor.get('name', 'Radar')}"
            
            # Send push notification
            result = await send_expo_push_notification(
                tokens=tokens,
                title=title,
                body=body,
                data={
                    "type": "fall_event",
                    "event_id": event.get("id"),
                    "event_type": event_type,
                    "sensor_id": sensor.get("id"),
                    "sensor_name": sensor.get("name"),
                    "severity": event.get("severity", "HIGH")
                }
            )
            
            if result:
                logger.info(f"Fall push notification sent for {event_type}: {len(tokens)} recipients")
            
        except ImportError:
            logger.warning("push_notification_service not available for fall notifications")
        except Exception as e:
            logger.error(f"Failed to send fall push notification: {e}")


# Global MQTT service instance
mqtt_service: Optional[MQTTService] = None


async def init_mqtt_service(
    db: AsyncIOMotorDatabase,
    broadcast_callback: Callable,
    broker_host: str = "38.242.254.49",
    broker_port: int = 1883
) -> MQTTService:
    """Initialize and start the MQTT service"""
    global mqtt_service
    
    mqtt_service = MQTTService(
        broker_host=broker_host,
        broker_port=broker_port,
        db=db,
        broadcast_callback=broadcast_callback
    )
    
    await mqtt_service.start()
    return mqtt_service


async def stop_mqtt_service():
    """Stop the MQTT service"""
    global mqtt_service
    if mqtt_service:
        await mqtt_service.stop()
        mqtt_service = None
