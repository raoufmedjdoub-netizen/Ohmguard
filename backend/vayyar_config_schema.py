"""
Vayyar Radar Configuration Schema and Validation
Based on the official Vayyar Care Device API v38.42
All enum values are NUMERIC as per the API specification
Supports backward compatibility with string enum values
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Union, Any, Dict
from enum import IntEnum
from datetime import datetime
import uuid


# ==================== ENUMS (NUMERIC VALUES) ====================

class LedMode(IntEnum):
    """LED Mode - numeric values"""
    ALL_OFF = 0
    ALL_ON = 1
    STATUS_ONLY = 2


class TelemetryPolicy(IntEnum):
    """Telemetry Policy - numeric values"""
    OFF = 0
    ON = 1
    ON_DEMAND = 2


class TelemetryTransport(IntEnum):
    """Telemetry Transport - numeric values"""
    MQTT_QOS0 = 0
    MQTT_QOS1 = 1
    HTTP = 2


class TrackerTargetsDebugPolicy(IntEnum):
    """Tracker Targets Debug Policy - numeric values"""
    OFF = 0
    ON = 1
    VERBOSE = 2


class FallingSensitivity(IntEnum):
    """Falling Sensitivity - numeric values"""
    LOW = 0
    MEDIUM = 1
    HIGH = 2


class SensorMounting(IntEnum):
    """Sensor Mounting Position - numeric values"""
    WALL = 0
    CEILING = 1
    CORNER = 2


class LogLevel(IntEnum):
    """Log Level - numeric values"""
    VERBOSE = -1
    DEBUG = 0
    INFO = 1
    WARNING = 2
    ERROR = 3


class DeviceStatus(str):
    """Device Status - string values as per API"""
    MONITORING = "monitoring"
    LEARNING = "learning"
    TEST = "test"
    SILENT = "silent"
    SOFTWARE_UPDATE = "software update"


# ==================== COMMAND TYPES (Downstream MQTT) ====================

class CommandType(IntEnum):
    """Device command types for MQTT downstream messages - numeric values"""
    UPLOAD_APP_LOGS = 1
    UPLOAD_DEV_LOGS = 2
    REBOOT_DEVICE = 3
    CANCEL_ALARM = 4
    REBOOT_UPLOAD_LOG = 6
    CANCEL_FALL = 7
    UPDATE_BASE_URL = 8
    DOWNLOAD_FIRMWARE = 10
    UPDATE_WIFI_CREDENTIALS = 16


from enum import Enum

class ConfigVersionStatus(str, Enum):
    """Configuration version status"""
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACKED = "ACKED"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"


# ==================== STRING TO INT MAPPINGS (for backward compatibility) ====================

LED_MODE_MAP = {
    "AllOff": 0, "alloff": 0, "ALL_OFF": 0,
    "AllOn": 1, "allon": 1, "ALL_ON": 1,
    "StatusOnly": 2, "statusonly": 2, "STATUS_ONLY": 2
}

LOG_LEVEL_MAP = {
    "V_LOG_LEVEL_VERBOSE": -1, "Verbose": -1, "verbose": -1, "VERBOSE": -1,
    "V_LOG_LEVEL_DEBUG": 0, "Debug": 0, "debug": 0, "DEBUG": 0,
    "V_LOG_LEVEL_INFO": 1, "Info": 1, "info": 1, "INFO": 1,
    "V_LOG_LEVEL_WARNING": 2, "Warning": 2, "warning": 2, "WARNING": 2,
    "V_LOG_LEVEL_ERROR": 3, "Error": 3, "error": 3, "ERROR": 3
}

TELEMETRY_POLICY_MAP = {
    "Off": 0, "off": 0, "OFF": 0,
    "On": 1, "on": 1, "ON": 1,
    "OnDemand": 2, "ondemand": 2, "ON_DEMAND": 2
}

TELEMETRY_TRANSPORT_MAP = {
    "MqttQos0": 0, "mqttqos0": 0, "MQTT_QOS0": 0,
    "MqttQos1": 1, "mqttqos1": 1, "MQTT_QOS1": 1,
    "Http": 2, "http": 2, "HTTP": 2
}

TRACKER_DEBUG_MAP = {
    "OFF": 0, "Off": 0, "off": 0,
    "ON": 1, "On": 1, "on": 1,
    "VERBOSE": 2, "Verbose": 2, "verbose": 2
}

FALLING_SENSITIVITY_MAP = {
    "LowSensitivity": 0, "Low": 0, "low": 0, "LOW": 0,
    "MediumSensitivity": 1, "Medium": 1, "medium": 1, "MEDIUM": 1,
    "HighSensitivity": 2, "High": 2, "high": 2, "HIGH": 2
}

SENSOR_MOUNTING_MAP = {
    "Wall": 0, "wall": 0, "WALL": 0,
    "Ceiling": 1, "ceiling": 1, "CEILING": 1,
    "Corner": 2, "corner": 2, "CORNER": 2
}


def convert_enum_value(value, mapping, default=0):
    """Convert string enum to int, or return int as-is"""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return mapping.get(value, default)
    return default


# ==================== FLEXIBLE TYPE ====================

FlexibleValue = Union[bool, int, float, str, None]


# ==================== SUB-MODELS ====================

class DryContactConfig(BaseModel):
    """Dry contact configuration"""
    mode: int = 0
    policy: int = 0


class DryContacts(BaseModel):
    """Dry contacts configuration (primary and secondary)"""
    primary: DryContactConfig = Field(default_factory=DryContactConfig)
    secondary: DryContactConfig = Field(default_factory=DryContactConfig)


class TrackerSubRegion(BaseModel):
    """
    Tracker sub-region for zone-based detection.
    Defines a 3D zone within the radar's field of view.
    """
    xMin: float = 0
    xMax: float = 1
    yMin: float = 0.3
    yMax: float = 1
    zMin: float = 0
    zMax: float = 1.2
    mode: int = 0
    enterDuration: int = 10
    exitDuration: int = 30
    isFallingDetection: bool = False
    isPresenceDetection: bool = True
    isLowSnr: bool = True
    isHorizontal: bool = True
    isDoor: bool = False
    name: str = "region"

    class Config:
        extra = "allow"


class WifiState(BaseModel):
    """WiFi connection state"""
    ssid: Optional[str] = None
    rssi: Optional[str] = None
    bssid: Optional[str] = None


class LoggerStats(BaseModel):
    """Logger statistics from device"""
    bytesLogged: int = 0
    flashBadSectors: int = 0
    flashEraseErrors: int = 0
    flashSectorsErased: int = 0
    flashWriteErrors: int = 0
    msgsLogged: int = 0


# ==================== APP CONFIG (NUMERIC ENUMS with backward compatibility) ====================

class AppConfig(BaseModel):
    """
    Application configuration section.
    Controls device behavior, alerts, telemetry, and communication.
    All enum values are NUMERIC as per API specification.
    Supports string values for backward compatibility.
    """
    # Mode settings
    silentMode: bool = False
    demoMode: bool = False
    enableTestMode: Union[bool, str] = False
    offlineMode: bool = True
    
    # LED configuration (NUMERIC: 0=AllOff, 1=AllOn, 2=StatusOnly)
    ledMode: Union[int, str] = 0
    
    # Audio
    volume: int = 100
    
    # Logging (NUMERIC: -1=Verbose, 0=Debug, 1=Info, 2=Warning, 3=Error)
    logLevel: Union[int, str] = -1
    
    # Alert timing
    confirmedToAlertTimeoutSec: int = 40
    callingDurationSec: int = 30
    
    # Presence reporting
    presenceReportMinRateMills: int = 60000
    
    # Learning mode timestamps (can be 0 or timestamp)
    learningModeEndTs: Union[int, str] = 0
    learningModeStartTs: Union[int, str] = 0
    
    # DSP records
    dspRecordsPublishPolicy: bool = False
    
    # Analytics
    enableAnalytics: bool = True
    
    # Telemetry settings (NUMERIC: 0=Off, 1=On, 2=OnDemand)
    telemetryPolicy: Union[int, str] = 0
    telemetryTransport: Union[int, str] = 0
    telemetryEnabled: bool = False
    
    # Dry contacts
    dryContacts: DryContacts = Field(default_factory=DryContacts)
    dryContactActivationDuration_sec: Union[int, float, str] = 30
    
    # Tracker debug (NUMERIC: 0=Off, 1=On, 2=Verbose)
    trackerTargetsDebugPolicy: Union[int, str] = 0
    
    # Door events
    enableDoorEvents: bool = False
    
    # Bed exit / Out of bed
    enableOutOfBed: bool = False
    
    # Sensitive mode (sensitive falls)
    enableSensitiveMode: bool = False
    sensitivityLevel: float = 0.78
    
    # Falling detection thresholds
    thMinEventsForFirstDecision: int = 12
    thNumOfDetectionsInChain: int = 11
    
    # Max time in buffer
    max_time_in_buffer: int = 600
    
    # BLE configuration
    enableBeaconScanner: bool = False
    bleBeaconRssiThreshold: int = -80
    
    # RSSI monitoring
    enableRssiMonitor: bool = False
    rssiThresholdRssiMonitor: int = -70
    samplesNumRssiMonitor: int = 30
    
    # WiFi health monitoring
    enableWifiHealthMonitor: bool = False
    
    # MQTT reporting
    reportFallsToMqtt: bool = True
    reportPresenceToMqtt: bool = True

    # Validators to convert string enums to int
    @field_validator('ledMode', mode='before')
    @classmethod
    def convert_led_mode(cls, v):
        return convert_enum_value(v, LED_MODE_MAP, 0)
    
    @field_validator('logLevel', mode='before')
    @classmethod
    def convert_log_level(cls, v):
        return convert_enum_value(v, LOG_LEVEL_MAP, -1)
    
    @field_validator('telemetryPolicy', mode='before')
    @classmethod
    def convert_telemetry_policy(cls, v):
        return convert_enum_value(v, TELEMETRY_POLICY_MAP, 0)
    
    @field_validator('telemetryTransport', mode='before')
    @classmethod
    def convert_telemetry_transport(cls, v):
        return convert_enum_value(v, TELEMETRY_TRANSPORT_MAP, 0)
    
    @field_validator('trackerTargetsDebugPolicy', mode='before')
    @classmethod
    def convert_tracker_debug(cls, v):
        return convert_enum_value(v, TRACKER_DEBUG_MAP, 0)

    class Config:
        extra = "allow"


# ==================== WALABOT CONFIG (NUMERIC ENUMS with backward compatibility) ====================

class WalabotConfig(BaseModel):
    """
    Walabot sensor configuration section.
    Controls radar parameters, detection zones, and sensitivity.
    All enum values are NUMERIC as per API specification.
    Supports string values for backward compatibility.
    """
    # Arena boundaries (meters)
    xMin: float = -1.8
    xMax: float = 1.8
    yMin: float = 0.3
    yMax: float = 3.5
    zMin: float = 0
    zMax: float = 1.8
    
    # Sensor position
    sensorHeight: float = 1.5
    
    # Sensor mounting (NUMERIC: 0=Wall, 1=Ceiling, 2=Corner)
    sensorMounting: Union[int, str] = 0
    
    # Tracker sub-regions (zones)
    trackerSubRegions: List[TrackerSubRegion] = Field(default_factory=list)
    
    # Falling detection (NUMERIC: 0=Low, 1=Medium, 2=High)
    fallingSensitivity: Union[int, str] = 0
    maxTargetsForFallingTrigger: int = 0
    durationUntilConfirm_sec: Union[int, float] = 52
    minTimeOfTarInFallLoc_sec: Union[int, float] = 30
    fallingMitigatorEnabled: bool = False
    
    # Presence detection
    performHeatup: bool = True
    performAgc: bool = True
    enterDuration: int = 10
    exitDuration: int = 30
    
    # Bed exit detection (can be bool or "false" string as per API)
    bedExitEnabled: Union[bool, str] = "false"
    
    # Dry contact
    dryContactActivationDuration_sec: Union[int, float] = 30
    
    # Telemetry
    enableAboveThPointTelemetry: bool = False

    # Validators to convert string enums to int
    @field_validator('sensorMounting', mode='before')
    @classmethod
    def convert_sensor_mounting(cls, v):
        return convert_enum_value(v, SENSOR_MOUNTING_MAP, 0)
    
    @field_validator('fallingSensitivity', mode='before')
    @classmethod
    def convert_falling_sensitivity(cls, v):
        return convert_enum_value(v, FALLING_SENSITIVITY_MAP, 0)

    class Config:
        extra = "allow"


# ==================== COMPLETE CONFIG ====================

class VayyarConfig(BaseModel):
    """Complete Vayyar radar configuration payload (downstream config)"""
    appConfig: AppConfig = Field(default_factory=AppConfig)
    walabotConfig: WalabotConfig = Field(default_factory=WalabotConfig)

    class Config:
        extra = "allow"


# ==================== MQTT COMMANDS (Downstream) ====================

class BaseCommand(BaseModel):
    """Base command model"""
    id: str
    timestamp: int
    type: str


class CommandWithBaseUrl(BaseCommand):
    """Command with baseUrl parameter"""
    baseUrl: str


class CommandWithFirmware(BaseCommand):
    """Command with firmware parameters"""
    url: Optional[str] = None
    version: Optional[str] = None


class CommandWithWifi(BaseCommand):
    """Command with WiFi parameters"""
    ssid: str
    password: str


# ==================== DEVICE STATE (Upstream) ====================

class DeviceState(BaseModel):
    """Device state message (upstream from device)"""
    timestamp: int  # milliseconds since epoch
    temperature: float  # DSP temperature
    status: str  # monitoring, learning, test, silent, software update
    upTime: int  # milliseconds since boot
    deviceId: str
    memoryUsage: Optional[int] = None  # Available heap in Kb
    wifiState: Optional[WifiState] = None
    wifiMac: Optional[str] = None
    factoryBurnTime: Optional[str] = None
    hardware: Optional[str] = None
    hwRevRadar: Optional[str] = None
    model: Optional[str] = None
    serialProduct: Optional[str] = None
    serialRadar: Optional[str] = None
    versionName: Optional[str] = None
    loggerStats: Optional[LoggerStats] = None

    class Config:
        extra = "allow"


# ==================== MQTT PUBLISH OPTIONS ====================

class MqttPublishOptions(BaseModel):
    """MQTT publish options"""
    qos: int = Field(default=1, ge=0, le=2)
    retain: bool = False
    correlationId: Optional[str] = None
    topic: Optional[str] = None  # Override default topic


# ==================== CONFIG VERSION ====================

class ConfigVersionCreate(BaseModel):
    """Create a new config version"""
    config: VayyarConfig
    mqttOptions: MqttPublishOptions = Field(default_factory=MqttPublishOptions)


class ConfigVersionResponse(BaseModel):
    """Response for config version"""
    id: str
    deviceId: str
    versionNumber: int
    config: dict
    status: str
    sentAt: Optional[str] = None
    ackAt: Optional[str] = None
    ackPayload: Optional[dict] = None
    correlationId: Optional[str] = None
    pubTopic: str
    ackTopic: Optional[str] = None
    qos: int
    retain: bool
    createdAt: str


# ==================== CONFIG TEMPLATE ====================

class ConfigTemplate(BaseModel):
    """Configuration template for reuse"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    config: VayyarConfig
    createdAt: str = Field(default_factory=lambda: datetime.now().isoformat())


