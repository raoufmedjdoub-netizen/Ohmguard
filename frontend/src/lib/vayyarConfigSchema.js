import { z } from 'zod';

// Flexible value type (bool OR number OR string)
const flexibleValue = z.union([z.boolean(), z.number(), z.string(), z.null()]);

// Dry Contact Config
const dryContactConfigSchema = z.object({
  mode: z.number().default(0),
  policy: z.number().default(0)
});

// Dry Contacts
const dryContactsSchema = z.object({
  primary: dryContactConfigSchema.default({}),
  secondary: dryContactConfigSchema.default({})
});

// Tracker Sub Region
export const trackerSubRegionSchema = z.object({
  xMin: z.number().default(0),
  xMax: z.number().default(0),
  yMin: z.number().default(0),
  yMax: z.number().default(0),
  zMin: z.number().default(0),
  zMax: z.number().default(0),
  enterDuration: z.number().default(120),
  exitDuration: z.number().default(120),
  isFallingDetection: z.boolean().default(false),
  isPresenceDetection: z.boolean().default(false),
  isLowSnr: z.boolean().default(true),
  isHorizontal: z.boolean().default(true),
  isDoor: z.boolean().default(false),
  name: z.string().default("region")
});

// App Config Schema
export const appConfigSchema = z.object({
  silentMode: z.boolean().default(false),
  ledMode: z.string().default("AllOff"),
  ledPolicy: z.string().default("ErrorsOnly"),
  volume: flexibleValue.default(false),
  logLevel: z.string().default("V_LOG_LEVEL_VERBOSE"),
  confirmedToAlertTimeoutSec: z.number().default(40),
  callingDurationSec: z.number().default(30),
  presenceReportMinRateMills: z.number().default(60000),
  enablePresencePeriodicReport: z.boolean().default(true),
  learningModeEndTs: flexibleValue.default(false),
  learningModeStartTs: flexibleValue.default(false),
  dspRecordsPublishPolicy: flexibleValue.default(false),
  dspRecordsPublishMaxLatency_sec: z.number().default(10),
  enableAnalytics: z.boolean().default(true),
  enableTestMode: z.boolean().default(true),
  telemetryPolicy: z.string().default("Off"),
  telemetryTransport: z.string().default("MqttQos0"),
  dryContacts: dryContactsSchema.default({}),
  trackerTargetsDebugPolicy: z.string().default("OFF"),
  demoMode: z.boolean().default(false),
  enableDoorEvents: z.boolean().default(false),
  enableOutOfBed: z.boolean().default(false),
  enableSensitiveMode: z.boolean().default(false),
  sensitivityLevel: z.number().min(0).max(1).default(0.7),
  enableBeaconScanner: z.boolean().default(false),
  bleBeaconMacs: z.array(z.any()).default([{}]),
  thMinEventsForFirstDecision: z.number().default(5),
  thNumOfDetectionsInChain: z.number().default(4),
  suspendDuration_sec: z.number().default(900),
  offlineMode: z.boolean().default(true),
  bleBeaconRssiThreshold: z.number().default(-80),
  enableTelemetriesOnEventDuringSuspend: z.boolean().default(true),
  enableRssiMonitor: z.boolean().default(true),
  rssiThresholdRssiMonitor: z.number().default(-70),
  samplesNumRssiMonitor: z.number().default(30),
  enableWifiHealthMonitor: z.boolean().default(true),
  maxDisconnetionDurationSecWifiHealthMonitor: z.number().default(240),
  disconnectionsBurstLimitWifiHealthMonitor: z.number().default(15),
  maxDisconnectionsPerHourAverageWifiHealthMonitor: z.number().default(15),
  algoProfile: z.string().default("TRACKING"),
  appLogAutoLevel: z.string().default("Disable"),
  appLogOnDemandLevel: z.string().default("Disable"),
  legacyLogFileUpload: z.boolean().default(true),
  smartReboot: z.boolean().default(false),
  bleServerType: z.string().default("OFF"),
  bleCustomDeviceName: z.string().default("VC000"),
  ntpPrimaryBackupServer: z.string().default("europe.pool.ntp.org"),
  ntpSecondaryBackupServer: z.string().default("us.pool.ntp.org"),
  dryContactActivationDuration_sec: flexibleValue.default("30.0"),
  telemAlwaysON: z.boolean().default(false),
  telemOnBedExit: z.boolean().default(true),
  telemOnFall: z.boolean().default(true),
  telemOnSensitiveFall: z.boolean().default(true),
  telemOnDoorEvents: z.boolean().default(false),
  telemOnOutOfBed: z.boolean().default(false)
});

