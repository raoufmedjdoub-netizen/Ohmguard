import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsAPI, sensorsAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Send,
  Radio,
  RefreshCw,
  User,
  MapPin,
  Target,
  Code,
  CheckCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';

// Default payload template
const DEFAULT_PAYLOAD = {
  payload: {
    presenceDetected: false,
    presenceRegionMap: {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0
    },
    presenceTargetType: 0,
    roomPresenceIndication: 0,
    timestamp: Date.now(),
    trackerTargets: []
  },
  type: 4
};

export function PresenceSimulatorPage() {
  const { t } = useTranslation();
  const [sensors, setSensors] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  
  // Form state
  const [presenceDetected, setPresenceDetected] = useState(false);
  const [eventType, setEventType] = useState(4);
  const [activeRegions, setActiveRegions] = useState([]);
  const [targetCount, setTargetCount] = useState(0);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonPayload, setJsonPayload] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));

  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const response = await sensorsAPI.list();
        setSensors(response.data);
        if (response.data.length > 0) {
          setSelectedSensor(response.data[0].device_id || response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch sensors:', error);
        toast.error('Error loading sensors');
      } finally {
        setLoading(false);
      }
    };
    fetchSensors();
  }, []);

  // Update JSON when form changes
  useEffect(() => {
    const payload = {
      payload: {
        presenceDetected,
        presenceRegionMap: Object.fromEntries(
          [0, 1, 2, 3, 4, 5].map(i => [String(i), activeRegions.includes(i) ? 1 : 0])
        ),
        presenceTargetType: presenceDetected ? 1 : 0,
        roomPresenceIndication: presenceDetected ? 1 : 0,
        timestamp: Date.now(),
        trackerTargets: Array.from({ length: targetCount }, (_, i) => ({
          id: i + 1,
          xPosCm: Math.floor(Math.random() * 200) - 100,
          yPosCm: Math.floor(Math.random() * 200) + 50,
          zPosCm: Math.floor(Math.random() * 150) + 30,
          posture: presenceDetected ? 0 : 2,
          amplitude: Math.floor(Math.random() * 50) + 50
        }))
      },
      type: eventType
    };
    setJsonPayload(JSON.stringify(payload, null, 2));
  }, [presenceDetected, activeRegions, targetCount, eventType]);

  const toggleRegion = (regionId) => {
    setActiveRegions(prev => 
      prev.includes(regionId) 
        ? prev.filter(r => r !== regionId)
        : [...prev, regionId]
    );
  };

  const handleSend = async () => {
    if (!selectedSensor) {
      toast.error('Please select a sensor');
      return;
    }

    setSending(true);
    try {
      const payload = JSON.parse(jsonPayload);
      payload.deviceId = selectedSensor;
      
      const response = await eventsAPI.createRadarEvent(payload);
      setLastResult(response.data);
      toast.success('Event sent successfully!', {
        description: `Type: ${response.data.eventType}, Presence: ${response.data.presenceDetected ? 'Yes' : 'No'}`
      });
    } catch (error) {
      console.error('Failed to send event:', error);
      toast.error('Failed to send event', {
        description: error.response?.data?.detail || error.message
      });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setPresenceDetected(false);
    setEventType(4);
    setActiveRegions([]);
    setTargetCount(0);
    setJsonPayload(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
    setLastResult(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="presence-simulator-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Simulateur de Présence</h1>
            <p className="text-muted-foreground">
              Testez l'envoi d'événements radar pour vérifier l'affichage
            </p>
          </div>
        </div>
        
        <Button variant="outline" onClick={resetForm} data-testid="reset-btn">
          <RefreshCw className="h-4 w-4 mr-2" />
          Réinitialiser
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Configuration de l'événement
            </CardTitle>
            <CardDescription>
              Configurez les paramètres de l'événement de présence à envoyer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sensor Selection */}
            <div className="space-y-2">
              <Label>Radar cible</Label>
              <Select value={selectedSensor} onValueChange={setSelectedSensor}>
                <SelectTrigger data-testid="sensor-select">
                  <SelectValue placeholder="Sélectionner un radar" />
                </SelectTrigger>
                <SelectContent>
                  {sensors.map(sensor => (
                    <SelectItem key={sensor.id} value={sensor.device_id || sensor.id}>
                      {sensor.name} ({sensor.device_id || sensor.serial_product || sensor.id.substring(0, 8)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label>Type d'événement (code Vayyar)</Label>
              <Select value={String(eventType)} onValueChange={(v) => setEventType(parseInt(v))}>
                <SelectTrigger data-testid="event-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - FALL (Chute)</SelectItem>
                  <SelectItem value="2">2 - PRE_FALL (Pré-chute)</SelectItem>
                  <SelectItem value="3">3 - INACTIVITY (Inactivité)</SelectItem>
                  <SelectItem value="4">4 - PRESENCE (Présence)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Presence Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-accent/30">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Présence détectée</p>
                  <p className="text-sm text-muted-foreground">
                    {presenceDetected ? 'Une personne est présente' : 'Aucune présence'}
                  </p>
                </div>
              </div>
              <Switch
                checked={presenceDetected}
                onCheckedChange={setPresenceDetected}
                data-testid="presence-toggle"
              />
            </div>

            {/* Active Regions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Zones actives (presenceRegionMap)
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5].map(region => (
                  <Button
                    key={region}
                    variant={activeRegions.includes(region) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleRegion(region)}
                    data-testid={`region-${region}`}
                  >
                    {region}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Régions actives: {activeRegions.length > 0 ? activeRegions.join(', ') : 'Aucune'}
              </p>
            </div>

            {/* Target Count */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Nombre de cibles (trackerTargets)
              </Label>
              <Slider
                value={[targetCount]}
                onValueChange={([v]) => setTargetCount(v)}
                max={5}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                {targetCount} cible{targetCount !== 1 ? 's' : ''} détectée{targetCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* JSON Editor Toggle */}
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Mode JSON avancé
              </Label>
              <Switch
                checked={showJsonEditor}
                onCheckedChange={setShowJsonEditor}
                data-testid="json-toggle"
              />
            </div>

            {/* Send Button */}
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleSend}
              disabled={sending || !selectedSensor}
              data-testid="send-btn"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Send className="h-5 w-5 mr-2" />
              )}
              Envoyer l'événement
            </Button>
          </CardContent>
        </Card>

        {/* JSON Preview / Editor Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {showJsonEditor ? 'Éditeur JSON' : 'Aperçu du Payload'}
              </CardTitle>
              <CardDescription>
                {showJsonEditor 
                  ? 'Modifiez directement le payload JSON' 
                  : 'Payload qui sera envoyé à POST /api/events/radar'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showJsonEditor ? (
                <textarea
                  value={jsonPayload}
                  onChange={(e) => setJsonPayload(e.target.value)}
                  className="w-full h-80 font-mono text-sm p-4 rounded-lg bg-muted/50 border resize-none"
                  data-testid="json-editor"
                />
              ) : (
                <pre className="p-4 rounded-lg bg-muted/50 overflow-x-auto text-sm font-mono h-80 overflow-y-auto">
                  {jsonPayload}
                </pre>
              )}
            </CardContent>
          </Card>

          {/* Last Result Card */}
          {lastResult && (
            <Card className="border-success/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  Résultat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Event ID:</span>
                    <span className="font-mono text-xs">{lastResult.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge>{lastResult.eventType}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Présence:</span>
                    <Badge variant={lastResult.presenceDetected ? 'default' : 'outline'}>
                      {lastResult.presenceDetected ? 'Détectée' : 'Non détectée'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Zones actives:</span>
                    <span>{lastResult.activeRegionsDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cibles:</span>
                    <span>{lastResult.targetCountDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sévérité:</span>
                    <Badge variant="outline">{lastResult.severity}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Comment utiliser le simulateur</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>Sélectionnez un radar cible (le deviceId sera utilisé pour l'identification)</li>
                <li>Configurez les paramètres de présence via le formulaire ou l'éditeur JSON</li>
                <li>Cliquez sur "Envoyer" pour créer l'événement via POST /api/events/radar</li>
                <li>L'événement apparaîtra instantanément dans la page "En direct"</li>
                <li>Les données sont normalisées selon le modèle RadarEvent</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PresenceSimulatorPage;
