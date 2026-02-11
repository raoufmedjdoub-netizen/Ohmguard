/**
 * LiveEventCard - Carte d'événement temps réel pour le mur de supervision
 * 
 * Structure:
 * ┌──────────────────────────────────────────────────┐
 * │ [ICÔNE + TYPE]                    [BADGE STATUT] │
 * │ Sévérité                                         │
 * ├──────────────────────────────────────────────────┤
 * │ 🏢 Client > Bâtiment                             │
 * │ 📍 Étage • Chambre • Sous-espace                 │
 * │ 📡 Radar: VC0001 • En ligne                      │
 * ├──────────────────────────────────────────────────┤
 * │ État: 🟢 Actif                                   │
 * │ Dernière mise à jour: il y a 12s                 │
 * ├──────────────────────────────────────────────────┤
 * │ [👁 Détails] [✓ Acquitter] [✓ Résoudre] [✗]     │
 * └──────────────────────────────────────────────────┘
 */
import React, { memo, useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  User, 
  Clock, 
  MapPin, 
  Eye, 
  CheckCircle, 
  XCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatRelativeTime } from '@/lib/utils';
import { LiveEventLocation } from './LiveEventLocation';
import { LiveEventStatus } from './LiveEventStatus';

// Configuration des types d'événements
const EVENT_TYPES = {
  FALL: {
    icon: AlertTriangle,
    label: 'Chute',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/50',
    priority: 1
  },
  SENSITIVE_FALL: {
    icon: AlertTriangle,
    label: 'Chute suspectée',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/50',
    priority: 1
  },
  PRE_FALL: {
    icon: AlertTriangle,
    label: 'Pré-chute',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/50',
    priority: 2
  },
  BED_EXIT: {
    icon: Clock,
    label: 'Sortie de lit',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/50',
    priority: 2
  },
  PRESENCE: {
    icon: User,
    label: 'Présence',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    priority: 4
  },
  INACTIVITY: {
    icon: Clock,
    label: 'Inactivité',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/50',
    priority: 3
  },
  UNKNOWN: {
    icon: Radio,
    label: 'Inconnu',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    priority: 5
  }
};

// Configuration des sévérités
const SEVERITIES = {
  CRITICAL: { label: 'Critique', color: 'bg-red-500 text-white' },
  HIGH: { label: 'Haute', color: 'bg-orange-500 text-white' },
  MEDIUM: { label: 'Moyenne', color: 'bg-amber-500 text-white' },
  LOW: { label: 'Basse', color: 'bg-slate-500 text-white' }
};

// Configuration des statuts
const STATUSES = {
  NEW: { label: 'Nouveau', color: 'bg-blue-500/20 text-blue-600 border-blue-500/30' },
  ACK: { label: 'Acquitté', color: 'bg-amber-500/20 text-amber-600 border-amber-500/30' },
  RESOLVED: { label: 'Résolu', color: 'bg-green-500/20 text-green-600 border-green-500/30' },
  FALSE_ALARM: { label: 'Fausse alerte', color: 'bg-slate-500/20 text-slate-600 border-slate-500/30' }
};

