import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Editor from '@monaco-editor/react';
import {
  Settings, Send, RotateCcw, History, Save, AlertTriangle,
  Check, X, Clock, ChevronLeft, Copy, Plus, Trash2, RefreshCw,
  Square, Bed, Power, Upload, Bell, BellOff, Wifi, Radio,
  Thermometer, Activity, Terminal, Download, Play, Pause, Volume2, VolumeX,
  Link, Globe
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
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

import api, { deviceConfigAPI, COMMAND_TYPES } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { vayyarConfigSchema, ENUM_VALUES, DEFAULT_CONFIG, mqttOptionsSchema } from '@/lib/vayyarConfigSchema';
import { RoomVisualEditor } from '@/components/RoomVisualEditor';

// Field component with tooltip
const ConfigField = ({ label, description, children, flexible, className = "" }) => (
  <div className={`space-y-2 ${className}`}>
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
const NumberField = ({ control, name, label, description, min, max, step = 1, flexible, unit = "" }) => (
  <ConfigField label={label} description={description} flexible={flexible}>
    <div className="flex items-center gap-2">
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
            className="max-w-[150px]"
          />
        )}
      />
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  </ConfigField>
);

// Select field - supports both string options and numeric options with labels
const SelectField = ({ control, name, label, description, options }) => (
  <ConfigField label={label} description={description}>
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        // Check if options are objects with value/label or simple strings
        const isNumericOptions = options.length > 0 && typeof options[0] === 'object';
        
        return (
          <Select 
            value={String(field.value)} 
            onValueChange={(val) => {
              // Convert back to number if numeric options
              field.onChange(isNumericOptions ? Number(val) : val);
            }}
          >
            <SelectTrigger className="max-w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isNumericOptions ? (
                options.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))
              ) : (
                options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }}
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

// Command Button Component
const CommandButton = ({ icon: Icon, label, description, onClick, loading, variant = "outline", disabled = false }) => (
  <Button 
    variant={variant} 
    className="h-auto py-3 px-4 flex flex-col items-start gap-1 w-full"
    onClick={onClick}
    disabled={loading || disabled}
  >
    <div className="flex items-center gap-2">
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="font-medium">{label}</span>
    </div>
    <span className="text-xs text-muted-foreground text-left">{description}</span>
  </Button>
);

