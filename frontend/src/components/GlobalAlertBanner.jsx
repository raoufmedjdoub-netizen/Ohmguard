/**
 * GlobalAlertBanner - Fixed alert banner visible on ALL pages
 * Displays all active (unacknowledged) fall/critical alerts.
 */
import React, { useState, useEffect } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import { useNavigate } from 'react-router-dom';
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
  BedDouble
} from 'lucide-react';

const EVENT_CONFIG = {
  FALL: { label: 'CHUTE', bg: 'bg-red-600', border: 'border-red-700', pulse: 'animate-pulse' },
  SENSITIVE_FALL: { label: 'CHUTE SUSPECTE', bg: 'bg-orange-600', border: 'border-orange-700', pulse: 'animate-pulse' },
  BED_EXIT: { label: 'SORTIE DE LIT', bg: 'bg-amber-600', border: 'border-amber-700', pulse: '' },
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
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
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

function AlertRow({ alert, onAck, onResolve, onFalseAlarm, onView, onDismiss }) {
  const config = EVENT_CONFIG[alert.type] || EVENT_CONFIG.FALL;
  const isAcked = alert.status === 'ACK';
  const location = alert.location_path || alert.sensor_name || alert.radar_name || 'Localisation inconnue';
  const fallStatus = alert.fall_status ? FALL_STATUS_LABELS[alert.fall_status] || alert.fall_status : null;

  return (
    <div
      data-testid={`alert-row-${alert.id}`}
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-white transition-all',
        isAcked ? 'bg-gray-700 opacity-80' : config.bg,
        !isAcked && config.pulse
      )}
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0" />

      <Badge className="bg-white/20 text-white text-xs font-bold">{config.label}</Badge>

      {fallStatus && (
        <Badge className="bg-black/20 text-white text-xs">{fallStatus}</Badge>
      )}

      {alert.is_simulated && (
        <Badge className="bg-yellow-400/30 text-yellow-100 text-xs">TEST</Badge>
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
          <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onAck(alert.id)}>
            Acquitter
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onResolve(alert.id)}>
          <CheckCircle className="h-3.5 w-3.5 mr-1" />
          Resoudre
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20 text-xs" onClick={() => onFalseAlarm(alert.id)}>
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Faux
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => onView(alert.id)}>
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
  const { activeAlerts, soundEnabled, setSoundEnabled, acknowledgeAlert, resolveAlert, markFalseAlarm, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (activeAlerts.length === 0) return null;

  const alertCount = activeAlerts.length;
  const unackedCount = activeAlerts.filter(a => a.status !== 'ACK').length;

  return (
    <div data-testid="global-alert-banner" className="fixed top-14 left-0 right-0 z-40 shadow-2xl">
      {/* Summary bar */}
      <div className="bg-red-900 text-white px-4 py-1.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 animate-pulse" />
          <span className="font-bold">
            {alertCount} alerte{alertCount > 1 ? 's' : ''} active{alertCount > 1 ? 's' : ''}
          </span>
          {unackedCount > 0 && (
            <Badge className="bg-white text-red-900 text-xs">{unackedCount} non acquittee{unackedCount > 1 ? 's' : ''}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-white hover:bg-white/20"
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="toggle-sound-btn"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-white hover:bg-white/20"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="toggle-collapse-btn"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Alert rows */}
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto divide-y divide-white/10">
          {activeAlerts.map(alert => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAck={acknowledgeAlert}
              onResolve={resolveAlert}
              onFalseAlarm={markFalseAlarm}
              onView={(id) => navigate(`/events/${id}`)}
              onDismiss={dismissAlert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
