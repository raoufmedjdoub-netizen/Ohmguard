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
  silentMode: z.boolean().default(false),
  demoMode: z.boolean().default(false),
  enableTestMode: z.union([z.boolean(), z.string()]).default(true),
  offlineMode: z.boolean().default(true),

  // LED
  ledMode: z.number().default(0),
  ledPolicy: z.string().default("ErrorsOnly"),

  // Audio
  volume: z.number().default(0),

  // Alert timing
  confirmedToAlertTimeoutSec: z.number().default(40),
  callingDurationSec: z.number().default(30),

  // Presence
  presenceReportMinRateMills: z.number().default(60000),
  enablePresencePeriodicReport: z.boolean().default(true),

  // Learning mode
  learningModeStartTs: z.number().default(0),
  learningModeEndTs: z.number().default(0),

  // DSP records
  dspRecordsPublishPolicy: z.boolean().default(false),
  dspRecordsPublishMaxLatencySec: z.number().default(10),
  dspRecordsPublishMaxLatency_sec: z.number().default(10),

  // Analytics
  enableAnalytics: z.boolean().default(true),

  // Telemetry
  telemetryPolicy: z.string().default("Off"),
  telemetryTransport: z.string().default("MqttQos0"),

  // Dry contacts
  dryContacts: dryContactsSchema.default({ primary: { mode: 0, policy: 0 }, secondary: { mode: 0, policy: 0 } }),
  dryContactActivationDuration_sec: z.number().default(30),

  // Tracker debug
  trackerTargetsDebugPolicy: z.string().default("OFF"),

  // Features
  enableDoorEvents: z.boolean().default(false),
  enableOutOfBed: z.boolean().default(false),
  enableSensitiveMode: z.boolean().default(false),

  // Sensitivity
  sensitivityLevel: z.number().default(0.7),
  thMinEventsForFirstDecision: z.number().default(5),
  thNumOfDetectionsInChain: z.number().default(4),

  // Suspend
  suspendDuration_sec: z.number().default(900),

  // BLE
  enableBeaconScanner: z.boolean().default(false),
  bleBeaconMacs: z.array(z.string()).default([]),
  bleBeaconRssiThreshold: z.number().default(-80),
  bleCustomDeviceName: z.string().default("VC000"),

  // Telemetries on event during suspend
  enableTelemetriesOnEventDuringSuspend: z.boolean().default(true),

  // RSSI monitoring
  enableRssiMonitor: z.boolean().default(true),
  rssiThresholdRssiMonitor: z.number().default(-70),
  samplesNumRssiMonitor: z.number().default(30),

  // WiFi health
  enableWifiHealthMonitor: z.boolean().default(true),
  maxDisconnetionDurationSecWifiHealthMonitor: z.number().default(240),
  disconnectionsBurstLimitWifiHealthMonitor: z.number().default(15),
  maxDisconnectionsPerHourAverageWifiHealthMonitor: z.number().default(15),

  // Algo & Logging
  algoProfile: z.string().default("TRACKING"),
  appLogAutoLevel: z.string().default("Disable"),
  appLogOnDemandLevel: z.string().default("Disable"),
  legacyLogFileUpload: z.boolean().default(true),
  smartReboot: z.boolean().default(false),

  // NTP
  ntpPrimaryBackupServer: z.string().default("europe.pool.ntp.org"),
  ntpSecondaryBackupServer: z.string().default("us.pool.ntp.org"),

  // Telemetry triggers
  telemAlwaysON: z.boolean().default(false),
  telemAlwaysOn: z.boolean().default(false),
  telemOnBedExit: z.boolean().default(true),
  telemOnFall: z.boolean().default(true),
  telemOnSensitiveFall: z.boolean().default(true),
  telemOnDoorEvents: z.boolean().default(false),
  telemOnDoorEvent: z.boolean().default(false),
  telemOnOutOfBed: z.boolean().default(false),

  // MQTT
  mqttMaxDisconnectionTs: z.number().default(300000),
  mqttAuthTokenExpirySec: z.number().default(0),
  multiPresenceAlpha: z.number().default(0.99885),

  // MQTT reporting
  reportFallsToMqtt: z.boolean().default(true),
  reportPresenceToMqtt: z.boolean().default(true)
}).passthrough();

// ==================== walabotConfig ====================

const walabotConfigSchema = z.object({
  // Arena boundaries
  xMin: z.number().default(-1.8),
  xMax: z.number().default(1.8),
  yMin: z.number().default(0.3),
  yMax: z.number().default(3.5),
  zMin: z.number().default(0),
  zMax: z.number().default(1.8),

  // Sensor
  sensorHeight: z.number().default(1.5),
  sensorMounting: z.number().default(3),

  // Sub-regions
  trackerSubRegions: z.array(trackerSubRegionSchema).default([]),

  // Falling
  fallingSensitivity: z.number().default(1),
  maxTargetsForFallingTrigger: z.number().default(1),
  durationUntilConfirm_sec: z.number().default(52),
  minTimeOfTarInFallLoc_sec: z.number().default(30),
  fallingMitigatorEnabled: z.boolean().default(true),
  fallingMitigatorThreshold: z.number().default(0),

  // Presence
  performHeatup: z.boolean().default(true),
  performAgc: z.boolean().default(true),
  enterDuration: z.number().default(120),
  exitDuration: z.number().default(120),

  // Bed exit
  bedExitEnabled: z.union([z.boolean(), z.string()]).default(true),
  bedExitPredictionThreshold: z.number().default(0.9),
  bedExitNFramesToReset: z.number().default(100),
  bedExitWallSide: z.number().default(0),

  // Telemetry flags
  enableBedExitTelemetry: z.boolean().default(false),
  enableBedExitStateTelemetry: z.boolean().default(false),
  enableTrackerTargetTelemetry: z.boolean().default(true),
  enableDoorEventTelemetry: z.boolean().default(false),
  enablePeakTelemetry: z.boolean().default(true),
  enableAboveThPointTelemetry: z.boolean().default(false),
  enableIslandPointTelemetry: z.boolean().default(false),
  enableHeightProfileTelemetry: z.boolean().default(true),
  enableOtfPointTelemetry: z.boolean().default(true),
  enableFallingTelemetry: z.boolean().default(true),
  enableSensitiveFallingTelemetry: z.boolean().default(true),
  enablePresenceTelemetry: z.boolean().default(true),
  enableImageParamsTelemetry: z.boolean().default(true),
  enableInterfererLocHistoryTelemetry: z.boolean().default(true),
  enableMtiParamsTelemetry: z.boolean().default(true),
  enableReferenceTelemetry: z.boolean().default(true),
  enableSuiteTelemetry: z.boolean().default(false),
  enableClustersTelemetry: z.boolean().default(true),
  enableSubRegionStateTelemetry: z.boolean().default(true),

  // Dry contact
  dryContactActivationDuration_sec: z.number().default(30)
}).passthrough();

// ==================== rfProfile ====================

const rfProfileSchema = z.object({
  rfRegulationZone: z.string().default("WW"),
  rfBandWidth: z.string().default("BW500")
});

// ==================== Complete Config ====================

export const vayyarConfigSchema = z.object({
  appConfig: appConfigSchema.default({}),
  walabotConfig: walabotConfigSchema.default({}),
  rfProfile: rfProfileSchema.default({}),
  productType: z.string().default("Falling")
}).passthrough();

// ==================== MQTT Options ====================

export const mqttOptionsSchema = z.object({
  qos: z.number().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  correlationId: z.string().optional(),
  topic: z.string().optional()
});

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
