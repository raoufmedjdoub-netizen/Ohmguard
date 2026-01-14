import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Editor from '@monaco-editor/react';
import {
  Settings, Send, RotateCcw, History, Save, AlertTriangle,
  Check, X, Clock, ChevronLeft, Copy, Plus, Trash2, RefreshCw
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

import api from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { vayyarConfigSchema, ENUM_VALUES, DEFAULT_CONFIG, mqttOptionsSchema } from '@/lib/vayyarConfigSchema';

// Field component with tooltip
const ConfigField = ({ label, description, children, flexible }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {flexible && (
        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
          Flexible
        </Badge>
      )}
    </div>
    {description && <p className="text-xs text-muted-foreground">{description}</p>}
    {children}
  </div>
);

// Switch field
const SwitchField = ({ control, name, label, description }) => (
  <ConfigField label={label} description={description}>
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Switch checked={field.value} onCheckedChange={field.onChange} />
      )}
    />
  </ConfigField>
);

// Number field
const NumberField = ({ control, name, label, description, min, max, step = 1, flexible }) => (
  <ConfigField label={label} description={description} flexible={flexible}>
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={field.value ?? ''}
          onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="max-w-[200px]"
        />
      )}
    />
  </ConfigField>
);

// Select field
const SelectField = ({ control, name, label, description, options }) => (
  <ConfigField label={label} description={description}>
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger className="max-w-[250px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  </ConfigField>
);

// Slider field
const SliderField = ({ control, name, label, description, min = 0, max = 1, step = 0.1 }) => (
  <ConfigField label={label} description={description}>
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <div className="flex items-center gap-4 max-w-[300px]">
          <Slider
            value={[field.value || 0]}
            onValueChange={([v]) => field.onChange(v)}
            min={min}
            max={max}
            step={step}
            className="flex-1"
          />
          <span className="text-sm font-mono w-12">{(field.value || 0).toFixed(2)}</span>
        </div>
      )}
    />
  </ConfigField>
);

