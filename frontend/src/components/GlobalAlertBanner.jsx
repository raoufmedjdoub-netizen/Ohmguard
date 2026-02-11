/**
 * GlobalAlertBanner - Fixed alert banner visible on ALL pages
 * Displays all active (unacknowledged) fall/critical + AI camera alerts with action dialogs.
 * Can be disabled per user via Settings.
 */
import React, { useState } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import { useNavigate } from 'react-router-dom';
import { EventActionDialog } from '@/components/EventActionDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  X,
  MapPin,
  Clock,
  UserPlus,
  Camera,
  Video
} from 'lucide-react';

const EVENT_CONFIG = {
  FALL: { label: 'CHUTE', bg: 'bg-red-600', pulse: 'animate-pulse' },
  SENSITIVE_FALL: { label: 'CHUTE SUSPECTE', bg: 'bg-orange-600', pulse: 'animate-pulse' },
  BED_EXIT: { label: 'SORTIE DE LIT', bg: 'bg-amber-600', pulse: '' },
  AI_ALERT: { label: 'ALERTE IA', bg: 'bg-violet-600', pulse: 'animate-pulse' },
};

const AI_WARNING_LABELS = {
  Fall_Detected: 'Chute (IA)',
  Violence: 'Violence',
  Fire: 'Feu',
  Smoke: 'Fumee',
  Intrusion: 'Intrusion',
};

const FALL_STATUS_LABELS = {
  fall_detected: 'Detectee',
  fall_confirmed: 'Confirmee',
  calling: 'Appel en cours',
  on_call: 'En communication',
  finished: 'Termine',
  fall_exit: 'Sortie de chute',
  canceled: 'Annule',
};

function ElapsedTime({ since }) {
  const [elapsed, setElapsed] = React.useState('');
  React.useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - since) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span className="font-mono text-sm">{elapsed}</span>;
}

