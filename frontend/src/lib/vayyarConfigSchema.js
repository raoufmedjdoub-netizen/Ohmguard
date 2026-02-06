import { z } from 'zod';

// Dry Contact Config Schema
const dryContactConfigSchema = z.object({
  mode: z.number().default(0),
  policy: z.number().default(0)
});

// Dry Contacts Schema
const dryContactsSchema = z.object({
  primary: dryContactConfigSchema.default({ mode: 0, policy: 0 }),
  secondary: dryContactConfigSchema.default({ mode: 0, policy: 0 })
});

// Tracker Sub Region Schema
const trackerSubRegionSchema = z.object({
  xMin: z.number().default(0),
  xMax: z.number().default(1),
  yMin: z.number().default(0.3),
  yMax: z.number().default(1),
  zMin: z.number().default(0),
  zMax: z.number().default(1.2),
  mode: z.number().default(0),
  enterDuration: z.number().default(10),
  exitDuration: z.number().default(30),
  isFallingDetection: z.boolean().default(false),
  isPresenceDetection: z.boolean().default(true),
  isLowSnr: z.boolean().default(true),
  isHorizontal: z.boolean().default(true),
  isDoor: z.boolean().default(false),
  name: z.string().default("region")
}).passthrough();

// App Config Schema - NUMERIC ENUMS as per Vayyar API
const appConfigSchema = z.object({
  // Mode settings
  silentMode: z.boolean().default(false),
  demoMode: z.boolean().default(false),
  enableTestMode: z.union([z.boolean(), z.string()]).default(false),
  offlineMode: z.boolean().default(true),
  
  // LED configuration (NUMERIC: 0=AllOff, 1=AllOn, 2=StatusOnly)
  ledMode: z.number().min(0).max(2).default(0),
  
  // Audio
  volume: z.number().min(0).max(100).default(100),
  
  // Logging (NUMERIC: -1=Verbose, 0=Debug, 1=Info, 2=Warning, 3=Error)
  logLevel: z.number().min(-1).max(3).default(-1),
  
  // Alert timing
  confirmedToAlertTimeoutSec: z.number().default(40),
  callingDurationSec: z.number().default(30),
  
  // Presence reporting
  presenceReportMinRateMills: z.number().default(60000),
  
  // Learning mode timestamps
  learningModeEndTs: z.union([z.number(), z.string()]).default(0),
  learningModeStartTs: z.union([z.number(), z.string()]).default(0),
  
  // DSP records
  dspRecordsPublishPolicy: z.boolean().default(false),
  
  // Analytics
  enableAnalytics: z.boolean().default(true),
  
  // Telemetry settings (NUMERIC: 0=Off, 1=On, 2=OnDemand)
  telemetryPolicy: z.number().min(0).max(2).default(0),
  telemetryTransport: z.number().min(0).max(2).default(0),
  telemetryEnabled: z.boolean().default(false),
  
  // Dry contacts
  dryContacts: dryContactsSchema.default({ primary: { mode: 0, policy: 0 }, secondary: { mode: 0, policy: 0 } }),
  dryContactActivationDuration_sec: z.union([z.number(), z.string()]).default(30),
  
  // Tracker debug (NUMERIC: 0=Off, 1=On, 2=Verbose)
  trackerTargetsDebugPolicy: z.number().min(0).max(2).default(0),
  
  // Door events
  enableDoorEvents: z.boolean().default(false),
  
  // Out of bed
  enableOutOfBed: z.boolean().default(false),
  
  // Sensitive mode
  enableSensitiveMode: z.boolean().default(false),
  sensitivityLevel: z.number().min(0).max(1).default(0.78),
  
  // Falling detection thresholds
  thMinEventsForFirstDecision: z.number().default(12),
  thNumOfDetectionsInChain: z.number().default(11),
  
  // Max time in buffer
  max_time_in_buffer: z.number().default(600),
  
  // BLE
  enableBeaconScanner: z.boolean().default(false),
  bleBeaconRssiThreshold: z.number().default(-80),
  
  // RSSI monitoring
  enableRssiMonitor: z.boolean().default(false),
  rssiThresholdRssiMonitor: z.number().default(-70),
  samplesNumRssiMonitor: z.number().default(30),
  
  // WiFi health
  enableWifiHealthMonitor: z.boolean().default(false),
  
  // MQTT reporting
  reportFallsToMqtt: z.boolean().default(true),
  reportPresenceToMqtt: z.boolean().default(true)
}).passthrough();

