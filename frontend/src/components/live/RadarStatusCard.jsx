/**
 * RadarStatusCard - Carte compacte de statut radar
 * 
 * Affichage minimaliste:
 * ┌────────────────────┐
 * │ ● VC0001           │
 * │   Online | Présence│
 * └────────────────────┘
 */
import React, { memo } from 'react';
import { cn } from '@/lib/utils';

// Types d'événements avec couleurs
const EVENT_TYPE_CONFIG = {
  FALL: { label: 'Chute', color: 'text-red-600', dot: 'bg-red-500' },
  PRE_FALL: { label: 'Pré-chute', color: 'text-orange-600', dot: 'bg-orange-500' },
  PRESENCE: { label: 'Présence', color: 'text-emerald-600', dot: 'bg-emerald-500' },
  INACTIVITY: { label: 'Inactivité', color: 'text-amber-600', dot: 'bg-amber-500' },
  UNKNOWN: { label: 'Inconnu', color: 'text-slate-500', dot: 'bg-slate-400' }
};

export const RadarStatusCard = memo(function RadarStatusCard({
  radarName,
  isOnline = true,
  eventType = 'PRESENCE',
  isNew = false
}) {
  const typeConfig = EVENT_TYPE_CONFIG[eventType?.toUpperCase()] || EVENT_TYPE_CONFIG.UNKNOWN;
  
  return (
    <div
      className={cn(
        "p-2 rounded-md shadow-sm border",
        "bg-white dark:bg-slate-900",
        "transition-opacity duration-300",
        isNew && "animate-pulse"
      )}
      role="status"
      aria-label={`Radar ${radarName} ${isOnline ? 'en ligne' : 'hors ligne'}`}
      data-testid={`radar-card-${radarName}`}
    >
      {/* Ligne 1: Indicateur + Nom */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            isOnline ? "bg-green-500" : "bg-red-500"
          )}
          aria-hidden="true"
        />
        <span className="font-medium text-sm truncate">
          {radarName || 'N/A'}
        </span>
      </div>
      
      {/* Ligne 2: Statut + Type */}
      <div className="flex items-center gap-1.5 mt-1 ml-4">
        <span className={cn(
          "text-xs",
          isOnline ? "text-green-600 dark:text-green-400" : "text-red-500"
        )}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
        <span className="text-muted-foreground text-xs">|</span>
        <span className={cn("text-xs", typeConfig.color)}>
          {typeConfig.label}
        </span>
      </div>
    </div>
  );
});

export default RadarStatusCard;