function AlertRow({ alert, onAction, onView, onDismiss }) {
  const isAI = alert.alertSource === 'ai_camera';
  const config = isAI ? EVENT_CONFIG.AI_ALERT : (EVENT_CONFIG[alert.type] || EVENT_CONFIG.FALL);
  const isAcked = alert.status === 'ACK' || alert.status === 'ACKNOWLEDGED';

  // Location: radar uses location_path, AI uses channel_name or location_path
  const location = isAI
    ? (alert.location_path || alert.channel_name || 'Camera IA')
    : (alert.location_path || alert.sensor_name || alert.radar_name || 'Localisation inconnue');

  const fallStatus = alert.fall_status ? FALL_STATUS_LABELS[alert.fall_status] || alert.fall_status : null;
  const aiLabel = isAI ? (AI_WARNING_LABELS[alert.warning_type] || alert.warning_type) : null;
  const confidence = isAI && alert.confidence ? `${Math.round(alert.confidence * 100)}%` : null;

  return (
    <div
      data-testid={`alert-row-${alert.id}`}
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-white transition-all',
        isAcked ? 'bg-gray-700 opacity-80' : config.bg,
        !isAcked && config.pulse
      )}
    >
      {isAI ? <Camera className="h-5 w-5 flex-shrink-0" /> : <AlertTriangle className="h-5 w-5 flex-shrink-0" />}
      <Badge className="bg-white/20 text-white text-xs font-bold">{aiLabel || config.label}</Badge>
      {fallStatus && <Badge className="bg-black/20 text-white text-xs">{fallStatus}</Badge>}
      {confidence && <Badge className="bg-white/10 text-white text-xs">{confidence}</Badge>}
      {alert.is_simulated && <Badge className="bg-yellow-400/30 text-yellow-100 text-xs">TEST</Badge>}
      {alert.assigned_to_name && (
        <Badge className="bg-purple-400/30 text-purple-100 text-xs">{alert.assigned_to_name}</Badge>
      )}

      <div className="flex items-center gap-1 min-w-0 flex-1">
        <MapPin className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
        <span className="text-sm font-medium truncate">{location}</span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-80">
        <Clock className="h-3.5 w-3.5" />
        <ElapsedTime since={alert.addedAt || Date.now()} />
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!isAcked && (
          <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onAction(alert, 'ACK')}>
            Acquitter
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onAction(alert, 'RESOLVED')}>
          <CheckCircle className="h-3.5 w-3.5 mr-1" />
          Resoudre
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onAction(alert, 'FALSE_ALARM')}>
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Faux
        </Button>
        {!isAI && (
          <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onAction(alert, 'ASSIGN')}>
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAI && alert.video_url && (
          <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => window.open(alert.video_url, '_blank')}>
            <Video className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => onView(alert)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => onDismiss(alert.id)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function GlobalAlertBanner() {
  const { activeAlerts, soundEnabled, setSoundEnabled, bannerEnabled, updateAlert, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState('ACK');
  const [dialogEvent, setDialogEvent] = useState(null);

  const handleAction = (alert, action) => {
    // For AI events, handle ACK/RESOLVED/FALSE_ALARM directly (no dialog needed for simple actions)
    if (alert.alertSource === 'ai_camera' && action !== 'ASSIGN') {
      setDialogEvent(alert);
      setDialogAction(action);
      setDialogOpen(true);
      return;
    }
    setDialogEvent(alert);
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleActionSuccess = (updatedEvent) => {
    if (!updatedEvent) return;
    if (updatedEvent.status === 'RESOLVED' || updatedEvent.status === 'FALSE_ALARM') {
      dismissAlert(updatedEvent.id);
    } else {
      updateAlert(updatedEvent.id, updatedEvent);
    }
  };

  // Don't render if banner is disabled by user or no alerts
  if (!bannerEnabled || activeAlerts.length === 0) return null;

  const alertCount = activeAlerts.length;
  const unackedCount = activeAlerts.filter(a => a.status !== 'ACK' && a.status !== 'ACKNOWLEDGED').length;
  const aiCount = activeAlerts.filter(a => a.alertSource === 'ai_camera').length;

  const handleView = (alert) => {
    if (alert.alertSource === 'ai_camera') {
      navigate('/ai-sensors');
    } else {
      navigate(`/events/${alert.id}`);
    }
  };

  return (
    <>
      <div data-testid="global-alert-banner" className="sticky top-14 z-30 shadow-2xl">
        <div className="bg-red-900 text-white px-4 py-1.5 flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            <span className="font-bold">
              {alertCount} alerte{alertCount > 1 ? 's' : ''} active{alertCount > 1 ? 's' : ''}
            </span>
            {unackedCount > 0 && (
              <Badge className="bg-white text-red-900 text-xs">{unackedCount} non acquittee{unackedCount > 1 ? 's' : ''}</Badge>
            )}
            {aiCount > 0 && (
              <Badge className="bg-violet-400/30 text-white text-xs">
                <Camera className="h-3 w-3 mr-1" />
                {aiCount} IA
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => setSoundEnabled(!soundEnabled)} data-testid="toggle-sound-btn">
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => setCollapsed(!collapsed)} data-testid="toggle-collapse-btn">
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="max-h-48 overflow-y-auto divide-y divide-white/10">
            {activeAlerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onAction={handleAction}
                onView={handleView}
                onDismiss={dismissAlert}
              />
            ))}
          </div>
        )}
      </div>

      <EventActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={dialogEvent?.id}
        action={dialogAction}
        eventInfo={dialogEvent ? {
          type: dialogEvent.alertSource === 'ai_camera' ? (AI_WARNING_LABELS[dialogEvent.warning_type] || dialogEvent.warning_type) : dialogEvent.type,
          location: dialogEvent.location_path || dialogEvent.channel_name || dialogEvent.radar_name || 'Localisation inconnue',
          sensor: dialogEvent.alertSource === 'ai_camera' ? dialogEvent.channel_name : dialogEvent.radar_name,
          isAI: dialogEvent.alertSource === 'ai_camera'
        } : null}
        onSuccess={handleActionSuccess}
      />
    </>
  );
}
