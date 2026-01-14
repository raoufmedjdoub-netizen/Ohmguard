import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  Volume2,
  User,
  MapPin,
  Target,
  Eye,
  Building
} from 'lucide-react';

// Event Card Component for Live Wall
function EventCard({ event, onAcknowledge, onResolve, onFalseAlarm, onViewDetails, t, i18n }) {
  const isPresenceEvent = event.type === 'PRESENCE';
  const presenceDetected = event.presence_detected;
  const activeRegions = event.active_regions || [];
  const targetCount = event.target_count || 0;
  const locationPath = event.location_path;
  
  // Get icon based on event type
  const getEventIcon = (type) => {
    switch (type) {
      case 'FALL': return <AlertTriangle className="h-6 w-6" />;
      case 'PRE_FALL': return <AlertTriangle className="h-6 w-6" />;
      case 'PRESENCE': return <User className="h-6 w-6" />;
      case 'INACTIVITY': return <Clock className="h-6 w-6" />;
      default: return <Radio className="h-6 w-6" />;
    }
  };
  
  // Get presence title
  const getPresenceTitle = () => {
    if (!isPresenceEvent) {
      return t(`events.type_${event.type?.toLowerCase() || 'unknown'}`);
    }
    return presenceDetected ? t('events.presence_detected') : t('events.no_presence');
  };
  
  // Get active regions display
  const getActiveRegionsDisplay = () => {
    if (activeRegions.length === 0) {
      return t('events.no_active_regions');
    }
    return `${t('events.active_regions')}: ${activeRegions.join(', ')}`;
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-all hover:shadow-md',
        event.status === 'NEW' && event.severity === 'HIGH' && 'bg-destructive/5 border-destructive/30',
        event.status === 'NEW' && event.severity !== 'HIGH' && 'bg-accent/30 border-border',
        event.status !== 'NEW' && 'bg-card border-border'
      )}
      data-testid={`live-event-card-${event.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            event.type === 'FALL' ? 'bg-destructive/20 text-destructive' :
            event.type === 'PRE_FALL' ? 'bg-warning/20 text-warning' :
            event.type === 'PRESENCE' && presenceDetected ? 'bg-success/20 text-success' :
            'bg-muted text-muted-foreground'
          )}>
            {getEventIcon(event.type)}
          </div>
          <div>
            <h3 className="font-semibold">{getPresenceTitle()}</h3>
            <p className="text-sm text-muted-foreground">
              {formatRelativeTime(event.timestamp || event.occurred_at, i18n.language)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge className={cn('font-mono', getEventTypeColor(event.type))}>
            {t(`events.type_${event.type?.toLowerCase() || 'unknown'}`)}
          </Badge>
          <Badge variant="outline" className={cn('border', getStatusColor(event.status))}>
            {t(`events.status_${event.status?.toLowerCase()}`)}
          </Badge>
        </div>
      </div>
      
      {/* Location Info */}
      {locationPath && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded bg-primary/5 border border-primary/10">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-primary truncate">{locationPath}</span>
        </div>
      )}
      
      {/* Presence Info Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs">
            {activeRegions.length > 0 
              ? activeRegions.join(', ')
              : t('events.no_active_regions')
            }
          </span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs">
            {targetCount > 0 
              ? `${targetCount} ${t('events.target_count').toLowerCase()}`
              : t('events.no_targets')
            }
          </span>
        </div>
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className={getSeverityColor(event.severity)}>
            {t(`events.severity_${event.severity?.toLowerCase()}`)}
          </Badge>
          <span className="font-mono">{event.device_id?.substring(0, 15) || event.sensor_id?.substring(0, 8)}...</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewDetails(event.id)}
            data-testid={`view-btn-${event.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          
          {event.status === 'NEW' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAcknowledge(event.id)}
              data-testid={`ack-btn-${event.id}`}
            >
              <Clock className="h-4 w-4" />
            </Button>
          )}
          {(event.status === 'NEW' || event.status === 'ACK') && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => onResolve(event.id)}
                data-testid={`resolve-btn-${event.id}`}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onFalseAlarm(event.id)}
                data-testid={`false-alarm-btn-${event.id}`}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function LivePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { subscribe, connected } = useWebSocket();
  const [events, setEvents] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = {
        limit: 50,
        ...(selectedStatus !== 'all' && { status: selectedStatus }),
        ...(selectedType !== 'all' && { event_type: selectedType })
      };
      
      const [eventsRes, sitesRes] = await Promise.all([
        eventsAPI.list(params),
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
  }, [selectedStatus, selectedType, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = subscribe('live', (message) => {
      // Handle both old and new event types
      if (message.type === 'new_event' || message.type === 'new_radar_event') {
        setEvents(prev => [message.event, ...prev.slice(0, 49)]);
        
        // Alert for high severity events
        if (soundEnabled && (message.event.type === 'FALL' || message.event.severity === 'HIGH')) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('OhmGuard Alert', {
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

  const handleViewDetails = (eventId) => {
    navigate(`/events/${eventId}`);
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
            
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setLoading(true); }}>
              <SelectTrigger className="w-40" data-testid="type-filter">
                <SelectValue placeholder={t('events.event_type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="FALL">{t('events.type_fall')}</SelectItem>
                <SelectItem value="PRE_FALL">{t('events.type_pre_fall')}</SelectItem>
                <SelectItem value="PRESENCE">{t('events.type_presence')}</SelectItem>
                <SelectItem value="INACTIVITY">{t('events.type_inactivity')}</SelectItem>
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

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">
              {events.filter(e => e.status === 'NEW').length}
            </div>
            <div className="text-sm text-muted-foreground">{t('events.status_new')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">
              {events.filter(e => e.status === 'ACK').length}
            </div>
            <div className="text-sm text-muted-foreground">{t('events.status_ack')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">
              {events.filter(e => e.type === 'PRESENCE').length}
            </div>
            <div className="text-sm text-muted-foreground">{t('events.type_presence')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">
              {events.filter(e => e.presence_detected).length}
            </div>
            <div className="text-sm text-muted-foreground">{t('events.presence_detected')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Events Grid - Live Wall */}
      <Card className="scanlines">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              {t('events.title')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('events.no_events')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={cn(index === 0 && 'animate-slide-in-right')}
                >
                  <EventCard
                    event={event}
                    onAcknowledge={(id) => handleUpdateStatus(id, 'ACK')}
                    onResolve={(id) => handleUpdateStatus(id, 'RESOLVED')}
                    onFalseAlarm={(id) => handleUpdateStatus(id, 'FALSE_ALARM')}
                    onViewDetails={handleViewDetails}
                    t={t}
                    i18n={i18n}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
