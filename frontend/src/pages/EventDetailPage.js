import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate, getEventTypeColor, getSeverityColor, getStatusColor, getPresenceStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft,
  User,
  MapPin,
  Clock,
  Activity,
  Target,
  Code,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const response = await eventsAPI.getDetail(eventId);
        setEvent(response.data);
      } catch (error) {
        console.error('Failed to fetch event:', error);
        toast.error(t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [eventId, t]);

  const handleUpdateStatus = async (newStatus) => {
    try {
      await eventsAPI.update(eventId, { status: newStatus });
      setEvent(prev => ({ ...prev, status: newStatus }));
      toast.success(t('events.event_updated'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertTriangle className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">{t('errors.not_found')}</p>
        <Button onClick={() => navigate(-1)}>{t('back')}</Button>
      </div>
    );
  }

  const eventType = event.type?.toLowerCase() || 'unknown';
  const activeRegions = event.active_regions || [];
  const targetCount = event.target_count || 0;
  const presenceDetected = event.presence_detected;

  return (
    <div data-testid="event-detail-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('events.details')}</h1>
            <p className="text-muted-foreground font-mono text-sm">
              {event.id?.substring(0, 12)}...
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {event.status === 'NEW' && (
            <Button
              variant="outline"
              onClick={() => handleUpdateStatus('ACK')}
              data-testid="ack-btn"
            >
              <Clock className="h-4 w-4 mr-2" />
              {t('events.acknowledge')}
            </Button>
          )}
          {(event.status === 'NEW' || event.status === 'ACK') && (
            <>
              <Button
                onClick={() => handleUpdateStatus('RESOLVED')}
                data-testid="resolve-btn"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t('events.resolve')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleUpdateStatus('FALSE_ALARM')}
                data-testid="false-alarm-btn"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {t('events.mark_false_alarm')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Info Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Overview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('events.event_type')}</span>
              <div className="flex gap-2">
                <Badge className={cn('text-lg px-4 py-1', getEventTypeColor(event.type))}>
                  {t(`events.type_${eventType}`)}
                </Badge>
                <Badge variant="outline" className={cn('text-lg px-4 py-1 border', getStatusColor(event.status))}>
                  {t(`events.status_${event.status?.toLowerCase()}`)}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Presence Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-accent/30">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t('events.presence')}</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-lg px-4 py-2',
                    presenceDetected 
                      ? 'bg-success/20 text-success border-success/50' 
                      : 'bg-muted/50 text-muted-foreground border-muted'
                  )}
                >
                  {presenceDetected ? t('events.presence_detected') : t('events.no_presence')}
                </Badge>
              </div>
              
              <div className="p-4 rounded-lg bg-accent/30">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t('events.active_regions')}</span>
                </div>
                <div className="text-lg font-mono">
                  {activeRegions.length > 0 
                    ? activeRegions.join(', ')
                    : <span className="text-muted-foreground">{t('events.no_active_regions')}</span>
                  }
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-accent/30">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t('events.target_count')}</span>
                </div>
                <div className="text-2xl font-bold">
                  {targetCount > 0 
                    ? targetCount 
                    : <span className="text-muted-foreground text-lg">{t('events.no_targets')}</span>
                  }
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('events.occurred_at')}</span>
                </div>
                <span className="font-medium">
                  {formatDate(event.occurred_at || event.timestamp, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('events.severity')}</span>
                </div>
                <Badge variant="outline" className={getSeverityColor(event.severity)}>
                  {t(`events.severity_${event.severity?.toLowerCase()}`)}
                </Badge>
              </div>
            </div>

            {/* Sensor Info */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('events.sensor')}</h3>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{event.sensor_name || 'Unknown Sensor'}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {event.sensor_serial || event.device_id || event.sensor_id?.substring(0, 12)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('events.confidence')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">
                {((event.confidence || 1) * 100).toFixed(0)}%
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('events.site')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm text-muted-foreground">
                {event.site_id?.substring(0, 12) || '-'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('events.zone')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm text-muted-foreground">
                {event.zone_id?.substring(0, 12) || '-'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Raw Payload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            {t('events.raw_payload')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="p-4 rounded-lg bg-muted/50 overflow-x-auto text-sm font-mono">
            {JSON.stringify(event.raw_payload || event, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