// Walabot Config Schema - NUMERIC ENUMS as per Vayyar API
const walabotConfigSchema = z.object({
  // Arena boundaries
  xMin: z.number().default(-1.8),
  xMax: z.number().default(1.8),
  yMin: z.number().default(0.3),
  yMax: z.number().default(3.5),
  zMin: z.number().default(0),
  zMax: z.number().default(1.8),
  
  // Sensor position
  sensorHeight: z.number().default(1.5),
  
  // Sensor mounting (NUMERIC: 0=Wall, 1=Ceiling, 2=Corner)
  sensorMounting: z.number().min(0).max(2).default(0),
  
  // Sub-regions
  trackerSubRegions: z.array(trackerSubRegionSchema).default([]),
  
  // Falling sensitivity (NUMERIC: 0=Low, 1=Medium, 2=High)
  fallingSensitivity: z.number().min(0).max(2).default(0),
  maxTargetsForFallingTrigger: z.number().default(0),
  durationUntilConfirm_sec: z.union([z.number(), z.string()]).default(52),
  minTimeOfTarInFallLoc_sec: z.union([z.number(), z.string()]).default(30),
  fallingMitigatorEnabled: z.boolean().default(false),
  
  // Presence detection
  performHeatup: z.boolean().default(true),
  performAgc: z.boolean().default(true),
  enterDuration: z.number().default(10),
  exitDuration: z.number().default(30),
  
  // Bed exit (can be bool or "false" string)
  bedExitEnabled: z.union([z.boolean(), z.string()]).default("false"),
  
  // Dry contact
  dryContactActivationDuration_sec: z.union([z.number(), z.string()]).default(30),
  
  // Telemetry
  enableAboveThPointTelemetry: z.boolean().default(false)
}).passthrough();

// Complete Vayyar Config Schema
export const vayyarConfigSchema = z.object({
  appConfig: appConfigSchema.default({}),
  walabotConfig: walabotConfigSchema.default({})
}).passthrough();

// MQTT Options Schema
export const mqttOptionsSchema = z.object({
  qos: z.number().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  correlationId: z.string().optional(),
  topic: z.string().optional()
});

