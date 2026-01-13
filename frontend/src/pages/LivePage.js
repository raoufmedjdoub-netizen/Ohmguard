import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsAPI, sitesAPI } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatRelativeTime, getEventTypeColor, getSeverityColor, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Radio,
  AlertTriangle,
  RefreshCw,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Volume2
} from 'lucide-react';

export function LivePage() {
  const { t, i18n } = useTranslation();
  const { subscribe, connected } = useWebSocket();
  const [events, setEvents] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, sitesRes] = await Promise.all([
        eventsAPI.list({ limit: 50, status: selectedStatus !== 'all' ? selectedStatus : undefined }),
        sitesAPI.list()
      ]);
      setEvents(eventsRes.data);
      setSites(sitesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = subscribe('live', (message) => {
      if (message.type === 'new_event') {
        setEvents(prev => [message.event, ...prev.slice(0, 49)]);
        
        if (soundEnabled && message.event.type === 'FALL') {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('FallGuard Alert', {
              body: `${message.event.type} detected - ${message.event.severity}`,
              icon: '/favicon.ico'
            });
          }
        }
        
        toast.warning(t('events.event_created'), {
          description: `${message.event.type} - ${message.event.severity}`
        });
      } else if (message.type === 'event_updated') {
        setEvents(prev => prev.map(e => 
          e.id === message.event_id ? { ...e, ...message.update } : e
        ));
      }
    });
    return unsubscribe;
  }, [subscribe, soundEnabled, t]);

  const handleUpdateStatus = async (eventId, newStatus) => {
    try {
      await eventsAPI.update(eventId, { status: newStatus });
      setEvents(prev => prev.map(e => 
        e.id === eventId ? { ...e, status: newStatus } : e
      ));
      toast.success(t('events.event_updated'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const filteredEvents = events.filter(event => {
    if (selectedSite !== 'all' && event.site_id !== selectedSite) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="live-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="h-6 w-6 text-primary" />
            {connected && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </span>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('events.live_title')}</h1>
            <p className="text-muted-foreground">
              {filteredEvents.length} {t('events.title').toLowerCase()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={soundEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="sound-toggle"
          >
            <Volume2 className={cn('h-4 w-4', !soundEnabled && 'opacity-50')} />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-btn">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('filter')}:</span>
            </div>
            
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="w-48" data-testid="site-filter">
                <SelectValue placeholder={t('events.site')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')} {t('sites.title')}</SelectItem>
                {sites.map(site => (
                  <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setLoading(true); }}>
              <SelectTrigger className="w-40" data-testid="status-filter">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="NEW">{t('events.status_new')}</SelectItem>
                <SelectItem value="ACK">{t('events.status_ack')}</SelectItem>
                <SelectItem value="RESOLVED">{t('events.status_resolved')}</SelectItem>
                <SelectItem value="FALSE_ALARM">{t('events.status_false_alarm')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      <Card className="scanlines">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              {t('events.title')}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-destructive/10 text-destructive">
                NEW: {events.filter(e => e.status === 'NEW').length}
              </span>
              <span className="px-2 py-1 rounded bg-warning/10 text-warning">
                ACK: {events.filter(e => e.status === 'ACK').length}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('events.no_events')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={cn(
                    'p-4 flex items-center justify-between hover:bg-accent/30 transition-colors',
                    index === 0 && 'animate-slide-in-right',
                    event.status === 'NEW' && event.severity === 'HIGH' && 'bg-destructive/5'
                  )}
                  data-testid={`live-event-${event.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      <Badge className={cn('font-mono', getEventTypeColor(event.type))}>
                        {t(`events.type_${event.type.toLowerCase()}`)}
                      </Badge>
                      <Badge variant="outline" className={cn('mt-1', getSeverityColor(event.severity))}>
                        {t(`events.severity_${event.severity.toLowerCase()}`)}
                      </Badge>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {event.sensor_id?.substring(0, 8)}...
                        </span>
                        <Badge variant="outline" className={cn('border', getStatusColor(event.status))}>
                          {t(`events.status_${event.status.toLowerCase()}`)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('events.confidence')}: {(event.confidence * 100).toFixed(0)}%
                        <span className="mx-2">•</span>
                        {formatRelativeTime(event.timestamp, i18n.language)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {event.status === 'NEW' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(event.id, 'ACK')}
                        data-testid={`ack-btn-${event.id}`}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        {t('events.acknowledge')}
                      </Button>
                    )}
                    {(event.status === 'NEW' || event.status === 'ACK') && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUpdateStatus(event.id, 'RESOLVED')}
                          data-testid={`resolve-btn-${event.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('events.resolve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdateStatus(event.id, 'FALSE_ALARM')}
                          data-testid={`false-alarm-btn-${event.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t('events.mark_false_alarm')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