export function RadarConfigPage() {
  const { t } = useTranslation();
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [radar, setRadar] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeTab, setActiveTab] = useState('app');
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mqttOptions, setMqttOptions] = useState({ qos: 1, retain: false });

  const form = useForm({
    resolver: zodResolver(vayyarConfigSchema),
    defaultValues: DEFAULT_CONFIG
  });

  const { control, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = form;
  const watchedConfig = watch();

  // Fetch radar and config
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [radarRes, configRes, versionsRes] = await Promise.all([
        api.get(`/sensors`).then(r => r.data.find(s => s.id === deviceId)),
        api.get(`/devices/${deviceId}/config/latest`),
        api.get(`/devices/${deviceId}/config/versions?limit=10`)
      ]);
      
      setRadar(radarRes);
      setVersions(versionsRes.data || []);
      
      if (configRes.data && !configRes.data.isDefault) {
        reset(configRes.data.config);
        setJsonValue(JSON.stringify(configRes.data.config, null, 2));
      } else {
        reset(DEFAULT_CONFIG);
        setJsonValue(JSON.stringify(DEFAULT_CONFIG, null, 2));
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error(t('config.fetchError', 'Failed to load configuration'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, reset, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync JSON editor with form
  useEffect(() => {
    if (!jsonMode) {
      setJsonValue(JSON.stringify(watchedConfig, null, 2));
    }
  }, [watchedConfig, jsonMode]);

  // Handle JSON changes
  const handleJsonChange = (value) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      const validated = vayyarConfigSchema.parse(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  // Apply JSON to form
  const applyJsonToForm = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      const validated = vayyarConfigSchema.parse(parsed);
      reset(validated);
      setJsonError(null);
      toast.success(t('config.jsonApplied', 'JSON applied to form'));
    } catch (e) {
      setJsonError(e.message);
      toast.error(t('config.jsonInvalid', 'Invalid JSON'));
    }
  };

  // Send configuration
  const onSubmit = async (data) => {
    setSending(true);
    try {
      const response = await api.post(`/devices/${deviceId}/config/send`, {
        config: data,
        mqttOptions
      });
      
      toast.success(t('config.sent', 'Configuration sent (v{{version}})', { version: response.data.versionNumber }));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.sendError', 'Failed to send configuration'));
    } finally {
      setSending(false);
    }
  };

  // Rollback to version
  const handleRollback = async (versionNumber) => {
    try {
      await api.post(`/devices/${deviceId}/config/rollback/${versionNumber}`);
      toast.success(t('config.rolledBack', 'Rolled back to version {{version}}', { version: versionNumber }));
      setHistoryOpen(false);
      fetchData();
    } catch (error) {
      toast.error(t('config.rollbackError', 'Failed to rollback'));
    }
  };

  // Retry failed version
  const handleRetry = async (versionId) => {
    try {
      await api.post(`/devices/${deviceId}/config/retry/${versionId}`);
      toast.success(t('config.retried', 'Configuration resent'));
      fetchData();
    } catch (error) {
      toast.error(t('config.retryError', 'Failed to retry'));
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      SENT: 'bg-blue-500/20 text-blue-600',
      ACKED: 'bg-green-500/20 text-green-600',
      FAILED: 'bg-red-500/20 text-red-600',
      TIMEOUT: 'bg-yellow-500/20 text-yellow-600',
      DRAFT: 'bg-gray-500/20 text-gray-600'
    };
    return <Badge className={styles[status] || styles.DRAFT}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="radar-config-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/radars')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('config.title', 'Radar Configuration')}</h1>
            <p className="text-muted-foreground">{radar?.name || deviceId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            {t('config.history', 'History')}
          </Button>
          <Button 
            onClick={handleSubmit(onSubmit)} 
            disabled={sending || (!isDirty && !jsonMode)}
          >
            {sending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {t('config.send', 'Send Config')}
          </Button>
        </div>
      </div>

      {/* MQTT Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">MQTT Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 items-center">
            <div className="flex items-center gap-2">
              <Label>QoS:</Label>
              <Select value={String(mqttOptions.qos)} onValueChange={v => setMqttOptions(o => ({...o, qos: Number(v)}))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Retain:</Label>
              <Switch checked={mqttOptions.retain} onCheckedChange={v => setMqttOptions(o => ({...o, retain: v}))} />
            </div>
            <div className="text-sm text-muted-foreground">
              Topic: <code className="bg-muted px-2 py-1 rounded">devices/{deviceId}/config</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('config.basicConfig', 'Basic Configuration')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setJsonMode(!jsonMode)}>
                {jsonMode ? t('config.formMode', 'Form Mode') : t('config.jsonMode', 'JSON Mode')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-5 mb-4">
                <TabsTrigger value="app">App</TabsTrigger>
                <TabsTrigger value="walabot">Walabot</TabsTrigger>
                <TabsTrigger value="rf">RF</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
                <TabsTrigger value="regions">Regions</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[500px] pr-4">
                {/* App Config Tab */}
                <TabsContent value="app" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <SwitchField control={control} name="appConfig.silentMode" label="Silent Mode" />
                    <SwitchField control={control} name="appConfig.demoMode" label="Demo Mode" />
                    <SwitchField control={control} name="appConfig.enableTestMode" label="Test Mode" />
                    <SwitchField control={control} name="appConfig.enableAnalytics" label="Analytics" />
                    <SwitchField control={control} name="appConfig.offlineMode" label="Offline Mode" />
                    <SwitchField control={control} name="appConfig.smartReboot" label="Smart Reboot" />
                  </div>
                  
                  <SelectField control={control} name="appConfig.ledMode" label="LED Mode" options={ENUM_VALUES.ledMode} />
                  <SelectField control={control} name="appConfig.ledPolicy" label="LED Policy" options={ENUM_VALUES.ledPolicy} />
                  <SelectField control={control} name="appConfig.logLevel" label="Log Level" options={ENUM_VALUES.logLevel} />
                  <SelectField control={control} name="appConfig.algoProfile" label="Algorithm Profile" options={ENUM_VALUES.algoProfile} />
                  <SelectField control={control} name="appConfig.telemetryPolicy" label="Telemetry Policy" options={ENUM_VALUES.telemetryPolicy} />
                  <SelectField control={control} name="appConfig.telemetryTransport" label="Telemetry Transport" options={ENUM_VALUES.telemetryTransport} />
                  
                  <SliderField control={control} name="appConfig.sensitivityLevel" label="Sensitivity Level" min={0} max={1} step={0.05} />
                  
                  <NumberField control={control} name="appConfig.confirmedToAlertTimeoutSec" label="Alert Timeout (sec)" min={0} max={300} />
                  <NumberField control={control} name="appConfig.callingDurationSec" label="Calling Duration (sec)" min={0} max={300} />
                  <NumberField control={control} name="appConfig.suspendDuration_sec" label="Suspend Duration (sec)" min={0} max={3600} />
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Telemetry Events</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <SwitchField control={control} name="appConfig.telemOnFall" label="On Fall" />
                      <SwitchField control={control} name="appConfig.telemOnSensitiveFall" label="On Sensitive Fall" />
                      <SwitchField control={control} name="appConfig.telemOnBedExit" label="On Bed Exit" />
                      <SwitchField control={control} name="appConfig.telemOnDoorEvents" label="On Door Events" />
                      <SwitchField control={control} name="appConfig.telemAlwaysON" label="Always On" />
                    </div>
                  </div>
                </TabsContent>

                {/* Walabot Config Tab */}
                <TabsContent value="walabot" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <NumberField control={control} name="walabotConfig.xMin" label="X Min (m)" step={0.1} flexible />
                    <NumberField control={control} name="walabotConfig.xMax" label="X Max (m)" step={0.1} />
                    <NumberField control={control} name="walabotConfig.yMin" label="Y Min (m)" step={0.1} />
                    <NumberField control={control} name="walabotConfig.yMax" label="Y Max (m)" step={0.1} />
                    <NumberField control={control} name="walabotConfig.zMax" label="Z Max (m)" step={0.1} />
                    <NumberField control={control} name="walabotConfig.sensorHeight" label="Sensor Height (m)" step={0.1} />
                  </div>
                  
                  <SelectField control={control} name="walabotConfig.fallingSensitivity" label="Falling Sensitivity" options={ENUM_VALUES.fallingSensitivity} />
                  <SelectField control={control} name="walabotConfig.sensorMounting" label="Sensor Mounting" options={ENUM_VALUES.sensorMounting} />
                  
                  <NumberField control={control} name="walabotConfig.enterDuration" label="Enter Duration (sec)" min={0} />
                  <NumberField control={control} name="walabotConfig.exitDuration" label="Exit Duration (sec)" min={0} />
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Bed Exit Detection</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <SwitchField control={control} name="walabotConfig.bedExitEnabled" label="Enabled" />
                      <NumberField control={control} name="walabotConfig.bedExitPredictionThreshold" label="Threshold" min={0} max={1} step={0.05} />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Telemetry</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <SwitchField control={control} name="walabotConfig.enableFallingTelemetry" label="Falling" />
                      <SwitchField control={control} name="walabotConfig.enablePresenceTelemetry" label="Presence" />
                      <SwitchField control={control} name="walabotConfig.enableTrackerTargetTelemetry" label="Tracker Target" />
                      <SwitchField control={control} name="walabotConfig.enablePeakTelemetry" label="Peak" />
                    </div>
                  </div>
                </TabsContent>

                {/* RF Config Tab */}
                <TabsContent value="rf" className="space-y-4 mt-0">
                  <SelectField control={control} name="rfProfile.rfRegulationZone" label="Regulation Zone" options={ENUM_VALUES.rfRegulationZone} />
                  <SelectField control={control} name="rfProfile.rfBandWidth" label="Bandwidth" options={ENUM_VALUES.rfBandWidth} />
                </TabsContent>

                {/* System Tab */}
                <TabsContent value="system" className="space-y-4 mt-0">
                  <SelectField control={control} name="productType" label="Product Type" options={ENUM_VALUES.productType} />
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">NTP Servers</h4>
                    <Controller
                      name="appConfig.ntpPrimaryBackupServer"
                      control={control}
                      render={({ field }) => (
                        <ConfigField label="Primary NTP Server">
                          <Input {...field} className="max-w-[300px]" />
                        </ConfigField>
                      )}
                    />
                    <Controller
                      name="appConfig.ntpSecondaryBackupServer"
                      control={control}
                      render={({ field }) => (
                        <ConfigField label="Secondary NTP Server">
                          <Input {...field} className="max-w-[300px]" />
                        </ConfigField>
                      )}
                    />
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">BLE Configuration</h4>
                    <SelectField control={control} name="appConfig.bleServerType" label="BLE Server Type" options={ENUM_VALUES.bleServerType} />
                    <Controller
                      name="appConfig.bleCustomDeviceName"
                      control={control}
                      render={({ field }) => (
                        <ConfigField label="BLE Device Name">
                          <Input {...field} className="max-w-[200px]" />
                        </ConfigField>
                      )}
                    />
                    <SwitchField control={control} name="appConfig.enableBeaconScanner" label="Enable Beacon Scanner" />
                  </div>
                </TabsContent>

                {/* Regions Tab */}
                <TabsContent value="regions" className="space-y-4 mt-0">
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure tracker sub-regions for zone-based detection.
                  </p>
                  <Controller
                    name="walabotConfig.trackerSubRegions"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-3">
                        {(field.value || []).map((region, idx) => (
                          <Card key={idx} className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-medium">Region {idx + 1}: {region.name}</span>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  const newRegions = [...field.value];
                                  newRegions.splice(idx, 1);
                                  field.onChange(newRegions);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>X: {region.xMin} to {region.xMax}</div>
                              <div>Y: {region.yMin} to {region.yMax}</div>
                              <div>Z: {region.zMin} to {region.zMax}</div>
                            </div>
                          </Card>
                        ))}
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            field.onChange([...(field.value || []), {
                              xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1,
                              enterDuration: 120, exitDuration: 120,
                              isFallingDetection: false, isPresenceDetection: false,
                              isLowSnr: true, isHorizontal: true, isDoor: false,
                              name: `Region ${(field.value?.length || 0) + 1}`
                            }]);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add Region
                        </Button>
                      </div>
                    )}
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right: JSON Editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('config.jsonEditor', 'JSON Editor')}</CardTitle>
              <div className="flex gap-2">
                {jsonError && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Invalid
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={applyJsonToForm} disabled={!!jsonError}>
                  <Check className="h-4 w-4 mr-1" /> Apply
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <Editor
                height="540px"
                language="json"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                value={jsonValue}
                onChange={handleJsonChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2
                }}
              />
            </div>
            {jsonError && (
              <p className="text-sm text-destructive mt-2">{jsonError}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('config.versionHistory', 'Version History')}</DialogTitle>
            <DialogDescription>
              {t('config.versionHistoryDesc', 'View and rollback to previous configurations')}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {versions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No versions yet</p>
              ) : (
                versions.map(v => (
                  <Card key={v.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-lg">v{v.versionNumber}</span>
                        {getStatusBadge(v.status)}
                      </div>
                      <div className="flex items-center gap-2">
                        {(v.status === 'FAILED' || v.status === 'TIMEOUT') && (
                          <Button size="sm" variant="outline" onClick={() => handleRetry(v.id)}>
                            <RotateCcw className="h-3 w-3 mr-1" /> Retry
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleRollback(v.versionNumber)}>
                          Rollback
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Sent: {new Date(v.sentAt).toLocaleString()}
                      {v.ackAt && <span className="ml-3">ACK: {new Date(v.ackAt).toLocaleString()}</span>}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RadarConfigPage;
