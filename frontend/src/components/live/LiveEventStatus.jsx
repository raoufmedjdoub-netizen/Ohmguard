/**
 * LiveEventStatus - Affiche l'état temps réel d'un événement
 * États: Actif | En attente | Acquitté | Résolu | Radar hors ligne
 */
import React, { memo, useState, useEffect } from 'react';
import { 
  Circle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Wifi, 
  WifiOff,
  AlertCircle,
  Activity
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Calcul du temps écoulé depuis la dernière mise à jour
const getTimeAgo = (timestamp, locale = 'fr') => {
  if (!timestamp) return null;
  
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 5) return 'à l\'instant';
  if (seconds < 60) return `il y a ${seconds}s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)}h`;
  return `il y a ${Math.floor(seconds / 86400)}j`;
};

// Configuration des états temps réel
const REALTIME_STATES = {
  ACTIVE: {
    icon: Activity,
    label: 'Actif',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    dot: '🟢',
    description: 'Événement en cours de traitement'
  },
  PENDING: {
    icon: Clock,
    label: 'En attente',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    dot: '🟡',
    description: 'En attente d\'action'
  },
  ACKNOWLEDGED: {
    icon: CheckCircle2,
    label: 'Acquitté',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    dot: '🔵',
    description: 'Pris en charge par un opérateur'
  },
  RESOLVED: {
    icon: CheckCircle2,
    label: 'Résolu',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    dot: '⚪',
    description: 'Événement traité et clos'
  },
  FALSE_ALARM: {
    icon: XCircle,
    label: 'Fausse alerte',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    dot: '⚪',
    description: 'Marqué comme fausse alerte'
  },
  OFFLINE: {
    icon: WifiOff,
    label: 'Radar hors ligne',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    dot: '🔴',
    description: 'Le radar ne répond plus'
  }
};

// Determine l'état à afficher en fonction des données
const getDisplayState = (status, realtime) => {
  // Priorité 1: Radar hors ligne
  if (realtime?.deviceOnline === false) {
    return 'OFFLINE';
  }
  
  // Priorité 2: Événement actif
  if (realtime?.isActive && status !== 'RESOLVED' && status !== 'FALSE_ALARM') {
    return 'ACTIVE';
  }
  
  // Priorité 3: Statut de l'événement
  switch (status?.toUpperCase()) {
    case 'ACK':
    case 'ACKNOWLEDGED':
      return 'ACKNOWLEDGED';
    case 'RESOLVED':
      return 'RESOLVED';
    case 'FALSE_ALARM':
      return 'FALSE_ALARM';
    case 'NEW':
    default:
      return 'PENDING';
  }
};

export const LiveEventStatus = memo(function LiveEventStatus({ 
  status, 
  realtime,
  lastUpdate,
  showTimestamp = true,
  compact = false,
  className 
}) {
  const [timeAgo, setTimeAgo] = useState(getTimeAgo(lastUpdate || realtime?.lastUpdateTs));
  const [isStale, setIsStale] = useState(false);
  
  // Mise à jour du temps écoulé toutes les 10 secondes
  useEffect(() => {
    const updateTime = () => {
      const ts = lastUpdate || realtime?.lastUpdateTs;
      setTimeAgo(getTimeAgo(ts));
      
      // Marquer comme "stale" si > 60s sans mise à jour
      if (ts) {
        const seconds = Math.floor((new Date() - new Date(ts)) / 1000);
        setIsStale(seconds > 60);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [lastUpdate, realtime?.lastUpdateTs]);
  
  const displayState = getDisplayState(status, realtime);
  const stateConfig = REALTIME_STATES[displayState];
  const StateIcon = stateConfig.icon;
  
  // Mode compact
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
              stateConfig.bgColor,
              stateConfig.color,
              className
            )}>
              <StateIcon className="h-3 w-3" />
              <span>{stateConfig.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{stateConfig.description}</p>
            {timeAgo && <p className="text-xs text-muted-foreground mt-1">Dernière activité: {timeAgo}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* État principal */}
      <div className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-md border",
        stateConfig.bgColor,
        stateConfig.borderColor
      )}>
        <StateIcon className={cn("h-4 w-4", stateConfig.color)} />
        <span className={cn("text-xs font-medium", stateConfig.color)}>
          {stateConfig.label}
        </span>
        
        {/* Indicateur visuel de connexion */}
        {realtime?.deviceOnline !== undefined && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="ml-auto">
                  {realtime.deviceOnline ? (
                    <Wifi className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  Radar {realtime.deviceOnline ? 'en ligne' : 'hors ligne'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      {/* Timestamp */}
      {showTimestamp && timeAgo && (
        <div className={cn(
          "flex items-center gap-1.5 text-xs",
          isStale ? "text-amber-500" : "text-muted-foreground"
        )}>
          <Clock className="h-3 w-3" />
          <span>
            {isStale ? "Dernière activité:" : "Mise à jour:"} {timeAgo}
          </span>
          {isStale && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Pas de mise à jour depuis plus d'une minute</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
});

export default LiveEventStatus;
