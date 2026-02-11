import { z } from 'zod';

// Flexible types - radars send mixed types (string/number/boolean interchangeably)
const flexNum = (def = 0) => z.preprocess(
  (v) => (v === true ? 1 : v === false ? 0 : v === '' ? def : Number(v)),
  z.number().default(def)
);
const flexBool = (def = false) => z.preprocess(
  (v) => (v === 'true' || v === 1 || v === true),
  z.boolean().default(def)
);
const flexStr = (def = '') => z.preprocess(
  (v) => (v == null ? def : String(v)),
  z.string().default(def)
);

// ==================== Sub-schemas ====================

const dryContactConfigSchema = z.object({
  mode: flexNum(0),
  policy: flexNum(0)
}).passthrough();

const dryContactsSchema = z.object({
  primary: dryContactConfigSchema.default({ mode: 0, policy: 0 }),
  secondary: dryContactConfigSchema.default({ mode: 0, policy: 0 })
}).passthrough();

const trackerSubRegionSchema = z.object({
  xMin: flexNum(0),
  xMax: flexNum(0),
  yMin: flexNum(0),
  yMax: flexNum(0),
  zMin: flexNum(0),
  zMax: flexNum(0),
  enterDuration: flexNum(120),
  exitDuration: flexNum(120),
  isFallingDetection: flexBool(false),
  isPresenceDetection: flexBool(false),
  isLowSnr: flexBool(true),
  isHorizontal: flexBool(true),
  isDoor: flexBool(false),
  name: flexStr("string")
}).passthrough();

// ==================== appConfig ====================

const appConfigSchema = z.object({
  // Modes
  silentMode: flexBool(false),
  demoMode: flexBool(false),
  enableTestMode: flexBool(true),
  offlineMode: flexBool(true),

  // LED
  ledMode: flexNum(0),
  ledPolicy: flexStr("ErrorsOnly"),

  // Audio
  volume: flexNum(0),

  // Alert timing
  confirmedToAlertTimeoutSec: flexNum(40),
  callingDurationSec: flexNum(30),

  // Presence
  presenceReportMinRateMills: flexNum(60000),
  enablePresencePeriodicReport: flexBool(true),

  // Learning mode
  learningModeStartTs: flexNum(0),
  learningModeEndTs: flexNum(0),

  // DSP records
  dspRecordsPublishPolicy: flexBool(false),
  dspRecordsPublishMaxLatencySec: flexNum(10),
  dspRecordsPublishMaxLatency_sec: flexNum(10),

  // Analytics
  enableAnalytics: flexBool(true),

  // Telemetry
  telemetryPolicy: flexStr("Off"),
  telemetryTransport: flexStr("MqttQos0"),

  // Dry contacts
  dryContacts: dryContactsSchema.default({ primary: { mode: 0, policy: 0 }, secondary: { mode: 0, policy: 0 } }),
  dryContactActivationDuration_sec: flexNum(30),

  // Tracker debug
  trackerTargetsDebugPolicy: flexStr("OFF"),

  // Features
  enableDoorEvents: flexBool(false),
  enableOutOfBed: flexBool(false),
  enableSensitiveMode: flexBool(false),

  // Sensitivity
  sensitivityLevel: flexNum(0.7),
  thMinEventsForFirstDecision: flexNum(5),
  thNumOfDetectionsInChain: flexNum(4),

  // Suspend
  suspendDuration_sec: flexNum(900),

  // BLE
  enableBeaconScanner: flexBool(false),
  bleBeaconMacs: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []),
    z.array(z.string()).default([])
  ),
  bleBeaconRssiThreshold: flexNum(-80),
  bleCustomDeviceName: flexStr("VC000"),

  // Telemetries on event during suspend
  enableTelemetriesOnEventDuringSuspend: flexBool(true),

  // RSSI monitoring
  enableRssiMonitor: flexBool(true),
  rssiThresholdRssiMonitor: flexNum(-70),
  samplesNumRssiMonitor: flexNum(30),

  // WiFi health
  enableWifiHealthMonitor: flexBool(true),
  maxDisconnetionDurationSecWifiHealthMonitor: flexNum(240),
  disconnectionsBurstLimitWifiHealthMonitor: flexNum(15),
  maxDisconnectionsPerHourAverageWifiHealthMonitor: flexNum(15),

  // Algo & Logging
  algoProfile: flexStr("TRACKING"),
  appLogAutoLevel: flexStr("Disable"),
  appLogOnDemandLevel: flexStr("Disable"),
  legacyLogFileUpload: flexBool(true),
  smartReboot: flexBool(false),

  // NTP
  ntpPrimaryBackupServer: flexStr("europe.pool.ntp.org"),
  ntpSecondaryBackupServer: flexStr("us.pool.ntp.org"),

  // Telemetry triggers
  telemAlwaysON: flexBool(false),
  telemAlwaysOn: flexBool(false),
  telemOnBedExit: flexBool(true),
  telemOnFall: flexBool(true),
  telemOnSensitiveFall: flexBool(true),
  telemOnDoorEvents: flexBool(false),
  telemOnDoorEvent: flexBool(false),
  telemOnOutOfBed: flexBool(false),

  // MQTT
  mqttMaxDisconnectionTs: flexNum(300000),
  mqttAuthTokenExpirySec: flexNum(0),
  multiPresenceAlpha: flexNum(0.99885),

  // MQTT reporting
  reportFallsToMqtt: flexBool(true),
  reportPresenceToMqtt: flexBool(true)
}).passthrough();

