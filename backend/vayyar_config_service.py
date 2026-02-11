"""
Vayyar Configuration Service
Handles MQTT publish/subscribe for device configuration, commands, and version management
Based on Vayyar Care Device API v38.42
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Callable
from motor.motor_asyncio import AsyncIOMotorDatabase

import aiomqtt

from vayyar_config_schema import (
    VayyarConfig, ConfigVersionResponse, ConfigVersionStatus,
    MqttPublishOptions, CommandType, CommandResponse,
    get_default_config_dict, COMMAND_TYPES
)

logger = logging.getLogger(__name__)


class VayyarConfigService:
    """Service for managing Vayyar radar configurations and commands"""
    
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        broker_host: str,
        broker_port: int,
        pub_topic_pattern: str = "/devices/{deviceId}/config",
        cmd_topic_pattern: str = "/devices/{deviceId}/commands",
        ack_topic_pattern: str = "/devices/{deviceId}/config/ack",
        state_topic_pattern: str = "/devices/{deviceId}/state",
        default_qos: int = 1,
        ack_timeout_sec: int = 60,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.db = db
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.pub_topic_pattern = pub_topic_pattern
        self.cmd_topic_pattern = cmd_topic_pattern
        self.ack_topic_pattern = ack_topic_pattern
        self.state_topic_pattern = state_topic_pattern
        self.default_qos = default_qos
        self.ack_timeout_sec = ack_timeout_sec
        self.username = username
        self.password = password
        
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[aiomqtt.Client] = None
        
        # Pending ACKs: correlationId -> version_id
        self._pending_acks: Dict[str, str] = {}
        self._ack_callbacks: Dict[str, Callable] = {}
        
        # Device states cache
        self._device_states: Dict[str, dict] = {}
        
        # WebSocket broadcast callback
        self.broadcast_callback: Optional[Callable] = None
    
    def set_broadcast_callback(self, callback: Callable):
        """Set callback for WebSocket broadcasts"""
        self.broadcast_callback = callback
    
    def _get_pub_topic(self, device_id: str) -> str:
        """Get config publish topic for device"""
        return self.pub_topic_pattern.replace("{deviceId}", device_id)
    
    def _get_cmd_topic(self, device_id: str) -> str:
        """Get command topic for device"""
        return self.cmd_topic_pattern.replace("{deviceId}", device_id)
    
    def _get_ack_topic(self, device_id: str) -> str:
        """Get ACK topic for device"""
        return self.ack_topic_pattern.replace("{deviceId}", device_id)
    
    def _get_state_topic(self, device_id: str) -> str:
        """Get state topic for device"""
        return self.state_topic_pattern.replace("{deviceId}", device_id)
    
    async def start(self):
        """Start the config service ACK and state listener"""
        if self.running:
            logger.warning("Config service already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run_listener())
        logger.info(f"Vayyar Config Service started - listening on {self.broker_host}:{self.broker_port}")
    
    async def stop(self):
        """Stop the config service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Vayyar Config Service stopped")
    
    async def _run_listener(self):
        """Listen for ACK and state messages"""
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
                    
                    # Subscribe to ACK topics (wildcard)
                    ack_pattern = self.ack_topic_pattern.replace("{deviceId}", "+")
                    await client.subscribe(ack_pattern)
                    logger.info(f"Config Service subscribed to ACK topic: {ack_pattern}")
                    
                    # Subscribe to state topics (wildcard)
                    state_pattern = self.state_topic_pattern.replace("{deviceId}", "+")
                    await client.subscribe(state_pattern)
                    logger.info(f"Config Service subscribed to state topic: {state_pattern}")
                    
                    async for message in client.messages:
                        try:
                            topic = str(message.topic)
                            if "/config/ack" in topic:
                                await self._handle_ack_message(message)
                            elif "/state" in topic:
                                await self._handle_state_message(message)
                        except Exception as e:
                            logger.error(f"Error handling message: {e}", exc_info=True)
                            
            except aiomqtt.MqttError as e:
                logger.error(f"MQTT error in config service: {e}")
                await asyncio.sleep(reconnect_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected error in config service: {e}", exc_info=True)
                await asyncio.sleep(reconnect_interval)
    
    async def _handle_ack_message(self, message):
        """Handle incoming ACK message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in ACK: {topic}")
            return
        
        # Extract deviceId from topic
        parts = topic.split('/')
        if len(parts) < 3:
            return
        
        device_id = parts[2]  # /devices/{deviceId}/config/ack
        correlation_id = payload.get("correlationId")
        
        logger.info(f"Received ACK from {device_id}: {payload}")
        
        # Find the version to update
        version = None
        if correlation_id and correlation_id in self._pending_acks:
            version_id = self._pending_acks.pop(correlation_id)
            version = await self.db.config_versions.find_one({"id": version_id})
        else:
            # Find latest SENT version for this device
            version = await self.db.config_versions.find_one(
                {"deviceId": device_id, "status": ConfigVersionStatus.SENT.value},
                sort=[("sentAt", -1)]
            )
        
        if version:
            # Update version status
            is_ok = payload.get("ok", payload.get("success", True))
            new_status = ConfigVersionStatus.ACKED.value if is_ok else ConfigVersionStatus.FAILED.value
            
            await self.db.config_versions.update_one(
                {"id": version["id"]},
                {"$set": {
                    "status": new_status,
                    "ackAt": datetime.now(timezone.utc).isoformat(),
                    "ackPayload": payload
                }}
            )
            
            logger.info(f"Updated config version {version['id']} to {new_status}")
            
            # Broadcast update
            if self.broadcast_callback:
                await self.broadcast_callback(version.get("tenantId"), {
                    "type": "config_ack",
                    "deviceId": device_id,
                    "versionId": version["id"],
                    "status": new_status,
                    "ackPayload": payload
                })
    
    async def _handle_state_message(self, message):
        """Handle incoming device state message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in state: {topic}")
            return
        
        # Extract deviceId from topic
        parts = topic.split('/')
        if len(parts) < 3:
            return
        
        device_id = parts[2]  # /devices/{deviceId}/state
        
        # Update cache
        self._device_states[device_id] = {
            **payload,
            "received_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Update sensor in database
        update_data = {
            "status": "ONLINE",
            "last_seen": datetime.now(timezone.utc).isoformat()
        }
        
        # Extract additional info from state
        if payload.get("versionName"):
            update_data["firmware"] = payload["versionName"]
        if payload.get("serialProduct"):
            update_data["serial_product"] = payload["serialProduct"]
        if payload.get("serialRadar"):
            update_data["serial_radar"] = payload["serialRadar"]
        if payload.get("hardware"):
            update_data["hardware"] = payload["hardware"]
        if payload.get("temperature"):
            update_data["temperature"] = payload["temperature"]
        if payload.get("status"):
            update_data["device_status"] = payload["status"]
        
        await self.db.sensors.update_one(
            {"device_id": device_id},
            {"$set": update_data}
        )
        
        logger.debug(f"Updated state for device {device_id}")
    
    def get_device_state(self, device_id: str) -> Optional[dict]:
        """Get cached device state"""
        return self._device_states.get(device_id)
    
    async def send_command(
        self,
        sensor_id: str,
        command_type: int,
        params: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None
    ) -> CommandResponse:
        """
        Send a command to a device via MQTT.
        
        Args:
            sensor_id: The platform sensor ID
            command_type: Command type (1-16)
            params: Additional command parameters
            tenant_id: Optional tenant ID for audit
        
        Returns:
            CommandResponse with result
        """
        # Get the sensor to find the MQTT device_id
        sensor = await self.db.sensors.find_one({"id": sensor_id}, {"_id": 0})
        if not sensor:
            raise ValueError(f"Sensor {sensor_id} not found")
        
        # Use the device_id field for MQTT communications
        mqtt_device_id = sensor.get("device_id") or sensor_id
        
        # Get command topic - commands go to /devices/{deviceId}/commands
        cmd_topic = self._get_cmd_topic(mqtt_device_id)  # Use commands topic
        
        # Map command type number to string name for payload
        COMMAND_TYPE_NAMES = {
            CommandType.UPLOAD_APP_LOGS.value: "UploadAppLogs",
            CommandType.UPLOAD_DEV_LOGS.value: "UploadDevLogs",
            CommandType.REBOOT_DEVICE.value: "Reboot",
            CommandType.CANCEL_ALARM.value: "CancelAlarm",
            CommandType.REBOOT_UPLOAD_LOG.value: "RebootUploadLog",
            CommandType.CANCEL_FALL.value: "CancelFall",
            CommandType.UPDATE_BASE_URL.value: "UpdateBaseUrl",
            CommandType.DOWNLOAD_FIRMWARE.value: "DownloadFirmware",
            CommandType.UPDATE_WIFI_CREDENTIALS.value: "UpdateWifiCredentials"
        }
        
        # Build command payload: {"type": "CommandName"}
        command_payload = {"type": COMMAND_TYPE_NAMES.get(command_type, f"Command{command_type}")}
        if params:
            command_payload.update(params)
        now = datetime.now(timezone.utc).isoformat()
        
        # Log command to database
        command_log = {
            "id": str(uuid.uuid4()),
            "sensorId": sensor_id,
            "deviceId": mqtt_device_id,
            "commandType": command_type,
            "commandName": COMMAND_TYPES.get(command_type, {}).get("name", f"Command {command_type}"),
            "payload": command_payload,
            "topic": cmd_topic,
            "tenantId": tenant_id,
            "sentAt": now,
            "status": "SENT"
        }
        await self.db.command_logs.insert_one(command_log)
        
        # Publish command via MQTT
        try:
            async with aiomqtt.Client(
                hostname=self.broker_host,
                port=self.broker_port,
                username=self.username,
                password=self.password
            ) as client:
                await client.publish(
                    cmd_topic,
                    json.dumps(command_payload).encode('utf-8'),
                    qos=1
                )
            
            logger.info(f"Sent command type {command_type} to {cmd_topic}: {command_payload}")
            
            return CommandResponse(
                success=True,
                command_type=command_type,
                device_id=mqtt_device_id,
                topic=cmd_topic,
                message="Command sent successfully",
                sent_at=now
            )
            
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            await self.db.command_logs.update_one(
                {"id": command_log["id"]},
                {"$set": {"status": "FAILED", "error": str(e)}}
            )
            raise
    
    async def send_bulk_commands(
        self,
        sensor_ids: list,
        command_type: int,
        params: dict = None,
        tenant_id: str = None
    ) -> dict:
        """
        Send a command to multiple devices using a SINGLE MQTT connection.
        Returns dict with 'success' and 'failed' lists.
        """
        results = {"success": [], "failed": []}

        # Map command type number to string name
        COMMAND_TYPE_NAMES = {
            CommandType.UPLOAD_APP_LOGS.value: "UploadAppLogs",
            CommandType.UPLOAD_DEV_LOGS.value: "UploadDevLogs",
            CommandType.REBOOT_DEVICE.value: "Reboot",
            CommandType.CANCEL_ALARM.value: "CancelAlarm",
            CommandType.REBOOT_UPLOAD_LOG.value: "RebootUploadLog",
            CommandType.CANCEL_FALL.value: "CancelFall",
            CommandType.UPDATE_BASE_URL.value: "UpdateBaseUrl",
            CommandType.DOWNLOAD_FIRMWARE.value: "DownloadFirmware",
            CommandType.UPDATE_WIFI_CREDENTIALS.value: "UpdateWifiCredentials"
        }

        command_payload = {"type": COMMAND_TYPE_NAMES.get(command_type, f"Command{command_type}")}
        if params:
            command_payload.update(params)
        now = datetime.now(timezone.utc).isoformat()

        # Look up all sensors first
        sensors = []
        for sid in sensor_ids:
            sensor = await self.db.sensors.find_one({"id": sid}, {"_id": 0})
            if not sensor:
                results["failed"].append({
                    "device_id": sid,
                    "status": "failed",
                    "error": f"Sensor {sid} not found"
                })
            else:
                sensors.append(sensor)

        if not sensors:
            return results

        # Open a SINGLE MQTT connection for ALL commands
        try:
            async with aiomqtt.Client(
                hostname=self.broker_host,
                port=self.broker_port,
                username=self.username,
                password=self.password
            ) as client:
                for sensor in sensors:
                    mqtt_device_id = sensor.get("device_id") or sensor["id"]
                    cmd_topic = self._get_cmd_topic(mqtt_device_id)
                    try:
                        await client.publish(
                            cmd_topic,
                            json.dumps(command_payload).encode("utf-8"),
                            qos=1
                        )
                        # Log command
                        command_log = {
                            "id": str(uuid.uuid4()),
                            "sensorId": sensor["id"],
                            "deviceId": mqtt_device_id,
                            "commandType": command_type,
                            "commandName": COMMAND_TYPES.get(command_type, {}).get("name", f"Command {command_type}"),
                            "payload": command_payload,
                            "topic": cmd_topic,
                            "tenantId": tenant_id,
                            "sentAt": now,
                            "status": "SENT"
                        }
                        await self.db.command_logs.insert_one(command_log)
                        results["success"].append({
                            "device_id": mqtt_device_id,
                            "sensor_id": sensor["id"],
                            "status": "sent"
                        })
                        logger.info(f"Bulk cmd sent to {cmd_topic}")
                    except Exception as e:
                        logger.error(f"Failed to publish to {mqtt_device_id}: {e}")
                        results["failed"].append({
                            "device_id": mqtt_device_id,
                            "status": "failed",
                            "error": str(e)
                        })
        except Exception as e:
            # If the MQTT connection itself fails, mark all remaining as failed
            logger.error(f"MQTT connection failed for bulk command: {e}")
            for sensor in sensors:
                if not any(r["device_id"] == (sensor.get("device_id") or sensor["id"]) for r in results["success"]):
                    results["failed"].append({
                        "device_id": sensor.get("device_id") or sensor["id"],
                        "status": "failed",
                        "error": str(e)
                    })

        return results

    async def get_command_history(
        self,
        sensor_id: str,
        limit: int = 20,
        skip: int = 0
    ) -> List[dict]:
        """Get command history for a sensor"""
        cursor = self.db.command_logs.find(
            {"sensorId": sensor_id},
            projection={"_id": 0}
        ).sort("sentAt", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(limit)
    
    async def publish_config(
        self,
        sensor_id: str,
        config: dict,
        options: MqttPublishOptions,
        tenant_id: Optional[str] = None
    ) -> ConfigVersionResponse:
        """Publish configuration to device via MQTT
        
        Args:
            sensor_id: The platform sensor ID (uses device_id field for MQTT topic)
            config: The configuration payload
            options: MQTT publish options
            tenant_id: Optional tenant ID
        """
        
        # Get the sensor to find the MQTT device_id
        sensor = await self.db.sensors.find_one({"id": sensor_id}, {"_id": 0})
        if not sensor:
            raise ValueError(f"Sensor {sensor_id} not found")
        
        # Use the device_id field for MQTT communications, fallback to sensor id
        mqtt_device_id = sensor.get("device_id") or sensor.get("model") or sensor_id
        serial_product = sensor.get("serial_product", "")
        
        # Generate correlation ID if not provided
        correlation_id = options.correlationId or str(uuid.uuid4())
        
        # Get topic using the MQTT device_id
        pub_topic = options.topic or self._get_pub_topic(mqtt_device_id)
        ack_topic = self._get_ack_topic(mqtt_device_id)
        
        # Get next version number (stored by sensor_id for platform tracking)
        last_version = await self.db.config_versions.find_one(
            {"sensorId": sensor_id},
            sort=[("versionNumber", -1)]
        )
        version_number = (last_version["versionNumber"] + 1) if last_version else 1
        
        # Create version record
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        version_doc = {
            "id": version_id,
            "sensorId": sensor_id,  # Platform sensor ID
            "deviceId": mqtt_device_id,  # MQTT device ID
            "serialProduct": serial_product,  # Serial number
            "tenantId": tenant_id,
            "versionNumber": version_number,
            "config": config,
            "status": ConfigVersionStatus.SENT.value,
            "sentAt": now,
            "ackAt": None,
            "ackPayload": None,
            "correlationId": correlation_id,
            "pubTopic": pub_topic,
            "ackTopic": ack_topic,
            "qos": options.qos,
            "retain": options.retain,
            "createdAt": now
        }
        
        await self.db.config_versions.insert_one(version_doc)
        
        # Track pending ACK
        self._pending_acks[correlation_id] = version_id
        
        # Prepare MQTT payload (add correlationId to envelope if desired)
        mqtt_payload = {
            **config,
            "_meta": {
                "correlationId": correlation_id,
                "sentAt": now,
                "versionNumber": version_number,
                "serialProduct": serial_product
            }
        }
        
        # Publish via MQTT
        try:
            async with aiomqtt.Client(
                hostname=self.broker_host,
                port=self.broker_port,
                username=self.username,
                password=self.password
            ) as client:
                await client.publish(
                    pub_topic,
                    json.dumps(mqtt_payload).encode('utf-8'),
                    qos=options.qos,
                    retain=options.retain
                )
            
            logger.info(f"Published config v{version_number} to {pub_topic} (device: {mqtt_device_id}, serial: {serial_product})")
            
        except Exception as e:
            logger.error(f"Failed to publish config: {e}")
            await self.db.config_versions.update_one(
                {"id": version_id},
                {"$set": {"status": ConfigVersionStatus.FAILED.value}}
            )
            raise
        
        # Schedule timeout check
        asyncio.create_task(self._check_ack_timeout(version_id, correlation_id))
        
        # Broadcast
        if self.broadcast_callback and tenant_id:
            await self.broadcast_callback(tenant_id, {
                "type": "config_sent",
                "sensorId": sensor_id,
                "deviceId": mqtt_device_id,
                "serialProduct": serial_product,
                "versionId": version_id,
                "versionNumber": version_number
            })
        
        return ConfigVersionResponse(
            id=version_id,
            deviceId=mqtt_device_id,
            versionNumber=version_number,
            config=config,
            status=ConfigVersionStatus.SENT.value,
            sentAt=now,
            correlationId=correlation_id,
            pubTopic=pub_topic,
            ackTopic=ack_topic,
            qos=options.qos,
            retain=options.retain,
            createdAt=now
        )
    
    async def _check_ack_timeout(self, version_id: str, correlation_id: str):
        """Check for ACK timeout and update status"""
        await asyncio.sleep(self.ack_timeout_sec)
        
        if correlation_id in self._pending_acks:
            self._pending_acks.pop(correlation_id, None)
            
            # Check if still in SENT status
            version = await self.db.config_versions.find_one({"id": version_id})
            if version and version["status"] == ConfigVersionStatus.SENT.value:
                await self.db.config_versions.update_one(
                    {"id": version_id},
                    {"$set": {"status": ConfigVersionStatus.TIMEOUT.value}}
                )
                logger.warning(f"Config version {version_id} timed out")
    
    async def get_latest_config(self, sensor_id: str) -> Optional[dict]:
        """Get latest configuration for a sensor"""
        version = await self.db.config_versions.find_one(
            {"sensorId": sensor_id},
            sort=[("versionNumber", -1)],
            projection={"_id": 0}
        )
        return version
    
    async def get_config_versions(
        self,
        sensor_id: str,
        limit: int = 20,
        skip: int = 0
    ) -> List[dict]:
        """Get configuration versions for a sensor"""
        cursor = self.db.config_versions.find(
            {"sensorId": sensor_id},
            projection={"_id": 0}
        ).sort("versionNumber", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(limit)
    
    async def rollback_to_version(
        self,
        sensor_id: str,
        version_number: int,
        tenant_id: Optional[str] = None
    ) -> ConfigVersionResponse:
        """Rollback to a specific version"""
        version = await self.db.config_versions.find_one({
            "sensorId": sensor_id,
            "versionNumber": version_number
        })
        
        if not version:
            raise ValueError(f"Version {version_number} not found for sensor {sensor_id}")
        
        # Republish the config
        options = MqttPublishOptions(
            qos=version.get("qos", 1),
            retain=version.get("retain", False)
        )
        
        return await self.publish_config(
            sensor_id,
            version["config"],
            options,
            tenant_id
        )
    
    async def retry_send(self, version_id: str) -> ConfigVersionResponse:
        """Retry sending a failed/timed out config"""
        version = await self.db.config_versions.find_one({"id": version_id})
        
        if not version:
            raise ValueError(f"Version {version_id} not found")
        
        if version["status"] not in [ConfigVersionStatus.FAILED.value, ConfigVersionStatus.TIMEOUT.value]:
            raise ValueError(f"Cannot retry version with status {version['status']}")
        
        options = MqttPublishOptions(
            qos=version.get("qos", 1),
            retain=version.get("retain", False)
        )
        
        return await self.publish_config(
            version["sensorId"],
            version["config"],
            options,
            version.get("tenantId")
        )
    
    # Template Management
    async def create_template(
        self,
        name: str,
        config: dict,
        description: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> dict:
        """Create a configuration template"""
        template = {
            "id": str(uuid.uuid4()),
            "name": name,
            "description": description,
            "config": config,
            "tenantId": tenant_id,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.config_templates.insert_one(template)
        return {k: v for k, v in template.items() if k != "_id"}
    
    async def get_templates(self, tenant_id: Optional[str] = None) -> List[dict]:
        """Get all configuration templates"""
        query = {}
        if tenant_id:
            query["$or"] = [{"tenantId": tenant_id}, {"tenantId": None}]
        
        cursor = self.db.config_templates.find(query, projection={"_id": 0})
        return await cursor.to_list(100)
    
    async def get_template(self, template_id: str) -> Optional[dict]:
        """Get a specific template"""
        return await self.db.config_templates.find_one(
            {"id": template_id},
            projection={"_id": 0}
        )
    
    async def delete_template(self, template_id: str) -> bool:
        """Delete a template"""
        result = await self.db.config_templates.delete_one({"id": template_id})
        return result.deleted_count > 0
    
    async def update_template(
        self,
        template_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        config: Optional[dict] = None,
        is_system: Optional[bool] = None
    ) -> Optional[dict]:
        """Update a configuration template"""
        update_data = {"updatedAt": datetime.now(timezone.utc).isoformat()}
        if name is not None:
            update_data["name"] = name
        if description is not None:
            update_data["description"] = description
        if config is not None:
            update_data["config"] = config
        if is_system is not None:
            update_data["isSystem"] = is_system
        
        result = await self.db.config_templates.find_one_and_update(
            {"id": template_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        return result
    
    async def send_bulk_config(
        self,
        device_ids: List[str],
        config: dict,
        options: MqttPublishOptions,
        tenant_id: Optional[str] = None
    ) -> dict:
        """Send configuration to multiple devices"""
        results = {
            "total": len(device_ids),
            "success_count": 0,
            "failed_count": 0,
            "results": []
        }
        
        for device_id in device_ids:
            try:
                # Get sensor info
                sensor = await self.db.sensors.find_one({"id": device_id})
                if not sensor:
                    results["results"].append({
                        "deviceId": device_id,
                        "success": False,
                        "error": "Sensor not found"
                    })
                    results["failed_count"] += 1
                    continue
                
                # Send config to this device
                version = await self.publish_config(
                    device_id,
                    config,
                    options,
                    tenant_id
                )
                
                results["results"].append({
                    "deviceId": device_id,
                    "success": True,
                    "versionId": version.id,
                    "versionNumber": version.versionNumber
                })
                results["success_count"] += 1
                
            except Exception as e:
                logger.error(f"Failed to send config to {device_id}: {e}")
                results["results"].append({
                    "deviceId": device_id,
                    "success": False,
                    "error": str(e)
                })
                results["failed_count"] += 1
        
        return results


# Global service instance
vayyar_config_service: Optional[VayyarConfigService] = None


async def init_vayyar_config_service(
    db: AsyncIOMotorDatabase,
    broker_host: str,
    broker_port: int
) -> VayyarConfigService:
    """Initialize the Vayyar config service"""
    global vayyar_config_service
    
    vayyar_config_service = VayyarConfigService(
        db=db,
        broker_host=broker_host,
        broker_port=broker_port,
        pub_topic_pattern=os.environ.get("MQTT_PUB_TOPIC", "/devices/{deviceId}/config"),
        cmd_topic_pattern=os.environ.get("MQTT_CMD_TOPIC", "/devices/{deviceId}/commands"),
        ack_topic_pattern=os.environ.get("MQTT_ACK_TOPIC", "/devices/{deviceId}/config/ack"),
        state_topic_pattern=os.environ.get("MQTT_STATE_TOPIC", "/devices/{deviceId}/state"),
        default_qos=int(os.environ.get("MQTT_QOS", "1")),
        ack_timeout_sec=int(os.environ.get("MQTT_ACK_TIMEOUT", "60"))
    )
    
    await vayyar_config_service.start()
    return vayyar_config_service


async def stop_vayyar_config_service():
    """Stop the Vayyar config service"""
    global vayyar_config_service
    if vayyar_config_service:
        await vayyar_config_service.stop()
        vayyar_config_service = None
