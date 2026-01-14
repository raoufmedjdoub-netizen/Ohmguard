"""
Vayyar Radar Configuration Schema and Validation
Based on the official Vayyar/Walabot configuration payload structure
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Union, Literal, Any
from enum import Enum
from datetime import datetime
import uuid


# Enums based on the payload
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


# Flexible type to handle bool OR number OR string (as seen in the payload)
FlexibleValue = Union[bool, int, float, str, None]


class DryContactConfig(BaseModel):
    mode: int = 0
    policy: int = 0


class DryContacts(BaseModel):
    primary: DryContactConfig = Field(default_factory=DryContactConfig)
    secondary: DryContactConfig = Field(default_factory=DryContactConfig)


class TrackerSubRegion(BaseModel):
    xMin: float = 0
    xMax: float = 0
    yMin: float = 0
    yMax: float = 0
    zMin: float = 0
    zMax: float = 0
    enterDuration: int = 120
    exitDuration: int = 120
    isFallingDetection: bool = False
    isPresenceDetection: bool = False
    isLowSnr: bool = True
    isHorizontal: bool = True
    isDoor: bool = False
    name: str = "region"


class AppConfig(BaseModel):
    """Application configuration section"""
    silentMode: bool = False
    ledMode: str = "AllOff"
    ledPolicy: str = "ErrorsOnly"
    volume: FlexibleValue = False
    logLevel: str = "V_LOG_LEVEL_VERBOSE"
    confirmedToAlertTimeoutSec: int = 40
    callingDurationSec: int = 30
    presenceReportMinRateMills: int = 60000
    enablePresencePeriodicReport: bool = True
    learningModeEndTs: FlexibleValue = False
    learningModeStartTs: FlexibleValue = False
    dspRecordsPublishPolicy: FlexibleValue = False
    dspRecordsPublishMaxLatency_sec: int = 10
    enableAnalytics: bool = True
    enableTestMode: bool = True
    telemetryPolicy: str = "Off"
    telemetryTransport: str = "MqttQos0"
    dryContacts: DryContacts = Field(default_factory=DryContacts)
    trackerTargetsDebugPolicy: str = "OFF"
    demoMode: bool = False
    enableDoorEvents: bool = False
    enableOutOfBed: bool = False
    enableSensitiveMode: bool = False
    sensitivityLevel: float = 0.7
    enableBeaconScanner: bool = False
    bleBeaconMacs: List[Any] = Field(default_factory=lambda: [{}])
    thMinEventsForFirstDecision: int = 5
    thNumOfDetectionsInChain: int = 4
    suspendDuration_sec: int = 900
    offlineMode: bool = True
    bleBeaconRssiThreshold: int = -80
    enableTelemetriesOnEventDuringSuspend: bool = True
    enableRssiMonitor: bool = True
    rssiThresholdRssiMonitor: int = -70
    samplesNumRssiMonitor: int = 30
    enableWifiHealthMonitor: bool = True
    maxDisconnetionDurationSecWifiHealthMonitor: int = 240
    disconnectionsBurstLimitWifiHealthMonitor: int = 15
    maxDisconnectionsPerHourAverageWifiHealthMonitor: int = 15
    algoProfile: str = "TRACKING"
    appLogAutoLevel: str = "Disable"
    appLogOnDemandLevel: str = "Disable"
    legacyLogFileUpload: bool = True
    smartReboot: bool = False
    bleServerType: str = "OFF"
    bleCustomDeviceName: str = "VC000"
    ntpPrimaryBackupServer: str = "europe.pool.ntp.org"
    ntpSecondaryBackupServer: str = "us.pool.ntp.org"
    dryContactActivationDuration_sec: FlexibleValue = "30.0"
    telemAlwaysON: bool = False
    telemOnBedExit: bool = True
    telemOnFall: bool = True
    telemOnSensitiveFall: bool = True
    telemOnDoorEvents: bool = False
    telemOnOutOfBed: bool = False

    class Config:
        extra = "allow"


class WalabotConfig(BaseModel):
    """Walabot sensor configuration section"""
    xMin: float = -1.8
    xMax: float = 1.8
    yMin: float = 0.3
    yMax: float = 3.5
    zMin: FlexibleValue = False
    zMax: float = 1.8
    sensorHeight: float = 1.5
    trackerSubRegions: List[TrackerSubRegion] = Field(default_factory=list)
    fallingSensitivity: str = "LowSensitivity"
    sensorMounting: str = "Wall"
    maxTargetsForFallingTrigger: FlexibleValue = True
    performHeatup: bool = True
    performAgc: bool = True
    enterDuration: int = 120
    exitDuration: int = 120
    bedExitEnabled: bool = True
    bedExitPredictionThreshold: float = 0.9
    bedExitNFramesToReset: int = 100
    enableBedExitTelemetry: bool = False
    enableBedExitStateTelemetry: bool = False
    enableTrackerTargetTelemetry: bool = True
    enableDoorEventTelemetry: bool = False
    enablePeakTelemetry: bool = True
    enableAboveThPointTelemetry: bool = False
    enableIslandPointTelemetry: bool = False
    enableHeightProfileTelemetry: bool = True
    enableOtfPointTelemetry: bool = True
    enableFallingTelemetry: bool = True
    enableSensitiveFallingTelemetry: bool = True
    enablePresenceTelemetry: bool = True
    enableImageParamsTelemetry: bool = True
    enableInterfererLocHistoryTelemetry: bool = True
    enableMtiParamsTelemetry: bool = True
    enableReferenceTelemetry: bool = True
    enableSuiteTelemetry: bool = False
    enableClustersTelemetry: bool = True
    enableSubRegionStateTelemetry: bool = True
    durationUntilConfirm_sec: FlexibleValue = "52.0"
    minTimeOfTarInFallLoc_sec: FlexibleValue = "30.0"
    fallingMitigatorEnabled: bool = True
    fallingMitigatorThreshold: FlexibleValue = False
    dryContactActivationDuration_sec: FlexibleValue = "30.0"

    class Config:
        extra = "allow"


class RfProfile(BaseModel):
    """RF Profile configuration"""
    rfRegulationZone: str = "WW"
    rfBandWidth: str = "BW500"

    class Config:
        extra = "allow"


class VayyarConfig(BaseModel):
    """Complete Vayyar radar configuration payload"""
    appConfig: AppConfig = Field(default_factory=AppConfig)
    walabotConfig: WalabotConfig = Field(default_factory=WalabotConfig)
    rfProfile: RfProfile = Field(default_factory=RfProfile)
    productType: str = "Falling"

    class Config:
        extra = "allow"


class MqttPublishOptions(BaseModel):
    """MQTT publish options"""
    qos: int = Field(default=1, ge=0, le=2)
    retain: bool = False
    correlationId: Optional[str] = None
    topic: Optional[str] = None  # Override default topic


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


class ConfigTemplate(BaseModel):
    """Configuration template for reuse"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    config: VayyarConfig
    createdAt: str = Field(default_factory=lambda: datetime.now().isoformat())


# Default configuration template
DEFAULT_CONFIG = VayyarConfig(
    appConfig=AppConfig(),
    walabotConfig=WalabotConfig(),
    rfProfile=RfProfile(),
    productType="Falling"
)


def get_default_config_dict() -> dict:
    """Get default configuration as dictionary"""
    return DEFAULT_CONFIG.model_dump()
