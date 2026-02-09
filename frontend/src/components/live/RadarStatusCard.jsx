/**
 * RadarStatusCard - Carte compacte de statut radar
 * 
 * Affichage minimaliste:
 * ┌────────────────────┐
 * │ ● VC0001           │
 * │   Online | Présence│
 * │   Il y a 2 min     │
 * └────────────────────┘
 */
import React, { memo } from 'react';
import { cn } from '@/lib/utils';

// Types d'événements avec couleurs
const EVENT_TYPE_CONFIG = {
  FALL: { label: 'Chute', color: 'text-red-600' },
  SENSITIVE_FALL: { label: 'Chute suspectée', color: 'text-red-500' },
  PRE_FALL: { label: 'Pré-chute', color: 'text-orange-600' },
  BED_EXIT: { label: 'Sortie de lit', color: 'text-purple-600' },
  PRESENCE: { label: 'Présence', color: 'text-emerald-600' },
  INACTIVITY: { label: 'Inactivité', color: 'text-amber-600' },
  UNKNOWN: { label: 'Inconnu', color: 'text-slate-500' }
};

// Formater le temps relatif
function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  return `${diffDay}j`;
}

export const RadarStatusCard = memo(function RadarStatusCard({
  radarName,
  isOnline = true,
  eventType = 'PRESENCE',
  presenceActive = false,
  lastEventTime = null,
  isNew = false
}) {
  const typeConfig = EVENT_TYPE_CONFIG[eventType?.toUpperCase()] || EVENT_TYPE_CONFIG.UNKNOWN;
  const relativeTime = formatRelativeTime(lastEventTime);
  
  return (
    <div
      className={cn(
        "p-2 rounded-md shadow-sm border transition-all duration-300",
        // Fond bleu clair si présence active
        presenceActive 
          ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" 
          : "bg-white dark:bg-slate-900 border-border",
        isNew && "animate-pulse ring-2 ring-blue-400"
      )}
      role="status"
      aria-label={`Radar ${radarName} ${isOnline ? 'en ligne' : 'hors ligne'}${presenceActive ? ', présence active' : ''}`}
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
        <span className={cn(
          "font-medium text-sm truncate",
          presenceActive && "text-blue-700 dark:text-blue-300"
        )}>
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
        <span className={cn("text-xs", presenceActive ? "text-blue-600 dark:text-blue-400 font-medium" : typeConfig.color)}>
          {typeConfig.label}
        </span>
      </div>
      
      {/* Ligne 3: Timestamp */}
      {relativeTime && (
        <div className="mt-1 ml-4">
          <span className="text-[10px] text-muted-foreground">
            {relativeTime}
          </span>
        </div>
      )}
    </div>
  );
});

export default RadarStatusCard;
