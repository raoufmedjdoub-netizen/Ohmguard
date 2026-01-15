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

import aiomqtt
from motor.motor_asyncio import AsyncIOMotorDatabase

# Import radar event models
from radar_event_models import (
    RadarEventType, PresenceStatus, EventSeverity, EventStatus,
    RadarEventPayload, RadarEventRequest,
    normalize_radar_event, extract_active_regions, epoch_ms_to_iso,
    format_active_regions_display, format_target_count_display
)

logger = logging.getLogger(__name__)

# Vayyar event type mapping (for legacy support)
VAYYAR_EVENT_TYPES = {
    0: "PRESENCE",      # Presence detection  
    1: "FALL",          # Fall detected
    2: "PRE_FALL",      # Pre-fall detected
    3: "INACTIVITY",    # Inactivity detected
    4: "PRESENCE",      # Presence event
    5: "LYING",         # Person lying down
    6: "SITTING",       # Person sitting
    7: "STANDING",      # Person standing
    8: "WALKING",       # Person walking
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
        """
        sensor = await self._get_sensor_by_device_id(device_id)
        
        if not sensor:
            logger.warning(f"Unknown device {device_id} sent event, attempting auto-registration")
            sensor = await self._auto_register_sensor(device_id, {})
            if not sensor:
                return
        
        # Log the raw payload for debugging
        logger.info(f"Event from {device_id}: type={payload.get('type')}, payload_keys={list(payload.get('payload', {}).keys()) if isinstance(payload.get('payload'), dict) else 'N/A'}")
        
        event_type_code = payload.get("type", 0)
        event_payload = payload.get("payload", {})
        
        # If payload is not a dict, try to use the root payload
        if not isinstance(event_payload, dict):
            logger.warning(f"Event payload is not a dict, using root payload. Type: {type(event_payload)}")
            event_payload = payload
        
        # EARLY EXIT: Ignore PRESENCE events where presenceDetected is false
        # These "absence" messages are noise and should not create events in the database
        # BUT we still need to update the sensor's current presence state
        presence_detected = event_payload.get("presenceDetected", False)
        if event_type_code == 4 and not presence_detected:  # type 4 = PRESENCE
            logger.debug(f"Ignoring absence event from {device_id} (presenceDetected=false)")
            # Update sensor with current presence state (absence) and last_seen
            await self.db.sensors.update_one(
                {"id": sensor['id']},
                {"$set": {
                    "status": "ONLINE", 
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                    "current_presence": False,  # No presence currently
                    "current_target_count": 0,
                    "presence_updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            # Broadcast presence update to frontend
            if self.broadcast_callback:
                await self.broadcast_callback(sensor['tenant_id'], {
                    "type": "presence_update",
                    "sensor_id": sensor['id'],
                    "device_id": device_id,
                    "presence_detected": False,
                    "target_count": 0,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
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
        
        # Determine if we should store this event
        # Skip ALL PRESENCE events with no detection (presenceDetected=false) to avoid flooding
        # These are "absence" notifications and should not be recorded as events
        if normalized.eventType == RadarEventType.PRESENCE and not normalized.presenceDetected:
            logger.debug(f"Skipping absence event from {device_id} (presenceDetected=false, targets={normalized.targetCount})")
            return
        
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
        
        # Update sensor last_seen AND current presence state
        sensor_update = {
            "status": "ONLINE", 
            "last_seen": datetime.now(timezone.utc).isoformat()
        }
        # For PRESENCE events, also update the current presence state
        if normalized.eventType == RadarEventType.PRESENCE:
            sensor_update["current_presence"] = normalized.presenceDetected
            sensor_update["current_target_count"] = normalized.targetCount
            sensor_update["current_active_regions"] = normalized.activeRegions
            sensor_update["presence_updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": sensor_update}
        )
        
        logger.info(f"Created {normalized.eventType.value} event from device {device_id}, "
                   f"presence={normalized.presenceDetected}, regions={normalized.activeRegions}, "
                   f"targets={normalized.targetCount}")
        
        # Broadcast to WebSocket with enriched data
        if self.broadcast_callback:
            # Create a clean copy of event without MongoDB _id (ObjectId is not JSON serializable)
            event_for_broadcast = {k: v for k, v in event.items() if k != '_id'}
            
            # Send new event notification
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "new_radar_event",
                "event": {
                    **event_for_broadcast,
                    "sensor_name": sensor.get('name'),
                    "active_regions_display": format_active_regions_display(normalized.activeRegions),
                    "target_count_display": format_target_count_display(normalized.targetCount),
                    "presence_display": "Présence détectée" if normalized.presenceDetected else "Aucune présence"
                }
            })
            
            # Also send presence state update for real-time badge updates
            if normalized.eventType == RadarEventType.PRESENCE:
                await self.broadcast_callback(sensor['tenant_id'], {
                    "type": "presence_update",
                    "sensor_id": sensor['id'],
                    "device_id": device_id,
                    "presence_detected": normalized.presenceDetected,
                    "target_count": normalized.targetCount,
                    "active_regions": normalized.activeRegions,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
        
        # Trigger alert rules for HIGH severity events
        if normalized.severity == EventSeverity.HIGH:
            await self._process_alert_rules(event, sensor)
    
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
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "new_event",
                "event": event
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
