/**
 * LiveEventLocation - Affiche la localisation hiérarchique d'un événement
 * Format: Bâtiment > Étage • Chambre • Sous-espace
 */
import React, { memo } from 'react';
import { Building2, Layers, DoorOpen, Bath, Bed, UtensilsCrossed, MapPin } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Icône selon le type de sous-espace
const getSpaceIcon = (spaceType) => {
  switch (spaceType?.toUpperCase()) {
    case 'BEDROOM':
      return <Bed className="h-3.5 w-3.5" />;
    case 'BATHROOM':
      return <Bath className="h-3.5 w-3.5" />;
    case 'KITCHENETTE':
      return <UtensilsCrossed className="h-3.5 w-3.5" />;
    case 'ZONE':
      return <MapPin className="h-3.5 w-3.5" />;
    default:
      return <DoorOpen className="h-3.5 w-3.5" />;
  }
};

// Label français pour le type de sous-espace
const getSpaceLabel = (spaceType) => {
  switch (spaceType?.toUpperCase()) {
    case 'BEDROOM':
      return 'Chambre à coucher';
    case 'BATHROOM':
      return 'Salle de bain';
    case 'KITCHENETTE':
      return 'Kitchenette';
    case 'ZONE':
      return 'Zone commune';
    default:
      return spaceType || 'Espace';
  }
};

export const LiveEventLocation = memo(function LiveEventLocation({ 
  location, 
  locationPath,
  compact = false,
  className 
}) {
  // Si pas de données de localisation structurée, utiliser locationPath
  if (!location && !locationPath) {
    return (
      <div className={cn("text-xs text-muted-foreground italic", className)}>
        Localisation non définie
      </div>
    );
  }

  // Mode compact - juste le path
  if (compact && locationPath) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[200px]",
              className
            )}>
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{locationPath}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">{locationPath}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const { 
    client_name, 
    building_name, 
    floor_name, 
    room_number,
    zone_name,
    space_type,
    space_name
  } = location || {};

  // Construire la hiérarchie
  const hasBuilding = building_name;
  const hasFloor = floor_name;
  const hasRoom = room_number;
  const hasSpace = space_type || space_name;
  const hasZone = zone_name;

  return (
    <div className={cn("space-y-1", className)}>
      {/* Ligne 1: Client > Bâtiment */}
      {(client_name || building_name) && (
        <div className="flex items-center gap-1.5 text-xs">
          <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="font-medium text-foreground truncate">
            {client_name && <span>{client_name}</span>}
            {client_name && building_name && <span className="text-muted-foreground mx-1">›</span>}
            {building_name && <span className="text-primary">{building_name}</span>}
          </span>
        </div>
      )}
      
      {/* Ligne 2: Étage • Chambre • Sous-espace */}
      {(hasFloor || hasRoom || hasSpace || hasZone) && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          {hasFloor && (
            <>
              <Layers className="h-3 w-3 flex-shrink-0" />
              <span>{floor_name}</span>
            </>
          )}
          
          {hasRoom && (
            <>
              {hasFloor && <span className="mx-0.5">•</span>}
              <DoorOpen className="h-3 w-3 flex-shrink-0" />
              <span>Ch. {room_number}</span>
            </>
          )}
          
          {hasSpace && (
            <>
              {(hasFloor || hasRoom) && <span className="mx-0.5">•</span>}
              {getSpaceIcon(space_type)}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-foreground font-medium">
                      {space_name || getSpaceLabel(space_type)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Type: {getSpaceLabel(space_type)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          
          {hasZone && !hasRoom && (
            <>
              {hasFloor && <span className="mx-0.5">•</span>}
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="text-foreground font-medium">{zone_name}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default LiveEventLocation;