// Walabot Config Schema
export const walabotConfigSchema = z.object({
  xMin: z.number().default(-1.8),
  xMax: z.number().default(1.8),
  yMin: z.number().default(0.3),
  yMax: z.number().default(3.5),
  zMin: flexibleValue.default(false),
  zMax: z.number().default(1.8),
  sensorHeight: z.number().default(1.5),
  trackerSubRegions: z.array(trackerSubRegionSchema).default([]),
  fallingSensitivity: z.string().default("LowSensitivity"),
  sensorMounting: z.string().default("Wall"),
  maxTargetsForFallingTrigger: flexibleValue.default(true),
  performHeatup: z.boolean().default(true),
  performAgc: z.boolean().default(true),
  enterDuration: z.number().default(120),
  exitDuration: z.number().default(120),
  bedExitEnabled: z.boolean().default(true),
  bedExitPredictionThreshold: z.number().default(0.9),
  bedExitNFramesToReset: z.number().default(100),
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
  durationUntilConfirm_sec: flexibleValue.default("52.0"),
  minTimeOfTarInFallLoc_sec: flexibleValue.default("30.0"),
  fallingMitigatorEnabled: z.boolean().default(true),
  fallingMitigatorThreshold: flexibleValue.default(false),
  dryContactActivationDuration_sec: flexibleValue.default("30.0")
});

// RF Profile Schema
export const rfProfileSchema = z.object({
  rfRegulationZone: z.string().default("WW"),
  rfBandWidth: z.string().default("BW500")
});

// Complete Vayyar Config Schema
export const vayyarConfigSchema = z.object({
  appConfig: appConfigSchema.default({}),
  walabotConfig: walabotConfigSchema.default({}),
  rfProfile: rfProfileSchema.default({}),
  productType: z.string().default("Falling")
});

// MQTT Options Schema
export const mqttOptionsSchema = z.object({
  qos: z.number().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  correlationId: z.string().optional(),
  topic: z.string().optional()
});

// Enum values for select inputs
export const ENUM_VALUES = {
  ledMode: ["AllOff", "AllOn", "StatusOnly"],
  ledPolicy: ["ErrorsOnly", "AlwaysOn", "Off"],
  logLevel: ["V_LOG_LEVEL_VERBOSE", "V_LOG_LEVEL_DEBUG", "V_LOG_LEVEL_INFO", "V_LOG_LEVEL_WARNING", "V_LOG_LEVEL_ERROR"],
  telemetryPolicy: ["Off", "On", "OnDemand"],
  telemetryTransport: ["MqttQos0", "MqttQos1", "Http"],
  trackerTargetsDebugPolicy: ["OFF", "ON", "VERBOSE"],
  algoProfile: ["TRACKING", "PRESENCE", "FALLING"],
  appLogLevel: ["Disable", "Error", "Warning", "Info", "Debug", "Verbose"],
  bleServerType: ["OFF", "GATT", "BEACON"],
  fallingSensitivity: ["LowSensitivity", "MediumSensitivity", "HighSensitivity"],
  sensorMounting: ["Wall", "Ceiling", "Corner"],
  rfRegulationZone: ["WW", "US", "EU", "JP"],
  rfBandWidth: ["BW500", "BW1000", "BW1500"],
  productType: ["Falling", "Presence", "Tracking"]
};

// Default configuration
export const DEFAULT_CONFIG = {
  appConfig: appConfigSchema.parse({}),
  walabotConfig: walabotConfigSchema.parse({}),
  rfProfile: rfProfileSchema.parse({}),
  productType: "Falling"
};

export default vayyarConfigSchema;
