import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sensorsAPI, simulatorAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import {
  Play,
  Zap,
  Loader2,
  AlertTriangle
} from 'lucide-react';

export function SimulatorPage() {
  const { t } = useTranslation();
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  const [selectedSensor, setSelectedSensor] = useState('');
  const [eventType, setEventType] = useState('FALL');
  const [severity, setSeverity] = useState('HIGH');
  const [confidence, setConfidence] = useState([0.95]);

  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const response = await sensorsAPI.list({});
        setSensors(response.data);
        if (response.data.length > 0) {
          setSelectedSensor(response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch sensors:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSensors();
  }, []);

  const handleGenerateEvent = async () => {
    if (!selectedSensor) {
      toast.error('Please select a sensor');
      return;
    }
    
    setGenerating(true);
    try {
      await simulatorAPI.createEvent(selectedSensor, eventType, severity, confidence[0]);
      toast.success(t('simulator.event_generated'));
    } catch (error) {
      console.error('Failed to generate event:', error);
      toast.error(t('errors.generic'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="simulator-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Play className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('simulator.title')}</h1>
          <p className="text-muted-foreground">{t('simulator.description')}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Event Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('simulator.select_sensor')}</Label>
              <Select value={selectedSensor} onValueChange={setSelectedSensor}>
                <SelectTrigger data-testid="simulator-sensor-select">
                  <SelectValue placeholder={t('simulator.select_sensor')} />
                </SelectTrigger>
                <SelectContent>
                  {sensors.map(sensor => (
                    <SelectItem key={sensor.id} value={sensor.id}>
                      {sensor.name} ({sensor.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t('simulator.select_type')}</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger data-testid="simulator-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FALL">{t('events.type_fall')}</SelectItem>
                  <SelectItem value="PRE_FALL">{t('events.type_pre_fall')}</SelectItem>
                  <SelectItem value="UNKNOWN">{t('events.type_unknown')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t('simulator.select_severity')}</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger data-testid="simulator-severity-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">{t('events.severity_high')}</SelectItem>
                  <SelectItem value="MED">{t('events.severity_med')}</SelectItem>
                  <SelectItem value="LOW">{t('events.severity_low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('simulator.confidence_level')}</Label>
                <span className="font-mono text-sm">{(confidence[0] * 100).toFixed(0)}%</span>
              </div>
              <Slider
                value={confidence}
                onValueChange={setConfidence}
                min={0.5}
                max={1}
                step={0.01}
                data-testid="simulator-confidence-slider"
              />
            </div>
            
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleGenerateEvent}
              disabled={generating || !selectedSensor}
              data-testid="generate-event-btn"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {t('simulator.generate')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle>Event Preview</CardTitle>
            <CardDescription>This is what will be generated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 font-mono text-sm">
              <div className="p-4 rounded-lg bg-background border">
                <pre className="whitespace-pre-wrap text-xs">
{JSON.stringify({
  sensor_id: selectedSensor?.substring(0, 20) + '...',
  type: eventType,
  severity: severity,
  confidence: confidence[0],
  timestamp: new Date().toISOString(),
  status: 'NEW'
}, null, 2)}
                </pre>
              </div>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Event will be broadcast via WebSocket to all connected clients</p>
                <p>• Alert rules will be triggered based on configuration</p>
                <p>• Notification logs will be created</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