# ==================== COMMAND REQUEST/RESPONSE ====================

class CommandRequest(BaseModel):
    """Request to send a command to a device"""
    command_type: int = Field(..., description="Command type (1-16)")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Additional command parameters")


class CommandResponse(BaseModel):
    """Response after sending a command"""
    success: bool
    command_type: int
    device_id: str
    topic: str
    message: str
    sent_at: str


# ==================== DEFAULT CONFIG ====================

DEFAULT_CONFIG = VayyarConfig(
    appConfig=AppConfig(),
    walabotConfig=WalabotConfig()
)


def get_default_config_dict() -> dict:
    """Get default configuration as dictionary"""
    return DEFAULT_CONFIG.model_dump()


# ==================== ENUM VALUES FOR FRONTEND (NUMERIC) ====================

ENUM_VALUES = {
    "ledMode": [
        {"value": 0, "label": "Éteint (AllOff)"},
        {"value": 1, "label": "Allumé (AllOn)"},
        {"value": 2, "label": "Statut uniquement (StatusOnly)"}
    ],
    "logLevel": [
        {"value": -1, "label": "Verbose"},
        {"value": 0, "label": "Debug"},
        {"value": 1, "label": "Info"},
        {"value": 2, "label": "Warning"},
        {"value": 3, "label": "Error"}
    ],
    "telemetryPolicy": [
        {"value": 0, "label": "Désactivé (Off)"},
        {"value": 1, "label": "Activé (On)"},
        {"value": 2, "label": "À la demande (OnDemand)"}
    ],
    "telemetryTransport": [
        {"value": 0, "label": "MQTT QoS 0"},
        {"value": 1, "label": "MQTT QoS 1"},
        {"value": 2, "label": "HTTP"}
    ],
    "trackerTargetsDebugPolicy": [
        {"value": 0, "label": "Désactivé (Off)"},
        {"value": 1, "label": "Activé (On)"},
        {"value": 2, "label": "Verbose"}
    ],
    "fallingSensitivity": [
        {"value": 0, "label": "Basse (Low)"},
        {"value": 1, "label": "Moyenne (Medium)"},
        {"value": 2, "label": "Haute (High)"}
    ],
    "sensorMounting": [
        {"value": 0, "label": "Mur (Wall)"},
        {"value": 1, "label": "Plafond (Ceiling)"},
        {"value": 2, "label": "Coin (Corner)"}
    ]
}


COMMAND_TYPES = {
    1: {"name": "Upload App Logs", "description": "Demander au radar d'uploader ses logs applicatifs"},
    2: {"name": "Upload Dev Logs", "description": "Demander au radar d'uploader ses logs développeur"},
    3: {"name": "Reboot Device", "description": "Redémarrer le radar"},
    4: {"name": "Cancel Alarm", "description": "Annuler l'alarme en cours"},
    6: {"name": "Reboot + Upload Log", "description": "Redémarrer et uploader les logs"},
    7: {"name": "Cancel Fall", "description": "Annuler la détection de chute en cours"},
    8: {"name": "Update Base URL", "description": "Mettre à jour l'URL de base"},
    10: {"name": "Download Firmware", "description": "Télécharger une mise à jour firmware"},
    16: {"name": "Update WiFi", "description": "Mettre à jour les identifiants WiFi (déprécié)"}
}
