import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, Radio, RefreshCw, Settings, Activity, Thermometer, Clock, MemoryStick } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';

export function RadarsPage() {
  const { t } = useTranslation();
  const { lastMessage } = useWebSocket();
  const [mqttStatus, setMqttStatus] = useState(null);
  const [radarSensors, setRadarSensors] = useState([]);
  const [allSensors, setAllSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [selectedSensorId, setSelectedSensorId] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sensorsRes, statusRes] = await Promise.all([
        api.get('/sensors'),
        api.get('/mqtt/status').catch(() => ({ data: null }))
      ]);
      
      const sensors = sensorsRes.data;
      setAllSensors(sensors);
      
      // Filter radar sensors (those with model starting with "id_" are from MQTT)
      const radars = sensors.filter(s => 
        s.type === 'RADAR' || 
        (s.model && s.model.startsWith('id_'))
      );
      setRadarSensors(radars);
      
      if (statusRes.data) {
        setMqttStatus(statusRes.data);
      }
    } catch (error) {
      console.error('Error fetching radar data:', error);
      toast.error(t('radars.fetchError', 'Erreur lors du chargement des radars'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'sensor_status' || lastMessage.type === 'sensor_registered') {
        fetchData();
      }
    }
  }, [lastMessage]);

  const handleRegisterDevice = async () => {
    if (!newDeviceId || !selectedSensorId) {
      toast.error(t('radars.fillFields', 'Veuillez remplir tous les champs'));
      return;
    }
    
    try {
      await api.post(`/mqtt/register-device?device_id=${encodeURIComponent(newDeviceId)}&sensor_id=${selectedSensorId}`);
      toast.success(t('radars.deviceRegistered', 'Appareil enregistré avec succès'));
      setRegisterDialog(false);
      setNewDeviceId('');
      setSelectedSensorId('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('radars.registerError', 'Erreur lors de l\'enregistrement'));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ONLINE': return 'bg-green-500';
      case 'OFFLINE': return 'bg-red-500';
      case 'MAINTENANCE': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ONLINE': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{t('radars.online', 'En ligne')}</Badge>;
      case 'OFFLINE': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{t('radars.offline', 'Hors ligne')}</Badge>;
      case 'MAINTENANCE': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{t('radars.maintenance', 'Maintenance')}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return t('radars.never', 'Jamais');
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000;
    
    if (diff < 60) return t('radars.justNow', 'À l\'instant');
    if (diff < 3600) return t('radars.minutesAgo', '{{min}} min', { min: Math.floor(diff / 60) });
    if (diff < 86400) return t('radars.hoursAgo', '{{hours}}h', { hours: Math.floor(diff / 3600) });
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6" data-testid="radars-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('radars.title', 'Radars Vayyar')}</h1>
          <p className="text-muted-foreground">{t('radars.subtitle', 'Gestion des capteurs radar connectés via MQTT')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading} data-testid="refresh-radars-btn">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Actualiser')}
          </Button>
          <Dialog open={registerDialog} onOpenChange={setRegisterDialog}>
            <DialogTrigger asChild>
              <Button data-testid="register-device-btn">
                <Radio className="h-4 w-4 mr-2" />
                {t('radars.registerDevice', 'Associer un appareil')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('radars.registerDeviceTitle', 'Associer un appareil MQTT')}</DialogTitle>
                <DialogDescription>
                  {t('radars.registerDeviceDesc', 'Associez manuellement un device ID MQTT à un capteur existant')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{t('radars.deviceId', 'Device ID MQTT')}</Label>
                  <Input 
                    placeholder="id_QTg6MDM6..." 
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    data-testid="device-id-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.sensor', 'Capteur cible')}</Label>
                  <Select value={selectedSensorId} onValueChange={setSelectedSensorId}>
                    <SelectTrigger data-testid="sensor-select">
                      <SelectValue placeholder={t('radars.selectSensor', 'Sélectionner un capteur')} />
                    </SelectTrigger>
                    <SelectContent>
                      {allSensors.filter(s => s.type === 'RADAR').map(sensor => (
                        <SelectItem key={sensor.id} value={sensor.id}>
                          {sensor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleRegisterDevice} className="w-full" data-testid="confirm-register-btn">
                  {t('radars.register', 'Associer')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* MQTT Status Card */}
      <Card className="border-primary/20" data-testid="mqtt-status-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mqttStatus?.connected ? (
                <div className="p-2 rounded-full bg-green-500/20">
                  <Wifi className="h-5 w-5 text-green-500" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-red-500/20">
                  <WifiOff className="h-5 w-5 text-red-500" />
                </div>
              )}
              <div>
                <CardTitle className="text-lg">{t('radars.mqttConnection', 'Connexion MQTT')}</CardTitle>
                <CardDescription>
                  {mqttStatus?.broker_host}:{mqttStatus?.broker_port}
                </CardDescription>
              </div>
            </div>
            <Badge variant={mqttStatus?.connected ? 'default' : 'destructive'} className={mqttStatus?.connected ? 'bg-green-500' : ''}>
              {mqttStatus?.connected ? t('radars.connected', 'Connecté') : t('radars.disconnected', 'Déconnecté')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('radars.status', 'Statut')}:</span>
              <span className="ml-2 font-medium">{mqttStatus?.enabled ? t('radars.enabled', 'Activé') : t('radars.disabled', 'Désactivé')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('radars.running', 'Service')}:</span>
              <span className="ml-2 font-medium">{mqttStatus?.running ? t('radars.running', 'En cours') : t('radars.stopped', 'Arrêté')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('radars.radarCount', 'Radars')}:</span>
              <span className="ml-2 font-medium">{radarSensors.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Radar Sensors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))
        ) : radarSensors.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="pt-6 text-center py-12">
              <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">{t('radars.noRadars', 'Aucun radar détecté')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('radars.noRadarsDesc', 'Les radars Vayyar seront automatiquement détectés lorsqu\'ils enverront des données via MQTT')}
              </p>
            </CardContent>
          </Card>
        ) : (
          radarSensors.map(radar => (
            <Card key={radar.id} className="relative overflow-hidden" data-testid={`radar-card-${radar.id}`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${getStatusColor(radar.status)}`} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${radar.status === 'ONLINE' ? 'bg-green-500/10' : 'bg-muted'}`}>
                      <Radio className={`h-5 w-5 ${radar.status === 'ONLINE' ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{radar.name}</CardTitle>
                      <CardDescription className="text-xs font-mono">
                        {radar.model || radar.id.slice(0, 12)}...
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(radar.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatLastSeen(radar.last_seen)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    <span>{radar.firmware || 'N/A'}</span>
                  </div>
                </div>
                
                {/* Extra info if available */}
                {(radar.temperature || radar.memory_usage || radar.uptime) && (
                  <div className="pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                    {radar.temperature && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Thermometer className="h-3 w-3" />
                        <span>{radar.temperature}°C</span>
                      </div>
                    )}
                    {radar.memory_usage && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MemoryStick className="h-3 w-3" />
                        <span>{radar.memory_usage}%</span>
                      </div>
                    )}
                    {radar.uptime && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{Math.floor(radar.uptime / 3600)}h</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="pt-2 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-xs">
                    <Settings className="h-3.5 w-3.5 mr-1" />
                    {t('radars.configure', 'Configurer')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Info Section */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2">{t('radars.howItWorks', 'Comment ça marche')}</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• {t('radars.info1', 'Les radars Vayyar envoient leurs données via le protocole MQTT')}</li>
            <li>• {t('radars.info2', 'Les nouveaux appareils sont automatiquement détectés et enregistrés')}</li>
            <li>• {t('radars.info3', 'Les événements de chute sont créés en temps réel et diffusés via WebSocket')}</li>
            <li>• {t('radars.info4', 'Vous pouvez associer manuellement un device ID à un capteur existant')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default RadarsPage;