// ENUM VALUES FOR UI (NUMERIC) - as per Vayyar API
export const ENUM_VALUES = {
  ledMode: [
    { value: 0, label: "Éteint (AllOff)" },
    { value: 1, label: "Allumé (AllOn)" },
    { value: 2, label: "Statut uniquement (StatusOnly)" }
  ],
  ledPolicy: [
    { value: 0, label: "Erreurs uniquement (ErrorsOnly)" },
    { value: 1, label: "Toujours allumé (AlwaysOn)" },
    { value: 2, label: "Éteint (Off)" }
  ],
  logLevel: [
    { value: -1, label: "Verbose" },
    { value: 0, label: "Debug" },
    { value: 1, label: "Info" },
    { value: 2, label: "Warning" },
    { value: 3, label: "Error" }
  ],
  appLogLevel: [
    { value: 0, label: "Désactivé (Disable)" },
    { value: 1, label: "Error" },
    { value: 2, label: "Warning" },
    { value: 3, label: "Info" },
    { value: 4, label: "Debug" },
    { value: 5, label: "Verbose" }
  ],
  telemetryPolicy: [
    { value: 0, label: "Désactivé (Off)" },
    { value: 1, label: "Activé (On)" },
    { value: 2, label: "À la demande (OnDemand)" }
  ],
  telemetryTransport: [
    { value: 0, label: "MQTT QoS 0" },
    { value: 1, label: "MQTT QoS 1" },
    { value: 2, label: "HTTP" }
  ],
  trackerTargetsDebugPolicy: [
    { value: 0, label: "Désactivé (Off)" },
    { value: 1, label: "Activé (On)" },
    { value: 2, label: "Verbose" }
  ],
  fallingSensitivity: [
    { value: 0, label: "Basse (Low)" },
    { value: 1, label: "Moyenne (Medium)" },
    { value: 2, label: "Haute (High)" }
  ],
  sensorMounting: [
    { value: 0, label: "Mur (Wall)" },
    { value: 1, label: "Plafond (Ceiling)" },
    { value: 2, label: "Coin (Corner)" }
  ],
  bleServerType: [
    { value: 0, label: "Désactivé (OFF)" },
    { value: 1, label: "GATT" },
    { value: 2, label: "BEACON" }
  ],
  productType: [
    { value: 0, label: "Falling" },
    { value: 1, label: "Presence" },
    { value: 2, label: "Tracking" }
  ],
  algoProfile: [
    { value: 0, label: "TRACKING" },
    { value: 1, label: "PRESENCE" },
    { value: 2, label: "FALLING" }
  ],
  rfRegulationZone: [
    { value: 0, label: "WW (Worldwide)" },
    { value: 1, label: "US" },
    { value: 2, label: "EU" },
    { value: 3, label: "JP (Japan)" }
  ],
  rfBandWidth: [
    { value: 0, label: "BW500" },
    { value: 1, label: "BW1000" },
    { value: 2, label: "BW1500" }
  ]
};

// Default configuration matching API format
export const DEFAULT_CONFIG = {
  appConfig: {
    silentMode: false,
    demoMode: false,
    enableTestMode: false,
    offlineMode: false,
    ledMode: 1,
    volume: 100,
    logLevel: -1,
    confirmedToAlertTimeoutSec: 30,
    callingDurationSec: 30,
    presenceReportMinRateMills: 60000,
    learningModeEndTs: 0,
    learningModeStartTs: 0,
    dspRecordsPublishPolicy: false,
    enableAnalytics: true,
    telemetryPolicy: 0,
    telemetryTransport: 0,
    telemetryEnabled: false,
    dryContacts: {
      primary: { mode: 1, policy: 1 },
      secondary: { mode: 0, policy: 0 }
    },
    dryContactActivationDuration_sec: 30,
    trackerTargetsDebugPolicy: 0,
    enableDoorEvents: false,
    enableOutOfBed: false,
    enableSensitiveMode: false,
    sensitivityLevel: 0.78,
    thMinEventsForFirstDecision: 5,
    thNumOfDetectionsInChain: 4,
    max_time_in_buffer: 600,
    enableBeaconScanner: false,
    bleBeaconRssiThreshold: -80,
    enableRssiMonitor: false,
    rssiThresholdRssiMonitor: -70,
    samplesNumRssiMonitor: 30,
    enableWifiHealthMonitor: false,
    reportFallsToMqtt: true,
    reportPresenceToMqtt: true
  },
  walabotConfig: {
    xMin: -1.5,
    xMax: 1.5,
    yMin: -1.5,
    yMax: 1.5,
    zMin: 0,
    zMax: 1.8,
    sensorHeight: 2.5,
    sensorMounting: 2,
    trackerSubRegions: [],
    fallingSensitivity: 1,
    maxTargetsForFallingTrigger: 0,
    durationUntilConfirm_sec: 52,
    minTimeOfTarInFallLoc_sec: 30,
    fallingMitigatorEnabled: false,
    performHeatup: true,
    performAgc: true,
    enterDuration: 10,
    exitDuration: 30,
    bedExitEnabled: "false",
    dryContactActivationDuration_sec: 30,
    enableAboveThPointTelemetry: false
  }
};

export default vayyarConfigSchema;