export const LiveEventCard = memo(function LiveEventCard({
  event,
  onAcknowledge,
  onResolve,
  onFalseAlarm,
  onViewDetails,
  isNew = false,
  language = 'fr'
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(isNew);
  const cardRef = useRef(null);
  
  // Animation de flash quand l'événement est nouveau ou mis à jour
  useEffect(() => {
    if (isNew) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);
  
  // Récupération des configs
  const eventType = event.type?.toUpperCase() || 'UNKNOWN';
  const typeConfig = EVENT_TYPES[eventType] || EVENT_TYPES.UNKNOWN;
  const severityConfig = SEVERITIES[event.severity?.toUpperCase()] || SEVERITIES.LOW;
  const statusConfig = STATUSES[event.status?.toUpperCase()] || STATUSES.NEW;
  const TypeIcon = typeConfig.icon;
  
  // Données de présence
  // IMPORTANT: Pour les événements PRESENCE, on affiche TOUJOURS "Présence détectée"
  // car les événements avec presenceDetected=false ne devraient pas exister dans la liste
  const presenceDetected = event.presence_detected;
  const isPresenceEvent = eventType === 'PRESENCE';
  
  // Données temps réel (simulées si non fournies)
  const realtime = event.realtime || {
    isActive: event.status === 'NEW' || event.status === 'ACK',
    lastUpdateTs: event.timestamp || event.occurred_at,
    deviceOnline: true // Par défaut en ligne si pas d'info
  };
  
  // Données de localisation
  const location = event.location || null;
  const locationPath = event.location_path || null;
  
  // Info localisation - prioriser la chambre/pièce
  const locationLabel = event.location_path || event.location?.room_number || null;
  const radarName = event.radar_name || event.sensor_name || null;
  const displayName = locationLabel || radarName || 'Localisation inconnue';
  
  // Déterminer si la carte doit être mise en avant (urgente)
  const isUrgent = (event.severity === 'HIGH' || event.severity === 'CRITICAL') && 
                   (event.status === 'NEW' || event.status === 'ACK');
  
  // Label pour le type d'événement
  const getEventLabel = () => {
    if (isPresenceEvent) {
      // TOUJOURS afficher "Présence détectée" pour les événements PRESENCE
      // car les événements d'absence ne devraient jamais être dans la liste
      return 'Présence détectée';
    }
    return typeConfig.label;
  };

  return (
    <Card
      ref={cardRef}
      className={cn(
        "overflow-hidden transition-all duration-300 hover:shadow-lg",
        // Animation de flash pour nouveaux événements
        isAnimating && "animate-pulse ring-2 ring-primary ring-offset-2",
        // Style selon l'urgence
        isUrgent && "border-l-4 border-l-red-500 shadow-lg shadow-red-500/10",
        !isUrgent && event.status === 'NEW' && "border-l-4 border-l-blue-500",
        event.status === 'RESOLVED' && "opacity-75 hover:opacity-100"
      )}
      data-testid={`live-event-card-${event.id}`}
    >
      <CardContent className="p-0">
        {/* === HEADER === */}
        <div className={cn(
          "px-4 py-3",
          typeConfig.bgColor
        )}>
          <div className="flex items-start justify-between gap-3">
            {/* Type + Label */}
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "p-2 rounded-lg",
                typeConfig.bgColor,
                "border",
                typeConfig.borderColor
              )}>
                <TypeIcon className={cn("h-5 w-5", typeConfig.color)} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {getEventLabel()}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge className={cn("text-xs px-1.5 py-0", severityConfig.color)}>
                    {severityConfig.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(event.timestamp || event.occurred_at, language)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Statut */}
            <Badge 
              variant="outline" 
              className={cn("text-xs shrink-0 border", statusConfig.color)}
            >
              {statusConfig.label}
            </Badge>
          </div>
        </div>
        
        {/* === SECTION LOCALISATION === */}
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
          <LiveEventLocation 
            location={location}
            locationPath={locationPath}
          />
          
          {/* Info Radar */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground truncate max-w-[200px]" title={displayName}>{displayName}</span>
                    <span className="text-border">•</span>
                    {realtime.deviceOnline !== false ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Wifi className="h-3 w-3" />
                        <span>En ligne</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500 font-medium">
                        <WifiOff className="h-3 w-3" />
                        <span>Hors ligne</span>
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs space-y-1">
                    {locationLabel && <p>Localisation: {locationLabel}</p>}
                    {radarName && <p>Capteur: {radarName}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        {/* === SECTION ÉTAT TEMPS RÉEL === */}
        <div className="px-4 py-3 border-b border-border/50">
          <LiveEventStatus
            status={event.status}
            realtime={realtime}
            lastUpdate={event.timestamp || event.occurred_at}
          />
        </div>
        
        {/* === DÉTAILS SUPPLÉMENTAIRES (collapsible) === */}
        {(event.active_regions?.length > 0 || event.target_count > 0 || event.notes) && (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-4 py-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Masquer les détails
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Voir plus de détails
                </>
              )}
            </button>
            
            {isExpanded && (
              <div className="px-4 py-3 bg-muted/10 border-t border-border/50 space-y-2">
                {event.active_regions?.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Régions actives: </span>
                    <span className="font-mono">{event.active_regions.join(', ')}</span>
                  </div>
                )}
                {event.target_count > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Cibles détectées: </span>
                    <span className="font-medium">{event.target_count}</span>
                  </div>
                )}
                {event.notes && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Notes: </span>
                    <span>{event.notes}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {/* === ACTIONS === */}
        <div className="px-4 py-3 flex items-center justify-between bg-muted/5">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8"
            onClick={() => onViewDetails?.(event.id)}
            data-testid={`view-btn-${event.id}`}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Détails
          </Button>
          
          <div className="flex items-center gap-1">
            {event.status === 'NEW' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      onClick={() => onAcknowledge?.(event.id)}
                      data-testid={`ack-btn-${event.id}`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Acquitter</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {(event.status === 'NEW' || event.status === 'ACK') && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 px-2 bg-green-600 hover:bg-green-700"
                        onClick={() => onResolve?.(event.id)}
                        data-testid={`resolve-btn-${event.id}`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Résoudre</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-muted-foreground hover:text-red-500"
                        onClick={() => onFalseAlarm?.(event.id)}
                        data-testid={`false-alarm-btn-${event.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Fausse alerte</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default LiveEventCard;