// ==================== walabotConfig ====================

const walabotConfigSchema = z.object({
  // Arena boundaries
  xMin: flexNum(-1.8),
  xMax: flexNum(1.8),
  yMin: flexNum(0.3),
  yMax: flexNum(3.5),
  zMin: flexNum(0),
  zMax: flexNum(1.8),

  // Sensor
  sensorHeight: flexNum(1.5),
  sensorMounting: flexNum(3),

  // Sub-regions
  trackerSubRegions: z.array(trackerSubRegionSchema).default([]),

  // Falling
  fallingSensitivity: flexNum(1),
  maxTargetsForFallingTrigger: flexNum(1),
  durationUntilConfirm_sec: flexNum(52),
  minTimeOfTarInFallLoc_sec: flexNum(30),
  fallingMitigatorEnabled: flexBool(true),
  fallingMitigatorThreshold: flexNum(0),

  // Presence
  performHeatup: flexBool(true),
  performAgc: flexBool(true),
  enterDuration: flexNum(120),
  exitDuration: flexNum(120),

  // Bed exit
  bedExitEnabled: flexBool(true),
  bedExitPredictionThreshold: flexNum(0.9),
  bedExitNFramesToReset: flexNum(100),
  bedExitWallSide: flexNum(0),

  // Telemetry flags
  enableBedExitTelemetry: flexBool(false),
  enableBedExitStateTelemetry: flexBool(false),
  enableTrackerTargetTelemetry: flexBool(true),
  enableDoorEventTelemetry: flexBool(false),
  enablePeakTelemetry: flexBool(true),
  enableAboveThPointTelemetry: flexBool(false),
  enableIslandPointTelemetry: flexBool(false),
  enableHeightProfileTelemetry: flexBool(true),
  enableOtfPointTelemetry: flexBool(true),
  enableFallingTelemetry: flexBool(true),
  enableSensitiveFallingTelemetry: flexBool(true),
  enablePresenceTelemetry: flexBool(true),
  enableImageParamsTelemetry: flexBool(true),
  enableInterfererLocHistoryTelemetry: flexBool(true),
  enableMtiParamsTelemetry: flexBool(true),
  enableReferenceTelemetry: flexBool(true),
  enableSuiteTelemetry: flexBool(false),
  enableClustersTelemetry: flexBool(true),
  enableSubRegionStateTelemetry: flexBool(true),

  // Dry contact
  dryContactActivationDuration_sec: flexNum(30)
}).passthrough();

// ==================== rfProfile ====================

const rfProfileSchema = z.object({
  rfRegulationZone: flexStr("WW"),
  rfBandWidth: flexStr("BW500")
}).passthrough();

// ==================== Complete Config ====================

export const vayyarConfigSchema = z.object({
  appConfig: appConfigSchema.default({}),
  walabotConfig: walabotConfigSchema.default({}),
  rfProfile: rfProfileSchema.default({}),
  productType: flexStr("Falling")
}).passthrough();

// ==================== MQTT Options ====================

export const mqttOptionsSchema = z.object({
  qos: flexNum(1),
  retain: flexBool(false),
  correlationId: flexStr("").optional(),
  topic: flexStr("").optional()
}).passthrough();

// ==================== ENUM VALUES ====================

