"""
Vayyar Radar Configuration Schema and Validation
Based on the official Vayyar Care Device API v38.42
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Union, Any, Dict
from enum import Enum
from datetime import datetime
import uuid


# ==================== ENUMS ====================

class LedMode(str, Enum):
    ALL_OFF = "AllOff"
    ALL_ON = "AllOn"
    STATUS_ONLY = "StatusOnly"


class LedPolicy(str, Enum):
    ERRORS_ONLY = "ErrorsOnly"
    ALWAYS_ON = "AlwaysOn"
    OFF = "Off"


class LogLevel(str, Enum):
    VERBOSE = "V_LOG_LEVEL_VERBOSE"
    DEBUG = "V_LOG_LEVEL_DEBUG"
    INFO = "V_LOG_LEVEL_INFO"
    WARNING = "V_LOG_LEVEL_WARNING"
    ERROR = "V_LOG_LEVEL_ERROR"


class TelemetryPolicy(str, Enum):
    OFF = "Off"
    ON = "On"
    ON_DEMAND = "OnDemand"


class TelemetryTransport(str, Enum):
    MQTT_QOS0 = "MqttQos0"
    MQTT_QOS1 = "MqttQos1"
    HTTP = "Http"


class TrackerTargetsDebugPolicy(str, Enum):
    OFF = "OFF"
    ON = "ON"
    VERBOSE = "VERBOSE"


class AlgoProfile(str, Enum):
    TRACKING = "TRACKING"
    PRESENCE = "PRESENCE"
    FALLING = "FALLING"


class AppLogLevel(str, Enum):
    DISABLE = "Disable"
    ERROR = "Error"
    WARNING = "Warning"
    INFO = "Info"
    DEBUG = "Debug"
    VERBOSE = "Verbose"


class BleServerType(str, Enum):
    OFF = "OFF"
    GATT = "GATT"
    BEACON = "BEACON"


class FallingSensitivity(str, Enum):
    LOW = "LowSensitivity"
    MEDIUM = "MediumSensitivity"
    HIGH = "HighSensitivity"


class SensorMounting(str, Enum):
    WALL = "Wall"
    CEILING = "Ceiling"
    CORNER = "Corner"


class RfRegulationZone(str, Enum):
    WW = "WW"
    US = "US"
    EU = "EU"
    JP = "JP"


class RfBandWidth(str, Enum):
    BW500 = "BW500"
    BW1000 = "BW1000"
    BW1500 = "BW1500"


class ProductType(str, Enum):
    FALLING = "Falling"
    PRESENCE = "Presence"
    TRACKING = "Tracking"


class ConfigVersionStatus(str, Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACKED = "ACKED"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"


class DeviceStatus(str, Enum):
    MONITORING = "monitoring"
    LEARNING = "learning"
    TEST = "test"
    SILENT = "silent"
    SOFTWARE_UPDATE = "software update"


# ==================== COMMAND TYPES (Downstream MQTT) ====================

class CommandType(int, Enum):
    """Device command types for MQTT downstream messages"""
    UPLOAD_APP_LOGS = 1
    UPLOAD_DEV_LOGS = 2
    REBOOT_DEVICE = 3
    CANCEL_ALARM = 4
    REBOOT_UPLOAD_LOG = 6
    CANCEL_FALL = 7
    UPDATE_BASE_URL = 8
    DOWNLOAD_FIRMWARE = 10
    UPDATE_WIFI_CREDENTIALS = 16


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


# ==================== APP CONFIG ====================

class AppConfig(BaseModel):
    """
    Application configuration section.
    Controls device behavior, alerts, telemetry, and communication.
    """
    # Mode settings
    silentMode: bool = False
    demoMode: bool = False
    enableTestMode: bool = False
    offlineMode: bool = True
    
    # LED configuration
    ledMode: str = "AllOff"  # AllOff, AllOn, StatusOnly
    ledPolicy: str = "ErrorsOnly"  # ErrorsOnly, AlwaysOn, Off
    
    # Audio
    volume: FlexibleValue = 100
    
    # Logging
    logLevel: str = "V_LOG_LEVEL_VERBOSE"
    appLogAutoLevel: str = "Disable"
    appLogOnDemandLevel: str = "Disable"
    legacyLogFileUpload: bool = True
    
    # Alert timing
    confirmedToAlertTimeoutSec: int = 40
    callingDurationSec: int = 30
    
    # Presence reporting
    presenceReportMinRateMills: int = 60000
    enablePresencePeriodicReport: bool = True
    
    # Learning mode timestamps
    learningModeEndTs: FlexibleValue = False
    learningModeStartTs: FlexibleValue = False
    
    # DSP records
    dspRecordsPublishPolicy: FlexibleValue = False
    dspRecordsPublishMaxLatency_sec: int = 10
    
    # Analytics
    enableAnalytics: bool = True
    
    # Telemetry settings
    telemetryPolicy: str = "Off"  # Off, On, OnDemand
    telemetryTransport: str = "MqttQos0"  # MqttQos0, MqttQos1, Http
    telemetryEnabled: bool = False
    
    # Telemetry events
    telemAlwaysON: bool = False
    telemOnFall: bool = True
    telemOnSensitiveFall: bool = True
    telemOnBedExit: bool = True
    telemOnDoorEvents: bool = False
    telemOnOutOfBed: bool = False
    
    # Dry contacts
    dryContacts: DryContacts = Field(default_factory=DryContacts)
    dryContactActivationDuration_sec: FlexibleValue = "30.0"
    
    # Tracker debug
    trackerTargetsDebugPolicy: str = "OFF"  # OFF, ON, VERBOSE
    
    # Door events
    enableDoorEvents: bool = False
    
    # Bed exit / Out of bed
    enableOutOfBed: bool = False
    
    # Sensitive mode (sensitive falls)
    enableSensitiveMode: bool = False
    sensitivityLevel: float = 0.7
    
    # Falling detection thresholds
    thMinEventsForFirstDecision: int = 12
    thNumOfDetectionsInChain: int = 11
    
    # Algorithm profile
    algoProfile: str = "TRACKING"  # TRACKING, PRESENCE, FALLING
    
    # Suspend duration
    suspendDuration_sec: int = 900
    enableTelemetriesOnEventDuringSuspend: bool = True
    
    # BLE configuration
    bleServerType: str = "OFF"  # OFF, GATT, BEACON
    bleCustomDeviceName: str = "VC000"
    enableBeaconScanner: bool = False
    bleBeaconMacs: List[Any] = Field(default_factory=lambda: [{}])
    bleBeaconRssiThreshold: int = -80
    
    # WiFi health monitoring
    enableWifiHealthMonitor: bool = True
    maxDisconnetionDurationSecWifiHealthMonitor: int = 240
    disconnectionsBurstLimitWifiHealthMonitor: int = 15
    maxDisconnectionsPerHourAverageWifiHealthMonitor: int = 15
    
    # RSSI monitoring
    enableRssiMonitor: bool = True
    rssiThresholdRssiMonitor: int = -70
    samplesNumRssiMonitor: int = 30
    
    # NTP servers
    ntpPrimaryBackupServer: str = "europe.pool.ntp.org"
    ntpSecondaryBackupServer: str = "us.pool.ntp.org"
    
    # Smart reboot
    smartReboot: bool = False
    
    # MQTT reporting
    reportFallsToMqtt: bool = True
    reportPresenceToMqtt: bool = True

    class Config:
        extra = "allow"


# ==================== WALABOT CONFIG ====================

class WalabotConfig(BaseModel):
    """
    Walabot sensor configuration section.
    Controls radar parameters, detection zones, and sensitivity.
    """
    # Arena boundaries (meters)
    xMin: float = -1.8
    xMax: float = 1.8
    yMin: float = 0.3
    yMax: float = 3.5
    zMin: FlexibleValue = 0
    zMax: float = 1.8
    
    # Sensor position
    sensorHeight: float = 1.5
    sensorMounting: str = "Wall"  # Wall, Ceiling, Corner
    
    # Tracker sub-regions (zones)
    trackerSubRegions: List[TrackerSubRegion] = Field(default_factory=list)
    
    # Falling detection
    fallingSensitivity: str = "LowSensitivity"  # LowSensitivity, MediumSensitivity, HighSensitivity
    maxTargetsForFallingTrigger: FlexibleValue = 0
    durationUntilConfirm_sec: FlexibleValue = "52.0"
    minTimeOfTarInFallLoc_sec: FlexibleValue = "30.0"
    fallingMitigatorEnabled: bool = True
    fallingMitigatorThreshold: FlexibleValue = False
    
    # Presence detection
    performHeatup: bool = True
    performAgc: bool = True
    enterDuration: int = 10
    exitDuration: int = 30
    
    # Bed exit detection
    bedExitEnabled: bool = False
    bedExitPredictionThreshold: float = 0.9
    bedExitNFramesToReset: int = 100
    
    # Telemetry settings
    enableFallingTelemetry: bool = True
    enableSensitiveFallingTelemetry: bool = True
    enablePresenceTelemetry: bool = True
    enableTrackerTargetTelemetry: bool = True
    enableBedExitTelemetry: bool = False
    enableBedExitStateTelemetry: bool = False
    enableDoorEventTelemetry: bool = False
    enablePeakTelemetry: bool = True
    enableAboveThPointTelemetry: bool = False
    enableIslandPointTelemetry: bool = False
    enableHeightProfileTelemetry: bool = True
    enableOtfPointTelemetry: bool = True
    enableImageParamsTelemetry: bool = True
    enableInterfererLocHistoryTelemetry: bool = True
    enableMtiParamsTelemetry: bool = True
    enableReferenceTelemetry: bool = True
    enableSuiteTelemetry: bool = False
    enableClustersTelemetry: bool = True
    enableSubRegionStateTelemetry: bool = True
    
    # Dry contact
    dryContactActivationDuration_sec: FlexibleValue = "30.0"

    class Config:
        extra = "allow"


# ==================== RF PROFILE ====================

class RfProfile(BaseModel):
    """RF Profile configuration"""
    rfRegulationZone: str = "WW"  # WW, US, EU, JP
    rfBandWidth: str = "BW500"  # BW500, BW1000, BW1500

    class Config:
        extra = "allow"


# ==================== COMPLETE CONFIG ====================

class VayyarConfig(BaseModel):
    """Complete Vayyar radar configuration payload (downstream config)"""
    appConfig: AppConfig = Field(default_factory=AppConfig)
    walabotConfig: WalabotConfig = Field(default_factory=WalabotConfig)
    rfProfile: RfProfile = Field(default_factory=RfProfile)
    productType: str = "Falling"  # Falling, Presence, Tracking

    class Config:
        extra = "allow"


# ==================== MQTT COMMANDS (Downstream) ====================

class BaseCommand(BaseModel):
    """Base command model"""
    type: int


class UploadAppLogsCommand(BaseCommand):
    """Command to upload application logs"""
    type: int = CommandType.UPLOAD_APP_LOGS.value


class UploadDevLogsCommand(BaseCommand):
    """Command to upload device logs"""
    type: int = CommandType.UPLOAD_DEV_LOGS.value


class RebootDeviceCommand(BaseCommand):
    """Command to reboot the device"""
    type: int = CommandType.REBOOT_DEVICE.value


class CancelAlarmCommand(BaseCommand):
    """Command to cancel an active alarm"""
    type: int = CommandType.CANCEL_ALARM.value


class RebootUploadLogCommand(BaseCommand):
    """Command to reboot and upload logs"""
    type: int = CommandType.REBOOT_UPLOAD_LOG.value


class CancelFallCommand(BaseCommand):
    """Command to cancel a fall detection"""
    type: int = CommandType.CANCEL_FALL.value


class UpdateBaseUrlCommand(BaseCommand):
    """Command to update base URL"""
    type: int = CommandType.UPDATE_BASE_URL.value
    baseUrl: str


class DownloadFirmwareCommand(BaseCommand):
    """Command to download firmware"""
    type: int = CommandType.DOWNLOAD_FIRMWARE.value
    url: Optional[str] = None
    version: Optional[str] = None


class UpdateWifiCredentialsCommand(BaseCommand):
    """Command to update WiFi credentials (deprecated)"""
    type: int = CommandType.UPDATE_WIFI_CREDENTIALS.value
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
    walabotConfig=WalabotConfig(),
    rfProfile=RfProfile(),
    productType="Falling"
)


def get_default_config_dict() -> dict:
    """Get default configuration as dictionary"""
    return DEFAULT_CONFIG.model_dump()


# ==================== ENUM VALUES FOR FRONTEND ====================

ENUM_VALUES = {
    "ledMode": ["AllOff", "AllOn", "StatusOnly"],
    "ledPolicy": ["ErrorsOnly", "AlwaysOn", "Off"],
    "logLevel": ["V_LOG_LEVEL_VERBOSE", "V_LOG_LEVEL_DEBUG", "V_LOG_LEVEL_INFO", "V_LOG_LEVEL_WARNING", "V_LOG_LEVEL_ERROR"],
    "telemetryPolicy": ["Off", "On", "OnDemand"],
    "telemetryTransport": ["MqttQos0", "MqttQos1", "Http"],
    "trackerTargetsDebugPolicy": ["OFF", "ON", "VERBOSE"],
    "algoProfile": ["TRACKING", "PRESENCE", "FALLING"],
    "appLogLevel": ["Disable", "Error", "Warning", "Info", "Debug", "Verbose"],
    "bleServerType": ["OFF", "GATT", "BEACON"],
    "fallingSensitivity": ["LowSensitivity", "MediumSensitivity", "HighSensitivity"],
    "sensorMounting": ["Wall", "Ceiling", "Corner"],
    "rfRegulationZone": ["WW", "US", "EU", "JP"],
    "rfBandWidth": ["BW500", "BW1000", "BW1500"],
    "productType": ["Falling", "Presence", "Tracking"],
    "deviceStatus": ["monitoring", "learning", "test", "silent", "software update"]
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