export function RadarConfigPage() {
  const { t } = useTranslation();
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [commandLoading, setCommandLoading] = useState(null);
  const [radar, setRadar] = useState(null);
  const [deviceState, setDeviceState] = useState(null);
  const [versions, setVersions] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('commands');
  const [jsonValue, setJsonValue] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [mqttOptions, setMqttOptions] = useState({ qos: 1, retain: false });
  
  // Dialog states for commands with parameters
  const [baseUrlDialog, setBaseUrlDialog] = useState(false);
  const [baseUrlValue, setBaseUrlValue] = useState('');
  const [firmwareDialog, setFirmwareDialog] = useState(false);
  const [firmwareUrl, setFirmwareUrl] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [wifiDialog, setWifiDialog] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

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
      const [radarRes, configRes, versionsRes, stateRes, cmdHistoryRes] = await Promise.all([
        api.get(`/sensors`).then(r => r.data.find(s => s.id === deviceId)),
        deviceConfigAPI.getLatest(deviceId).catch(() => ({ data: null })),
        deviceConfigAPI.getVersions(deviceId, 10).catch(() => ({ data: [] })),
        deviceConfigAPI.getState(deviceId).catch(() => ({ data: null })),
        deviceConfigAPI.getCommandHistory(deviceId, 10).catch(() => ({ data: [] }))
      ]);
      
      setRadar(radarRes);
      setVersions(versionsRes.data || []);
      setDeviceState(stateRes.data);
      setCommandHistory(cmdHistoryRes.data || []);
      
      if (configRes.data && !configRes.data.isDefault) {
        reset(configRes.data.config);
        setJsonValue(JSON.stringify(configRes.data.config, null, 2));
      } else {
        reset(DEFAULT_CONFIG);
        setJsonValue(JSON.stringify(DEFAULT_CONFIG, null, 2));
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error(t('config.fetchError', 'Erreur lors du chargement de la configuration'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, reset, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync JSON editor with form
  useEffect(() => {
    setJsonValue(JSON.stringify(watchedConfig, null, 2));
  }, [watchedConfig]);

  // Handle JSON changes
  const handleJsonChange = (value) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      vayyarConfigSchema.parse(parsed);
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
      toast.success('JSON appliqué au formulaire');
    } catch (e) {
      setJsonError(e.message);
      toast.error('JSON invalide');
    }
  };

  // Send configuration
  const onSubmit = async (data) => {
    setSending(true);
    try {
      const response = await deviceConfigAPI.sendConfig(deviceId, data, mqttOptions);
      toast.success(`Configuration envoyée (v${response.data.versionNumber})`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'envoi de la configuration');
    } finally {
      setSending(false);
    }
  };

  // Send command
  const sendCommand = async (commandType, params = null) => {
    setCommandLoading(commandType);
    try {
      await deviceConfigAPI.sendCommand(deviceId, commandType, params);
      toast.success('Commande envoyée avec succès');
      // Refresh command history
      const histRes = await deviceConfigAPI.getCommandHistory(deviceId, 10);
      setCommandHistory(histRes.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'envoi de la commande');
    } finally {
      setCommandLoading(null);
    }
  };

  // Rollback to version
  const handleRollback = async (versionNumber) => {
    try {
      await deviceConfigAPI.rollback(deviceId, versionNumber);
      toast.success(`Retour à la version ${versionNumber}`);
      setHistoryOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors du rollback');
    }
  };

  // Retry failed version
  const handleRetry = async (versionId) => {
    try {
      await deviceConfigAPI.retry(deviceId, versionId);
      toast.success('Configuration renvoyée');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la réessaie');
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

  const getDeviceStatusBadge = (status) => {
    const styles = {
      monitoring: { class: 'bg-green-500', label: 'Surveillance' },
      learning: { class: 'bg-blue-500', label: 'Apprentissage' },
      test: { class: 'bg-yellow-500', label: 'Test' },
      silent: { class: 'bg-gray-500', label: 'Silencieux' },
      'software update': { class: 'bg-purple-500', label: 'Mise à jour' }
    };
    const config = styles[status] || { class: 'bg-gray-500', label: status || 'Inconnu' };
    return <Badge className={config.class}>{config.label}</Badge>;
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
            <h1 className="text-2xl font-bold">Configuration Radar</h1>
            <p className="text-muted-foreground">{radar?.name || 'Radar inconnu'}</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                {radar?.device_id || deviceId}
              </code>
              {radar?.serial_product && (
                <code className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  SN: {radar.serial_product}
                </code>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            Historique
          </Button>
          <Button variant="outline" onClick={() => setShowJsonEditor(true)}>
            <Terminal className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button 
            onClick={handleSubmit(onSubmit)} 
            disabled={sending || !isDirty}
          >
            {sending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Envoyer Config
          </Button>
        </div>
      </div>

      {/* Device State Card */}
      {deviceState && (
        <Card className="border-primary/20">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">État:</span>
                {getDeviceStatusBadge(deviceState.status || deviceState.device_status)}
              </div>
              {deviceState.temperature && (
                <div className="flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Température: {deviceState.temperature}°C</span>
                </div>
              )}
              {deviceState.firmware && (
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Firmware: {deviceState.firmware}</span>
                </div>
              )}
              {deviceState.last_seen && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Vu: {new Date(deviceState.last_seen).toLocaleString('fr-FR')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MQTT Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Options MQTT</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 items-center flex-wrap">
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
              Topic Config: <code className="bg-muted px-2 py-1 rounded">/devices/{radar?.device_id || deviceId}/config</code>
            </div>
            <div className="text-sm text-muted-foreground">
              Topic Commandes: <code className="bg-muted px-2 py-1 rounded">/devices/{radar?.device_id || deviceId}/commands</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-7 mb-6">
              <TabsTrigger value="commands" className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                Commandes
              </TabsTrigger>
              <TabsTrigger value="visual" className="flex items-center gap-1">
                <Square className="h-3 w-3" />
                Visuel
              </TabsTrigger>
              <TabsTrigger value="detection">Détection</TabsTrigger>
              <TabsTrigger value="alerts">Alertes</TabsTrigger>
              <TabsTrigger value="telemetry">Télémétrie</TabsTrigger>
              <TabsTrigger value="network">Réseau</TabsTrigger>
              <TabsTrigger value="advanced">Avancé</TabsTrigger>
            </TabsList>

            {/* Commands Tab */}
            <TabsContent value="commands" className="mt-0">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Actions rapides</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <CommandButton
                      icon={Power}
                      label="Redémarrer"
                      description="Redémarrer le radar"
                      onClick={() => sendCommand(COMMAND_TYPES.REBOOT_DEVICE)}
                      loading={commandLoading === COMMAND_TYPES.REBOOT_DEVICE}
                      variant="destructive"
                    />
                    <CommandButton
                      icon={BellOff}
                      label="Annuler Alarme"
                      description="Stopper l'alarme en cours"
                      onClick={() => sendCommand(COMMAND_TYPES.CANCEL_ALARM)}
                      loading={commandLoading === COMMAND_TYPES.CANCEL_ALARM}
                    />
                    <CommandButton
                      icon={X}
                      label="Annuler Chute"
                      description="Annuler la détection de chute"
                      onClick={() => sendCommand(COMMAND_TYPES.CANCEL_FALL)}
                      loading={commandLoading === COMMAND_TYPES.CANCEL_FALL}
                    />
                    <CommandButton
                      icon={Upload}
                      label="Logs Application"
                      description="Demander l'upload des logs"
                      onClick={() => sendCommand(COMMAND_TYPES.UPLOAD_APP_LOGS)}
                      loading={commandLoading === COMMAND_TYPES.UPLOAD_APP_LOGS}
                    />
                    <CommandButton
                      icon={Upload}
                      label="Logs Développeur"
                      description="Demander les logs détaillés"
                      onClick={() => sendCommand(COMMAND_TYPES.UPLOAD_DEV_LOGS)}
                      loading={commandLoading === COMMAND_TYPES.UPLOAD_DEV_LOGS}
                    />
                    <CommandButton
                      icon={RefreshCw}
                      label="Reboot + Logs"
                      description="Redémarrer et uploader les logs"
                      onClick={() => sendCommand(COMMAND_TYPES.REBOOT_UPLOAD_LOG)}
                      loading={commandLoading === COMMAND_TYPES.REBOOT_UPLOAD_LOG}
                    />
                    <CommandButton
                      icon={Globe}
                      label="Changer Base URL"
                      description="Modifier l'URL du serveur"
                      onClick={() => setBaseUrlDialog(true)}
                      loading={commandLoading === COMMAND_TYPES.UPDATE_BASE_URL}
                    />
                    <CommandButton
                      icon={Download}
                      label="Mise à jour FW"
                      description="Télécharger le firmware"
                      onClick={() => setFirmwareDialog(true)}
                      loading={commandLoading === COMMAND_TYPES.DOWNLOAD_FIRMWARE}
                    />
                    <CommandButton
                      icon={Wifi}
                      label="Config WiFi"
                      description="Modifier les identifiants WiFi (déprécié)"
                      onClick={() => setWifiDialog(true)}
                      loading={commandLoading === COMMAND_TYPES.UPDATE_WIFI}
                    />
                  </div>
                </div>

                {/* Command History */}
                {commandHistory.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-4">Historique des commandes</h3>
                    <div className="space-y-2">
                      {commandHistory.slice(0, 5).map((cmd, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Terminal className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{cmd.commandName}</span>
                            <Badge variant="outline">{cmd.status}</Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(cmd.sentAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Visual Room Editor Tab */}
            <TabsContent value="visual" className="mt-0">
              <RoomVisualEditor 
                config={watch()}
                onConfigChange={(newConfig) => {
                  if (newConfig.walabotConfig) {
                    setValue('walabotConfig.xMin', newConfig.walabotConfig.xMin);
                    setValue('walabotConfig.xMax', newConfig.walabotConfig.xMax);
                    setValue('walabotConfig.yMin', newConfig.walabotConfig.yMin);
                    setValue('walabotConfig.yMax', newConfig.walabotConfig.yMax);
                    setValue('walabotConfig.sensorHeight', newConfig.walabotConfig.sensorHeight);
                    setValue('walabotConfig.sensorMounting', newConfig.walabotConfig.sensorMounting);
                    if (newConfig.walabotConfig.trackerSubRegions) {
                      setValue('walabotConfig.trackerSubRegions', newConfig.walabotConfig.trackerSubRegions);
                    }
                  }
                }}
              />
            </TabsContent>

            {/* Detection Tab */}
            <TabsContent value="detection" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Arena Configuration */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Square className="h-4 w-4" />
                      Zone de détection (Arena)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <NumberField control={control} name="walabotConfig.xMin" label="X Min" unit="m" step={0.1} />
                      <NumberField control={control} name="walabotConfig.xMax" label="X Max" unit="m" step={0.1} />
                      <NumberField control={control} name="walabotConfig.yMin" label="Y Min" unit="m" step={0.1} />
                      <NumberField control={control} name="walabotConfig.yMax" label="Y Max" unit="m" step={0.1} />
                      <NumberField control={control} name="walabotConfig.zMax" label="Z Max" unit="m" step={0.1} />
                      <NumberField control={control} name="walabotConfig.sensorHeight" label="Hauteur capteur" unit="m" step={0.1} />
                    </div>
                  </div>

                  <Separator />

                  {/* Falling Detection */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Détection de chute
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="walabotConfig.fallingSensitivity" label="Sensibilite" options={ENUM_VALUES.fallingSensitivity} />
                      <SelectField control={control} name="walabotConfig.sensorMounting" label="Position capteur" options={ENUM_VALUES.sensorMounting} />
                      <SwitchField control={control} name="appConfig.enableSensitiveMode" label="Mode sensible" description="Detection des chutes sensibles" />
                      <SwitchField control={control} name="walabotConfig.fallingMitigatorEnabled" label="Mitigateur de chute" description="Reduit les faux positifs" />
                      <NumberField control={control} name="walabotConfig.maxTargetsForFallingTrigger" label="Max cibles pour chute" min={0} max={5} />
                      <NumberField control={control} name="walabotConfig.fallingMitigatorThreshold" label="Seuil mitigateur" min={0} max={1} step={0.1} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <SliderField control={control} name="appConfig.sensitivityLevel" label="Niveau de sensibilite" min={0} max={1} step={0.05} />
                      <NumberField control={control} name="appConfig.thMinEventsForFirstDecision" label="Evenements min pour decision" min={1} max={20} />
                      <NumberField control={control} name="appConfig.thNumOfDetectionsInChain" label="Detections en chaine" min={1} max={20} />
                      <NumberField control={control} name="walabotConfig.durationUntilConfirm_sec" label="Duree avant confirmation" unit="sec" min={0} max={120} />
                      <NumberField control={control} name="walabotConfig.minTimeOfTarInFallLoc_sec" label="Temps min en position chute" unit="sec" min={0} max={120} />
                    </div>
                  </div>

                  <Separator />

                  {/* Bed Exit Detection */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Bed className="h-4 w-4" />
                      Sortie de lit
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField control={control} name="walabotConfig.bedExitEnabled" label="Activer détection" description="Détecte les sorties de lit" />
                      <SwitchField control={control} name="appConfig.enableOutOfBed" label="Hors du lit" description="Alerte si personne hors du lit" />
                      <SliderField control={control} name="walabotConfig.bedExitPredictionThreshold" label="Seuil de prédiction" min={0} max={1} step={0.05} />
                      <NumberField control={control} name="walabotConfig.bedExitNFramesToReset" label="Frames pour reset" min={10} max={500} />
                    </div>
                  </div>

                  <Separator />

                  {/* Presence Detection */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Détection de présence
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <NumberField control={control} name="walabotConfig.enterDuration" label="Durée d'entrée" unit="sec" min={0} max={300} />
                      <NumberField control={control} name="walabotConfig.exitDuration" label="Durée de sortie" unit="sec" min={0} max={300} />
                      <SwitchField control={control} name="walabotConfig.performHeatup" label="Préchauffage" description="Phase de calibration au démarrage" />
                      <SwitchField control={control} name="walabotConfig.performAgc" label="AGC" description="Contrôle automatique du gain" />
                      <SwitchField control={control} name="appConfig.enableDoorEvents" label="Événements porte" description="Détecte les entrées/sorties" />
                    </div>
                  </div>

                  <Separator />

                  {/* Tracker Sub-Regions */}
                  <div>
                    <h4 className="font-medium mb-4">Sous-régions de détection</h4>
                    <Controller
                      name="walabotConfig.trackerSubRegions"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-3">
                          {(field.value || []).map((region, idx) => (
                            <Card key={idx} className="p-3">
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-medium">Région {idx + 1}: {region.name}</span>
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
                                <div>X: {region.xMin} à {region.xMax}</div>
                                <div>Y: {region.yMin} à {region.yMax}</div>
                                <div>Z: {region.zMin} à {region.zMax}</div>
                              </div>
                              <div className="flex gap-2 mt-2 flex-wrap">
                                {region.isFallingDetection && <Badge variant="outline">Chute</Badge>}
                                {region.isPresenceDetection && <Badge variant="outline">Présence</Badge>}
                                {region.isDoor && <Badge variant="outline">Porte</Badge>}
                              </div>
                            </Card>
                          ))}
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => {
                              field.onChange([...(field.value || []), {
                                xMin: 0, xMax: 1, yMin: 0.3, yMax: 1, zMin: 0, zMax: 1.2,
                                mode: 0, enterDuration: 10, exitDuration: 30,
                                isFallingDetection: false, isPresenceDetection: true,
                                isLowSnr: true, isHorizontal: true, isDoor: false,
                                name: `Région ${(field.value?.length || 0) + 1}`
                              }]);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Ajouter une région
                          </Button>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Alert Timing */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Délais d'alerte
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <NumberField control={control} name="appConfig.confirmedToAlertTimeoutSec" label="Délai confirmation → alerte" unit="sec" min={0} max={300} />
                      <NumberField control={control} name="appConfig.callingDurationSec" label="Durée d'appel" unit="sec" min={0} max={300} />
                      <NumberField control={control} name="appConfig.suspendDuration_sec" label="Durée de suspension" unit="sec" min={0} max={3600} />
                    </div>
                  </div>

                  <Separator />

                  {/* Audio & LED */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Audio & LED
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField control={control} name="appConfig.silentMode" label="Mode silencieux" description="Désactive les alertes sonores" />
                      <SelectField control={control} name="appConfig.ledMode" label="Mode LED" options={ENUM_VALUES.ledMode} />
                      <SelectField control={control} name="appConfig.ledPolicy" label="Politique LED" options={ENUM_VALUES.ledPolicy} />
                    </div>
                  </div>

                  <Separator />

                  {/* MQTT Reporting */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Radio className="h-4 w-4" />
                      Rapports MQTT
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField control={control} name="appConfig.reportFallsToMqtt" label="Reporter les chutes" description="Envoie les chutes via MQTT" />
                      <SwitchField control={control} name="appConfig.reportPresenceToMqtt" label="Reporter la présence" description="Envoie la présence via MQTT" />
                      <NumberField control={control} name="appConfig.presenceReportMinRateMills" label="Intervalle présence" unit="ms" min={1000} max={600000} />
                      <SwitchField control={control} name="appConfig.enablePresencePeriodicReport" label="Rapport périodique" description="Envoie régulièrement l'état de présence" />
                    </div>
                  </div>

                  <Separator />

                  {/* Dry Contacts */}
                  <div>
                    <h4 className="font-medium mb-4">Contacts secs</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Contact primaire</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Controller
                            name="appConfig.dryContacts.primary.mode"
                            control={control}
                            render={({ field }) => (
                              <div className="space-y-1">
                                <Label className="text-xs">Mode</Label>
                                <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                              </div>
                            )}
                          />
                          <Controller
                            name="appConfig.dryContacts.primary.policy"
                            control={control}
                            render={({ field }) => (
                              <div className="space-y-1">
                                <Label className="text-xs">Policy</Label>
                                <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                              </div>
                            )}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Contact secondaire</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Controller
                            name="appConfig.dryContacts.secondary.mode"
                            control={control}
                            render={({ field }) => (
                              <div className="space-y-1">
                                <Label className="text-xs">Mode</Label>
                                <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                              </div>
                            )}
                          />
                          <Controller
                            name="appConfig.dryContacts.secondary.policy"
                            control={control}
                            render={({ field }) => (
                              <div className="space-y-1">
                                <Label className="text-xs">Policy</Label>
                                <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Telemetry Tab */}
            <TabsContent value="telemetry" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Telemetry Settings */}
                  <div>
                    <h4 className="font-medium mb-4">Paramètres de télémétrie</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="appConfig.telemetryPolicy" label="Politique" options={ENUM_VALUES.telemetryPolicy} />
                      <SelectField control={control} name="appConfig.telemetryTransport" label="Transport" options={ENUM_VALUES.telemetryTransport} />
                    </div>
                  </div>

                  <Separator />

                  {/* Telemetry Events */}
                  <div>
                    <h4 className="font-medium mb-4">Événements de télémétrie</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <SwitchField control={control} name="appConfig.telemAlwaysON" label="Toujours actif" />
                      <SwitchField control={control} name="appConfig.telemOnFall" label="Sur chute" />
                      <SwitchField control={control} name="appConfig.telemOnSensitiveFall" label="Sur chute sensible" />
                      <SwitchField control={control} name="appConfig.telemOnBedExit" label="Sur sortie de lit" />
                      <SwitchField control={control} name="appConfig.telemOnDoorEvents" label="Sur événements porte" />
                      <SwitchField control={control} name="appConfig.telemOnOutOfBed" label="Sur hors du lit" />
                      <SwitchField control={control} name="appConfig.enableTelemetriesOnEventDuringSuspend" label="Pendant suspension" />
                    </div>
                  </div>

                  <Separator />

                  {/* Walabot Telemetry */}
                  <div>
                    <h4 className="font-medium mb-4">Télémétrie Walabot</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <SwitchField control={control} name="walabotConfig.enableFallingTelemetry" label="Chute" />
                      <SwitchField control={control} name="walabotConfig.enableSensitiveFallingTelemetry" label="Chute sensible" />
                      <SwitchField control={control} name="walabotConfig.enablePresenceTelemetry" label="Présence" />
                      <SwitchField control={control} name="walabotConfig.enableTrackerTargetTelemetry" label="Cibles tracker" />
                      <SwitchField control={control} name="walabotConfig.enableBedExitTelemetry" label="Sortie de lit" />
                      <SwitchField control={control} name="walabotConfig.enableBedExitStateTelemetry" label="État lit" />
                      <SwitchField control={control} name="walabotConfig.enableDoorEventTelemetry" label="Événements porte" />
                      <SwitchField control={control} name="walabotConfig.enablePeakTelemetry" label="Peak" />
                      <SwitchField control={control} name="walabotConfig.enableHeightProfileTelemetry" label="Profil hauteur" />
                      <SwitchField control={control} name="walabotConfig.enableOtfPointTelemetry" label="Points OTF" />
                      <SwitchField control={control} name="walabotConfig.enableImageParamsTelemetry" label="Params image" />
                      <SwitchField control={control} name="walabotConfig.enableClustersTelemetry" label="Clusters" />
                      <SwitchField control={control} name="walabotConfig.enableSubRegionStateTelemetry" label="État sous-régions" />
                      <SwitchField control={control} name="walabotConfig.enableReferenceTelemetry" label="Référence" />
                      <SwitchField control={control} name="walabotConfig.enableMtiParamsTelemetry" label="Params MTI" />
                    </div>
                  </div>

                  <Separator />

                  {/* Debug */}
                  <div>
                    <h4 className="font-medium mb-4">Debug</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="appConfig.trackerTargetsDebugPolicy" label="Debug cibles" options={ENUM_VALUES.trackerTargetsDebugPolicy} />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* NTP Servers */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Serveurs NTP
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Controller
                        name="appConfig.ntpPrimaryBackupServer"
                        control={control}
                        render={({ field }) => (
                          <ConfigField label="Serveur NTP primaire">
                            <Input {...field} placeholder="europe.pool.ntp.org" />
                          </ConfigField>
                        )}
                      />
                      <Controller
                        name="appConfig.ntpSecondaryBackupServer"
                        control={control}
                        render={({ field }) => (
                          <ConfigField label="Serveur NTP secondaire">
                            <Input {...field} placeholder="us.pool.ntp.org" />
                          </ConfigField>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* WiFi Health */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Santé WiFi
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField control={control} name="appConfig.enableWifiHealthMonitor" label="Surveillance WiFi" description="Active le monitoring de la connexion" />
                      <NumberField control={control} name="appConfig.maxDisconnetionDurationSecWifiHealthMonitor" label="Durée max déconnexion" unit="sec" min={0} max={600} />
                      <NumberField control={control} name="appConfig.disconnectionsBurstLimitWifiHealthMonitor" label="Limite burst déconnexions" min={0} max={50} />
                      <NumberField control={control} name="appConfig.maxDisconnectionsPerHourAverageWifiHealthMonitor" label="Déconnexions max/h" min={0} max={60} />
                    </div>
                  </div>

                  <Separator />

                  {/* RSSI Monitoring */}
                  <div>
                    <h4 className="font-medium mb-4">Monitoring RSSI</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField control={control} name="appConfig.enableRssiMonitor" label="Activer monitoring RSSI" />
                      <NumberField control={control} name="appConfig.rssiThresholdRssiMonitor" label="Seuil RSSI" unit="dBm" min={-100} max={0} />
                      <NumberField control={control} name="appConfig.samplesNumRssiMonitor" label="Nombre d'échantillons" min={1} max={100} />
                    </div>
                  </div>

                  <Separator />

                  {/* BLE Configuration */}
                  <div>
                    <h4 className="font-medium mb-4">Configuration BLE</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="appConfig.bleServerType" label="Type serveur BLE" options={ENUM_VALUES.bleServerType} />
                      <Controller
                        name="appConfig.bleCustomDeviceName"
                        control={control}
                        render={({ field }) => (
                          <ConfigField label="Nom BLE personnalisé">
                            <Input {...field} placeholder="VC000" maxLength={20} />
                          </ConfigField>
                        )}
                      />
                      <SwitchField control={control} name="appConfig.enableBeaconScanner" label="Scanner Beacon" description="Active le scan des beacons BLE" />
                      <NumberField control={control} name="appConfig.bleBeaconRssiThreshold" label="Seuil RSSI Beacon" unit="dBm" min={-100} max={0} />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Product & Algorithm */}
                  <div>
                    <h4 className="font-medium mb-4">Produit & Algorithme</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="productType" label="Type de produit" options={ENUM_VALUES.productType} />
                      <SelectField control={control} name="appConfig.algoProfile" label="Profil algorithme" options={ENUM_VALUES.algoProfile} />
                    </div>
                  </div>

                  <Separator />

                  {/* RF Profile */}
                  <div>
                    <h4 className="font-medium mb-4">Profil RF</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="rfProfile.rfRegulationZone" label="Zone de régulation" options={ENUM_VALUES.rfRegulationZone} />
                      <SelectField control={control} name="rfProfile.rfBandWidth" label="Bande passante" options={ENUM_VALUES.rfBandWidth} />
                    </div>
                  </div>

                  <Separator />

                  {/* Logging */}
                  <div>
                    <h4 className="font-medium mb-4">Logging</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField control={control} name="appConfig.logLevel" label="Niveau de log" options={ENUM_VALUES.logLevel} />
                      <SelectField control={control} name="appConfig.appLogAutoLevel" label="Log auto" options={ENUM_VALUES.appLogLevel} />
                      <SelectField control={control} name="appConfig.appLogOnDemandLevel" label="Log à la demande" options={ENUM_VALUES.appLogLevel} />
                      <SwitchField control={control} name="appConfig.legacyLogFileUpload" label="Upload legacy" description="Upload fichiers logs ancienne méthode" />
                    </div>
                  </div>

                  <Separator />

                  {/* Modes */}
                  <div>
                    <h4 className="font-medium mb-4">Modes de fonctionnement</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <SwitchField control={control} name="appConfig.demoMode" label="Mode démo" />
                      <SwitchField control={control} name="appConfig.enableTestMode" label="Mode test" />
                      <SwitchField control={control} name="appConfig.offlineMode" label="Mode hors ligne" />
                      <SwitchField control={control} name="appConfig.smartReboot" label="Redémarrage intelligent" />
                      <SwitchField control={control} name="appConfig.enableAnalytics" label="Analytics" />
                    </div>
                  </div>

                  <Separator />

                  {/* DSP Records */}
                  <div>
                    <h4 className="font-medium mb-4">Enregistrements DSP</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <NumberField control={control} name="appConfig.dspRecordsPublishMaxLatency_sec" label="Latence max publication" unit="sec" min={0} max={60} />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* JSON Editor Dialog */}
      <Dialog open={showJsonEditor} onOpenChange={setShowJsonEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Éditeur JSON</DialogTitle>
              <div className="flex gap-2">
                {jsonError && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Invalide
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={applyJsonToForm} disabled={!!jsonError}>
                  <Check className="h-4 w-4 mr-1" /> Appliquer
                </Button>
              </div>
            </div>
            <DialogDescription>
              Modifiez directement la configuration JSON. Cliquez sur "Appliquer" pour valider.
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-md overflow-hidden">
            <Editor
              height="500px"
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
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique des versions</DialogTitle>
            <DialogDescription>
              Visualisez et restaurez les configurations précédentes
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {versions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune version</p>
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
                            <RotateCcw className="h-3 w-3 mr-1" /> Réessayer
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleRollback(v.versionNumber)}>
                          Restaurer
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Envoyé: {new Date(v.sentAt).toLocaleString('fr-FR')}
                      {v.ackAt && <span className="ml-3">ACK: {new Date(v.ackAt).toLocaleString('fr-FR')}</span>}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Update Base URL Dialog */}
      <Dialog open={baseUrlDialog} onOpenChange={setBaseUrlDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Modifier l'URL de base
            </DialogTitle>
            <DialogDescription>
              Changez l'URL du serveur vers lequel le radar envoie ses données.
              Attention : une mauvaise URL peut rendre le radar inaccessible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Nouvelle URL de base</Label>
              <Input
                id="baseUrl"
                placeholder="https://api.example.com"
                value={baseUrlValue}
                onChange={(e) => setBaseUrlValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Format attendu : https://domain.com ou http://ip:port
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaseUrlDialog(false)}>
              Annuler
            </Button>
            <Button 
              onClick={async () => {
                if (!baseUrlValue.trim()) {
                  toast.error('Veuillez saisir une URL');
                  return;
                }
                await sendCommand(COMMAND_TYPES.UPDATE_BASE_URL, { baseUrl: baseUrlValue.trim() });
                setBaseUrlDialog(false);
                setBaseUrlValue('');
              }}
              disabled={commandLoading === COMMAND_TYPES.UPDATE_BASE_URL}
            >
              {commandLoading === COMMAND_TYPES.UPDATE_BASE_URL ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Firmware Dialog */}
      <Dialog open={firmwareDialog} onOpenChange={setFirmwareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Mise à jour Firmware
            </DialogTitle>
            <DialogDescription>
              Déclenchez le téléchargement d'une mise à jour firmware sur le radar.
              Laissez les champs vides pour utiliser les paramètres par défaut du serveur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fwUrl">URL du firmware (optionnel)</Label>
              <Input
                id="fwUrl"
                placeholder="https://updates.vayyar.com/firmware.bin"
                value={firmwareUrl}
                onChange={(e) => setFirmwareUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fwVersion">Version (optionnel)</Label>
              <Input
                id="fwVersion"
                placeholder="38.42.0"
                value={firmwareVersion}
                onChange={(e) => setFirmwareVersion(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFirmwareDialog(false)}>
              Annuler
            </Button>
            <Button 
              onClick={async () => {
                const params = {};
                if (firmwareUrl.trim()) params.url = firmwareUrl.trim();
                if (firmwareVersion.trim()) params.version = firmwareVersion.trim();
                await sendCommand(COMMAND_TYPES.DOWNLOAD_FIRMWARE, Object.keys(params).length > 0 ? params : null);
                setFirmwareDialog(false);
                setFirmwareUrl('');
                setFirmwareVersion('');
              }}
              disabled={commandLoading === COMMAND_TYPES.DOWNLOAD_FIRMWARE}
            >
              {commandLoading === COMMAND_TYPES.DOWNLOAD_FIRMWARE ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Télécharger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update WiFi Credentials Dialog */}
      <Dialog open={wifiDialog} onOpenChange={setWifiDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Configuration WiFi
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                Déprécié
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Modifiez les identifiants WiFi du radar. Cette commande est dépréciée et peut ne pas fonctionner sur les versions récentes du firmware.
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-600">
              Cette fonctionnalité est dépréciée. Utilisez le Bluetooth ou l'interface web du radar pour modifier le WiFi.
            </AlertDescription>
          </Alert>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wifiSsid">Nom du réseau (SSID)</Label>
              <Input
                id="wifiSsid"
                placeholder="MonReseauWiFi"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wifiPassword">Mot de passe</Label>
              <Input
                id="wifiPassword"
                type="password"
                placeholder="••••••••"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWifiDialog(false)}>
              Annuler
            </Button>
            <Button 
              variant="secondary"
              onClick={async () => {
                if (!wifiSsid.trim()) {
                  toast.error('Veuillez saisir le nom du réseau (SSID)');
                  return;
                }
                if (!wifiPassword.trim()) {
                  toast.error('Veuillez saisir le mot de passe');
                  return;
                }
                await sendCommand(COMMAND_TYPES.UPDATE_WIFI, { 
                  ssid: wifiSsid.trim(), 
                  password: wifiPassword.trim() 
                });
                setWifiDialog(false);
                setWifiSsid('');
                setWifiPassword('');
              }}
              disabled={commandLoading === COMMAND_TYPES.UPDATE_WIFI}
            >
              {commandLoading === COMMAND_TYPES.UPDATE_WIFI ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RadarConfigPage;
