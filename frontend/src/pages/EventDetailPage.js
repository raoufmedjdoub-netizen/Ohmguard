import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventActionDialog } from '@/components/EventActionDialog';
import { cn, formatDate, getEventTypeColor, getSeverityColor, getStatusColor } from '@/lib/utils';
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
  Loader2,
  Crosshair,
  TestTube,
  Phone,
  ArrowDownCircle,
  Ruler,
  MessageSquare,
  UserPlus
} from 'lucide-react';

const FALL_STATUS_CONFIG = {
  fall_detected: { label: 'Chute detectee', color: 'bg-red-600 text-white', icon: AlertTriangle },
  fall_confirmed: { label: 'Chute confirmee', color: 'bg-red-700 text-white', icon: CheckCircle },
  calling: { label: 'Appel en cours', color: 'bg-orange-500 text-white', icon: Phone },
  on_call: { label: 'En communication', color: 'bg-yellow-500 text-black', icon: Phone },
  finished: { label: 'Termine', color: 'bg-green-600 text-white', icon: CheckCircle },
  fall_exit: { label: 'Sortie de chute', color: 'bg-blue-500 text-white', icon: ArrowDownCircle },
  canceled: { label: 'Annule', color: 'bg-gray-500 text-white', icon: XCircle },
};

