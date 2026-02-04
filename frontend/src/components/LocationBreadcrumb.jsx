/**
 * OhmGuard Breadcrumb Component
 * 
 * Fil d'Ariane dynamique pour la navigation hiérarchique
 * Organisation → Bâtiment → Étage → Zone → Chambre → Espace → Capteur
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Breadcrumb, 
  BreadcrumbList, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from '@/components/ui/breadcrumb';
import { Home, Building2, Building, Layers, LayoutGrid, DoorOpen, Radio, Bed } from 'lucide-react';
import { cn } from '@/lib/utils';

// Configuration des icônes et couleurs par type
const typeConfig = {
  home: { icon: Home, color: 'text-gray-500' },
  organisation: { icon: Building2, color: 'text-blue-500' },
  building: { icon: Building, color: 'text-emerald-500' },
  floor: { icon: Layers, color: 'text-amber-500' },
  zone: { icon: LayoutGrid, color: 'text-purple-500' },
  room: { icon: DoorOpen, color: 'text-cyan-500' },
  space: { icon: Bed, color: 'text-pink-500' },
  sensor: { icon: Radio, color: 'text-red-500' },
  capteurs: { icon: Radio, color: 'text-red-500' },
  sites: { icon: Building, color: 'text-emerald-500' },
};

/**
 * LocationBreadcrumb - Breadcrumb pour la navigation de localisation
 * 
 * @param {Array} items - Liste des éléments
 *   [{ type: 'organisation', label: 'OHMCARE', href: '/organisations/123' }, ...]
 * @param {string} className - Classes CSS additionnelles
 */
export function LocationBreadcrumb({ items = [], className, showHome = true }) {
  // Construire la liste complète avec Accueil
  const allItems = showHome 
    ? [{ type: 'home', label: 'Accueil', href: '/dashboard' }, ...items]
    : items;
  
  if (allItems.length === 0) {
    return null;
  }
  
  return (
    <Breadcrumb className={cn('mb-4', className)}>
      <BreadcrumbList>
        {allItems.map((item, index) => {
          const config = typeConfig[item.type] || typeConfig.home;
          const Icon = config.icon;
          const isLast = index === allItems.length - 1;
          
          return (
            <React.Fragment key={item.href || `item-${index}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <Icon className={cn('h-4 w-4', config.color)} />
                    <span className="font-medium">{item.label}</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link 
                      to={item.href} 
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      <Icon className={cn('h-4 w-4', config.color)} />
                      <span>{item.label}</span>
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Hook pour construire le breadcrumb à partir des données de localisation
 * 
 * @param {Object} locationData - Données de localisation
 * @returns {Array} Items du breadcrumb
 */
export function useBreadcrumbItems(locationData = {}) {
  const items = [];
  
  // Organisation / Client
  if (locationData.organisation || locationData.client) {
    const org = locationData.organisation || locationData.client;
    items.push({
      type: 'organisation',
      label: org.name,
      href: `/organisations/${org.id}`
    });
  }
  
  // Bâtiment
  if (locationData.building) {
    items.push({
      type: 'building',
      label: locationData.building.name,
      href: `/buildings/${locationData.building.id}`
    });
  }
  
  // Étage
  if (locationData.floor) {
    items.push({
      type: 'floor',
      label: locationData.floor.name,
      href: `/floors/${locationData.floor.id}`
    });
  }
  
  // Zone
  if (locationData.zone) {
    items.push({
      type: 'zone',
      label: locationData.zone.name,
      href: null // Zones n'ont pas de page dédiée
    });
  }
  
  // Chambre
  if (locationData.room) {
    items.push({
      type: 'room',
      label: locationData.room.name,
      href: `/rooms/${locationData.room.id}`
    });
  }
  
  // Espace
  if (locationData.space) {
    items.push({
      type: 'space',
      label: locationData.space.name,
      href: null
    });
  }
  
  // Capteur
  if (locationData.sensor) {
    items.push({
      type: 'sensor',
      label: locationData.sensor.name || locationData.sensor.serial_product || 'Capteur',
      href: `/capteurs`
    });
  }
  
  return items;
}

/**
 * Construire un breadcrumb simple à partir d'un chemin de page
 */
export function getPageBreadcrumb(pageName, pageLabel, parentItems = []) {
  return [
    ...parentItems,
    { type: pageName, label: pageLabel, href: null }
  ];
}

export default LocationBreadcrumb;
