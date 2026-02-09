/**
 * SensorStatusBadge Component
 * Displays online/offline/unknown status with visual indicators
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, HelpCircle, Activity, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STATUS_CONFIG = {
  online: {
    label: 'En ligne',
    color: 'bg-green-500',
    textColor: 'text-green-500',
    borderColor: 'border-green-500',
    bgLight: 'bg-green-500/10',
    icon: Wifi,
    pulse: true
  },
  offline: {
    label: 'Hors ligne',
    color: 'bg-red-500',
    textColor: 'text-red-500',
    borderColor: 'border-red-500',
    bgLight: 'bg-red-500/10',
    icon: WifiOff,
    pulse: false
  },
  unknown: {
    label: 'Inconnu',
    color: 'bg-gray-400',
    textColor: 'text-gray-400',
    borderColor: 'border-gray-400',
    bgLight: 'bg-gray-400/10',
    icon: HelpCircle,
    pulse: false
  }
};

/**
 * Status dot indicator
 */
export function StatusDot({ status = 'unknown', size = 'md', className }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };
  
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn(
        'rounded-full',
        sizeClasses[size],
        config.color
      )} />
      {config.pulse && (
        <span className={cn(
          'absolute inline-flex rounded-full opacity-75 animate-ping',
          sizeClasses[size],
          config.color
        )} />
      )}
    </span>
  );
}

/**
 * Status badge with icon
 */
export function StatusBadge({ status = 'unknown', showIcon = true, size = 'default', className }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = config.icon;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'gap-1.5',
        config.borderColor,
        config.bgLight,
        config.textColor,
        size === 'sm' && 'text-xs px-2 py-0.5',
        className
      )}
    >
      {showIcon && <Icon className={cn('h-3 w-3', size === 'sm' && 'h-2.5 w-2.5')} />}
      {config.label}
    </Badge>
  );
}

/**
 * Sensor status card with full details
 */
export function SensorStatusCard({ 
  sensor,
  showDetails = true,
  onClick,
  className 
}) {
  const status = sensor?.status || 'unknown';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = config.icon;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border transition-all',
              config.borderColor,
              config.bgLight,
              onClick && 'cursor-pointer hover:shadow-md',
              className
            )}
            onClick={onClick}
          >
            {/* Status indicator */}
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full',
              config.bgLight
            )}>
              <Icon className={cn('h-5 w-5', config.textColor)} />
            </div>
            
            {/* Sensor info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">
                  {sensor?.sensor_name || sensor?.sensor_id || 'Capteur'}
                </span>
                <StatusDot status={status} size="sm" />
              </div>
              
              {showDetails && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {sensor?.room_name && (
                    <span>{sensor.room_name}</span>
                  )}
                  {sensor?.space_name && (
                    <span> • {sensor.space_name}</span>
                  )}
                </div>
              )}
            </div>
            
            {/* Last seen */}
            {sensor?.last_seen_ago && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {sensor.last_seen_ago}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{sensor?.sensor_name}</p>
            <p className="text-muted-foreground">
              {sensor?.last_event_type && `Dernier: ${sensor.last_event_type}`}
            </p>
            {sensor?.presence_detected !== undefined && (
              <p className="text-muted-foreground">
                Présence: {sensor.presence_detected ? 'Oui' : 'Non'}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact sensor status row for tables
 */
export function SensorStatusRow({ sensor, className }) {
  const status = sensor?.status || 'unknown';
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusDot status={status} size="sm" />
      <span className="text-sm">
        {sensor?.sensor_name || sensor?.sensor_id}
      </span>
      {sensor?.last_seen_ago && (
        <span className="text-xs text-muted-foreground ml-auto">
          {sensor.last_seen_ago}
        </span>
      )}
    </div>
  );
}

/**
 * Stats summary component
 */
export function StatusStats({ stats, className }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex items-center gap-1.5">
        <StatusDot status="online" size="sm" />
        <span className="text-sm font-medium text-green-600">{stats?.online || 0}</span>
        <span className="text-xs text-muted-foreground">en ligne</span>
      </div>
      <div className="flex items-center gap-1.5">
        <StatusDot status="offline" size="sm" />
        <span className="text-sm font-medium text-red-600">{stats?.offline || 0}</span>
        <span className="text-xs text-muted-foreground">hors ligne</span>
      </div>
      {(stats?.unknown || 0) > 0 && (
        <div className="flex items-center gap-1.5">
          <StatusDot status="unknown" size="sm" />
          <span className="text-sm font-medium text-gray-500">{stats?.unknown || 0}</span>
          <span className="text-xs text-muted-foreground">inconnu</span>
        </div>
      )}
    </div>
  );
}

/**
 * Event type badge
 */
export function EventTypeBadge({ type, severity, className }) {
  const typeConfig = {
    FALL: { label: 'Chute', color: 'bg-red-500 text-white' },
    SENSITIVE_FALL: { label: 'Chute suspectée', color: 'bg-red-400 text-white' },
    PRE_FALL: { label: 'Pré-chute', color: 'bg-orange-500 text-white' },
    BED_EXIT: { label: 'Sortie lit', color: 'bg-purple-500 text-white' },
    PRESENCE: { label: 'Présence', color: 'bg-blue-500 text-white' },
    INACTIVITY: { label: 'Inactivité', color: 'bg-amber-500 text-white' }
  };
  
  const config = typeConfig[type] || { label: type || 'N/A', color: 'bg-gray-400 text-white' };
  
  return (
    <Badge className={cn(config.color, 'text-xs', className)}>
      {config.label}
    </Badge>
  );
}

/**
 * Presence indicator
 */
export function PresenceIndicator({ detected, targetCount, className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Activity className={cn(
        'h-4 w-4',
        detected ? 'text-green-500' : 'text-gray-400'
      )} />
      <span className={cn(
        'text-sm',
        detected ? 'text-green-600' : 'text-gray-500'
      )}>
        {detected ? `${targetCount || 1} personne(s)` : 'Vide'}
      </span>
    </div>
  );
}

export default StatusBadge;