function FallLocationCard({ event }) {
  const hasLocation = event.fall_loc_x_cm != null || event.fall_loc_y_cm != null || event.fall_loc_z_cm != null;
  if (!hasLocation) return null;

  return (
    <Card data-testid="fall-location-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Crosshair className="h-4 w-4" />
          Localisation de la chute
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'X', value: event.fall_loc_x_cm, unit: 'cm' },
            { label: 'Y', value: event.fall_loc_y_cm, unit: 'cm' },
            { label: 'Z', value: event.fall_loc_z_cm, unit: 'cm' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="text-center p-3 rounded-lg bg-accent/30">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-lg font-mono font-bold">
                {value != null ? `${value} ${unit}` : '-'}
              </div>
            </div>
          ))}
        </div>
        {event.tar_height_est != null && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Ruler className="h-4 w-4" />
            Hauteur estimee: <span className="font-mono font-bold text-foreground">{event.tar_height_est} cm</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FallStatusTimeline({ history }) {
  if (!history || history.length === 0) return null;

  return (
    <Card data-testid="fall-timeline-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Chronologie de la chute
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6 space-y-3">
          <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
          {history.map((entry, idx) => {
            const config = FALL_STATUS_CONFIG[entry.status] || { label: entry.status, color: 'bg-gray-400 text-white', icon: Activity };
            const Icon = config.icon;
            const isLast = idx === history.length - 1;
            return (
              <div key={idx} className="relative flex items-start gap-3" data-testid={`timeline-entry-${idx}`}>
                <div className={cn(
                  'absolute -left-4 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-background',
                  isLast ? config.color : 'bg-muted'
                )}>
                  <Icon className="h-2.5 w-2.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-xs', config.color)}>{config.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {entry.timestamp ? formatDate(entry.timestamp, 'fr-FR') : '-'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const ACTION_LABELS = {
  ACK: { label: 'Acquittement', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  RESOLVED: { label: 'Resolution', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  FALSE_ALARM: { label: 'Fausse alarme', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  ASSIGNED: { label: 'Assignation', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  COMMENT: { label: 'Commentaire', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
};

function CommentsSection({ comments }) {
  if (!comments || comments.length === 0) return null;

  return (
    <Card data-testid="comments-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Historique des actions ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {comments.map((c, idx) => {
            const actionConfig = ACTION_LABELS[c.action] || ACTION_LABELS.COMMENT;
            return (
              <div key={c.id || idx} className="p-3 rounded-lg border border-border/50 bg-muted/20" data-testid={`comment-${idx}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge className={cn('text-xs', actionConfig.color)}>{actionConfig.label}</Badge>
                  <span className="text-xs font-medium">{c.user_name}</span>
                  <span className="text-xs text-muted-foreground">({c.user_role})</span>
                  <span className="text-xs text-muted-foreground ml-auto font-mono">
                    {c.created_at ? formatDate(c.created_at, 'fr-FR') : '-'}
                  </span>
                </div>
                <p className="text-sm">{c.text}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState('ACK');

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

  const handleAction = (action) => {
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleActionSuccess = (updatedEvent) => {
    if (updatedEvent) setEvent(updatedEvent);
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

  const isFallEvent = event.type === 'FALL' && event.fall_status;
  const fallStatusConfig = FALL_STATUS_CONFIG[event.fall_status] || null;

  return (
    <div data-testid="event-detail-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="back-btn">
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
            <Button variant="outline" onClick={() => handleAction('ACK')} data-testid="ack-btn">
              <Clock className="h-4 w-4 mr-2" />
              {t('events.acknowledge')}
            </Button>
          )}
          {(event.status === 'NEW' || event.status === 'ACK') && (
            <>
              <Button onClick={() => handleAction('RESOLVED')} data-testid="resolve-btn">
                <CheckCircle className="h-4 w-4 mr-2" />
                {t('events.resolve')}
              </Button>
              <Button variant="ghost" onClick={() => handleAction('FALSE_ALARM')} data-testid="false-alarm-btn">
                <XCircle className="h-4 w-4 mr-2" />
                {t('events.mark_false_alarm')}
              </Button>
              <Button variant="outline" onClick={() => handleAction('ASSIGN')} data-testid="assign-btn">
                <UserPlus className="h-4 w-4 mr-2" />
                Assigner
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Overview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('events.event_type')}</span>
              <div className="flex gap-2 flex-wrap">
                <Badge className={cn('text-lg px-4 py-1', getEventTypeColor(event.type))}>
                  {t(`events.type_${event.type?.toLowerCase() || 'unknown'}`)}
                </Badge>
                {isFallEvent && fallStatusConfig && (
                  <Badge className={cn('text-lg px-4 py-1', fallStatusConfig.color)} data-testid="fall-status-badge">
                    {fallStatusConfig.label}
                  </Badge>
                )}
                <Badge variant="outline" className={cn('text-lg px-4 py-1 border', getStatusColor(event.status))}>
                  {t(`events.status_${event.status?.toLowerCase()}`)}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Fall-specific info cards */}
            {isFallEvent && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="fall-info-grid">
                {event.is_simulated && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-600">
                      <TestTube className="h-4 w-4" />
                      <span className="text-sm font-medium">Simule</span>
                    </div>
                  </div>
                )}
                {event.is_learning && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">Mode apprentissage</span>
                    </div>
                  </div>
                )}
                {event.is_silent && (
                  <div className="p-3 rounded-lg bg-gray-500/10 border border-gray-500/30">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">Mode silencieux</span>
                    </div>
                  </div>
                )}
                {event.exit_reason && (
                  <div className="p-3 rounded-lg bg-accent/30 col-span-full">
                    <span className="text-xs text-muted-foreground">Raison de sortie: </span>
                    <span className="text-sm font-mono">{event.exit_reason}</span>
                  </div>
                )}
              </div>
            )}

            {/* Generic presence/regions (for non-fall events) */}
            {!isFallEvent && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-accent/30">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{t('events.presence')}</span>
                  </div>
                  <Badge variant="outline" className={cn('text-lg px-4 py-2',
                    event.presence_detected ? 'bg-success/20 text-success border-success/50' : 'bg-muted/50 text-muted-foreground border-muted'
                  )}>
                    {event.presence_detected ? t('events.presence_detected') : t('events.no_presence')}
                  </Badge>
                </div>
                <div className="p-4 rounded-lg bg-accent/30">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{t('events.active_regions')}</span>
                  </div>
                  <div className="text-lg font-mono">
                    {(event.active_regions || []).length > 0
                      ? (event.active_regions || []).join(', ')
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
                    {(event.target_count || 0) > 0
                      ? event.target_count
                      : <span className="text-muted-foreground text-lg">{t('events.no_targets')}</span>
                    }
                  </div>
                </div>
              </div>
            )}

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
                  <p className="font-medium">{event.radar_name || event.sensor_name || 'Unknown Sensor'}</p>
                  <p className="text-sm text-primary font-mono">
                    Device ID: {event.device_id || event.sensor_id?.substring(0, 12)}
                  </p>
                  {event.location_path && (
                    <p className="text-xs text-muted-foreground">{event.location_path}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Fall location */}
          {isFallEvent && <FallLocationCard event={event} />}

          {/* Fall timeline */}
          {isFallEvent && <FallStatusTimeline history={event.fall_status_history} />}

          {/* Quick stats (non-fall) */}
          {!isFallEvent && (
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
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('events.site')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm text-muted-foreground">
                {event.location?.building_name || event.site_id?.substring(0, 12) || '-'}
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