export const ENUM_VALUES = {
  ledMode: [
    { value: 0, label: "Eteint (AllOff)" },
    { value: 1, label: "Allume (AllOn)" },
    { value: 2, label: "Statut uniquement (StatusOnly)" }
  ],
  ledPolicy: ["ErrorsOnly", "AlwaysOn", "Off"],
  telemetryPolicy: ["Off", "On", "OnDemand"],
  telemetryTransport: ["MqttQos0", "MqttQos1", "Http"],
  trackerTargetsDebugPolicy: ["OFF", "ON", "VERBOSE"],
  algoProfile: ["TRACKING", "PRESENCE", "FALLING"],
  appLogLevel: ["Disable", "Error", "Warning", "Info", "Debug", "Verbose"],
  fallingSensitivity: [
    { value: 0, label: "Basse (Low)" },
    { value: 1, label: "Moyenne (Medium)" },
    { value: 2, label: "Haute (High)" }
  ],
  sensorMounting: [
    { value: 0, label: "Mur (Wall)" },
    { value: 1, label: "Plafond (Ceiling)" },
    { value: 2, label: "Coin (Corner)" },
    { value: 3, label: "Mur haut (High Wall)" }
  ],
  rfRegulationZone: ["WW", "US", "EU", "JP"],
  rfBandWidth: ["BW500", "BW1000", "BW1500"],
  productType: ["Falling", "Presence", "Tracking"],
  bedExitWallSide: [
    { value: 0, label: "Gauche" },
    { value: 1, label: "Droite" }
  ]
};

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_CONFIG = {
  appConfig: {
    silentMode: false,
    ledMode: 0,
    ledPolicy: "ErrorsOnly",
    volume: 0,
    confirmedToAlertTimeoutSec: 40,
    callingDurationSec: 30,
    presenceReportMinRateMills: 60000,
    enablePresencePeriodicReport: true,
    learningModeStartTs: 0,
    learningModeEndTs: 0,
    dspRecordsPublishPolicy: false,
    dspRecordsPublishMaxLatencySec: 10,
    dspRecordsPublishMaxLatency_sec: 10,
    enableAnalytics: true,
    enableTestMode: true,
    telemetryPolicy: "Off",
    telemetryTransport: "MqttQos0",
    dryContacts: {
      primary: { mode: 0, policy: 0 },
      secondary: { mode: 0, policy: 0 }
    },
    trackerTargetsDebugPolicy: "OFF",
    demoMode: false,
    enableDoorEvents: false,
    enableOutOfBed: false,
    enableSensitiveMode: false,
    sensitivityLevel: 0.7,
    thMinEventsForFirstDecision: 5,
    thNumOfDetectionsInChain: 4,
    suspendDuration_sec: 900,
    offlineMode: true,
    enableBeaconScanner: false,
    bleBeaconMacs: [],
    bleBeaconRssiThreshold: -80,
    enableTelemetriesOnEventDuringSuspend: true,
    enableRssiMonitor: true,
    rssiThresholdRssiMonitor: -70,
    samplesNumRssiMonitor: 30,
    enableWifiHealthMonitor: true,
    maxDisconnetionDurationSecWifiHealthMonitor: 240,
    disconnectionsBurstLimitWifiHealthMonitor: 15,
    maxDisconnectionsPerHourAverageWifiHealthMonitor: 15,
    algoProfile: "TRACKING",
    appLogAutoLevel: "Disable",
    appLogOnDemandLevel: "Disable",
    legacyLogFileUpload: true,
    smartReboot: false,
    bleCustomDeviceName: "VC000",
    ntpPrimaryBackupServer: "europe.pool.ntp.org",
    ntpSecondaryBackupServer: "us.pool.ntp.org",
    dryContactActivationDuration_sec: 30,
    telemAlwaysON: false,
    telemAlwaysOn: false,
    telemOnBedExit: true,
    telemOnFall: true,
    telemOnSensitiveFall: true,
    telemOnDoorEvents: false,
    telemOnDoorEvent: false,
    telemOnOutOfBed: false,
    mqttMaxDisconnectionTs: 300000,
    mqttAuthTokenExpirySec: 0,
    multiPresenceAlpha: 0.99885,
    reportFallsToMqtt: true,
    reportPresenceToMqtt: true
  },
  walabotConfig: {
    xMin: -1.8,
    xMax: 1.8,
    yMin: 0.3,
    yMax: 3.5,
    zMin: 0,
    zMax: 1.8,
    sensorHeight: 1.5,
    trackerSubRegions: [{
      xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0,
      enterDuration: 120, exitDuration: 120,
      isFallingDetection: false, isPresenceDetection: false,
      isLowSnr: true, isHorizontal: true, isDoor: false, name: "string"
    }],
    fallingSensitivity: 1,
    sensorMounting: 3,
    maxTargetsForFallingTrigger: 1,
    performHeatup: true,
    performAgc: true,
    enterDuration: 120,
    exitDuration: 120,
    bedExitEnabled: true,
    bedExitPredictionThreshold: 0.9,
    bedExitNFramesToReset: 100,
    bedExitWallSide: 0,
    enableBedExitTelemetry: false,
    enableBedExitStateTelemetry: false,
    enableTrackerTargetTelemetry: true,
    enableDoorEventTelemetry: false,
    enablePeakTelemetry: true,
    enableAboveThPointTelemetry: false,
    enableIslandPointTelemetry: false,
    enableHeightProfileTelemetry: true,
    enableOtfPointTelemetry: true,
    enableFallingTelemetry: true,
    enableSensitiveFallingTelemetry: true,
    enablePresenceTelemetry: true,
    enableImageParamsTelemetry: true,
    enableInterfererLocHistoryTelemetry: true,
    enableMtiParamsTelemetry: true,
    enableReferenceTelemetry: true,
    enableSuiteTelemetry: false,
    enableClustersTelemetry: true,
    enableSubRegionStateTelemetry: true,
    durationUntilConfirm_sec: 52,
    minTimeOfTarInFallLoc_sec: 30,
    fallingMitigatorEnabled: true,
    fallingMitigatorThreshold: 0,
    dryContactActivationDuration_sec: 30
  },
  rfProfile: {
    rfRegulationZone: "WW",
    rfBandWidth: "BW500"
  },
  productType: "Falling"
};

export default vayyarConfigSchema;
