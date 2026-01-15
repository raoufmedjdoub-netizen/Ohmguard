/**
 * LivePage - Mur d'événements temps réel
 * 
 * Affiche les événements en temps réel avec:
 * - Localisation hiérarchique complète
 * - État temps réel (actif/acquitté/résolu)
 * - Statut du radar (en ligne/hors ligne)
 * - Animations pour les nouveaux événements
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { eventsAPI } from '@/lib/api';
import api from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Radio,
  AlertTriangle,
  RefreshCw,
  Filter,
  Loader2,
  Volume2,
  VolumeX,
  Activity,
  Clock,
  CheckCircle2,
  Users,
  Wifi,
  WifiOff,
  LayoutGrid,
  List,
  Building2
} from 'lucide-react';

// Import du nouveau composant LiveEventCard
import { LiveEventCard } from '@/components/live';

export function LivePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { subscribe, connected, isPolling } = useWebSocket();
  
  // États
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [radarStatuses, setRadarStatuses] = useState({}); // {sensor_id: {status, last_seen, deviceOnline}}
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [newEventIds, setNewEventIds] = useState(new Set());
  
  // Référence pour le son d'alerte
  const alertSoundRef = useRef(null);

  // Chargement des données
  const fetchData = useCallback(async () => {
    try {
      const params = {
        limit: 50,
        ...(selectedStatus !== 'all' && { status: selectedStatus }),
        ...(selectedType !== 'all' && { event_type: selectedType })
      };
      
      const [eventsRes, clientsRes, sensorsRes] = await Promise.all([
        eventsAPI.list(params),
        api.get('/clients'),
        api.get('/sensors')
      ]);
      setEvents(eventsRes.data);
      setClients(clientsRes.data);
      
      // Initialiser les statuts des radars
      const statuses = {};
      sensorsRes.data.forEach(sensor => {
        statuses[sensor.id] = {
          status: sensor.status,
          last_seen: sensor.last_seen,
          deviceOnline: sensor.status === 'ONLINE',
          device_id: sensor.device_id,
          name: sensor.name
        };
      });
      setRadarStatuses(statuses);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedType, t]);

  // Charger les bâtiments quand un client est sélectionné
  useEffect(() => {
    if (selectedClient && selectedClient !== 'all') {
      api.get(`/clients/${selectedClient}/buildings`).then(res => {
        setBuildings(res.data);
      }).catch(() => setBuildings([]));
    } else {
      setBuildings([]);
      setSelectedBuilding('all');
    }
  }, [selectedClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Gestion WebSocket/Polling pour les événements temps réel
  useEffect(() => {
    const unsubscribe = subscribe('live', (message) => {
      // Force refresh - reload all events (from polling)
      if (message.type === 'force_refresh') {
        if (message.events) {
          setEvents(message.events);
          
          // Update radar statuses from events
          const newStatuses = { ...radarStatuses };
          message.events.forEach(event => {
            if (event.sensor_id) {
              newStatuses[event.sensor_id] = {
                ...newStatuses[event.sensor_id],
                status: 'ONLINE',
                last_seen: event.timestamp || new Date().toISOString(),
                deviceOnline: true
              };
            }
          });
          setRadarStatuses(newStatuses);
        }
        return;
      }
      
      // Mise à jour du statut d'un radar
      if (message.type === 'sensor_status') {
        const { sensor_id, status, last_seen } = message;
        setRadarStatuses(prev => ({
          ...prev,
          [sensor_id]: {
            ...prev[sensor_id],
            status: status,
            last_seen: last_seen || new Date().toISOString(),
            deviceOnline: status === 'ONLINE'
          }
        }));
        
        // Notification si un radar passe hors ligne
        if (status === 'OFFLINE') {
          toast.warning(`Radar hors ligne`, {
            description: prev[sensor_id]?.name || sensor_id,
            duration: 5000
          });
        }
      }
      // Nouvel événement
      else if (message.type === 'new_event' || message.type === 'new_radar_event') {
        const newEvent = message.event;
        
        // Mettre à jour le statut du radar associé
        if (newEvent.sensor_id) {
          setRadarStatuses(prev => ({
            ...prev,
            [newEvent.sensor_id]: {
              ...prev[newEvent.sensor_id],
              status: 'ONLINE',
              last_seen: newEvent.timestamp || new Date().toISOString(),
              deviceOnline: true
            }
          }));
        }
        
        // Ajouter à la liste avec marqueur "nouveau"
        setEvents(prev => [newEvent, ...prev.slice(0, 49)]);
        setNewEventIds(prev => new Set([...prev, newEvent.id]));
        
        // Retirer le marqueur après 3 secondes
        setTimeout(() => {
          setNewEventIds(prev => {
            const next = new Set(prev);
            next.delete(newEvent.id);
            return next;
          });
        }, 3000);
        
        // Alerte pour événements critiques
        if (newEvent.type === 'FALL' || newEvent.severity === 'HIGH' || newEvent.severity === 'CRITICAL') {
          // Notification système
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🚨 OhmGuard - Alerte', {
              body: `${newEvent.type === 'FALL' ? 'Chute détectée' : newEvent.type} - ${newEvent.location_path || 'Localisation inconnue'}`,
              icon: '/favicon.ico',
              requireInteraction: true
            });
          }
          
          // Son d'alerte
          if (soundEnabled && alertSoundRef.current) {
            alertSoundRef.current.play().catch(() => {});
          }
          
          toast.error(`🚨 ${newEvent.type === 'FALL' ? 'Chute détectée!' : 'Alerte haute priorité'}`, {
            description: newEvent.location_path || 'Vérifier la localisation',
            duration: 10000
          });
        } else {
          toast.info('Nouvel événement', {
            description: `${newEvent.type} - ${newEvent.severity}`
          });
        }
      } 
      // Mise à jour d'événement
      else if (message.type === 'event_updated') {
        setEvents(prev => prev.map(e => 
          e.id === message.event_id ? { ...e, ...message.update } : e
        ));
        
        // Marquer comme mis à jour
        setNewEventIds(prev => new Set([...prev, message.event_id]));
        setTimeout(() => {
          setNewEventIds(prev => {
            const next = new Set(prev);
            next.delete(message.event_id);
            return next;
          });
        }, 2000);
      }
      // Nouveau radar enregistré
      else if (message.type === 'sensor_registered') {
        const { sensor } = message;
        setRadarStatuses(prev => ({
          ...prev,
          [sensor.id]: {
            status: sensor.status,
            last_seen: sensor.last_seen,
            deviceOnline: sensor.status === 'ONLINE',
            device_id: sensor.device_id,
            name: sensor.name
          }
        }));
        toast.success('Nouveau radar détecté', {
          description: sensor.name || sensor.device_id
        });
      }
    });
    return unsubscribe;
  }, [subscribe, soundEnabled]);

  // Actions sur les événements
  const handleUpdateStatus = async (eventId, newStatus) => {
    try {
      await eventsAPI.update(eventId, { status: newStatus });
      setEvents(prev => prev.map(e => 
        e.id === eventId ? { ...e, status: newStatus } : e
      ));
      toast.success(t('events.event_updated'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleViewDetails = (eventId) => {
    navigate(`/events/${eventId}`);
  };

  // Filtrage par client et bâtiment
  const filteredEvents = events.filter(event => {
    // Filtre par client
    if (selectedClient !== 'all') {
      if (event.location?.client_name) {
        const client = clients.find(c => c.id === selectedClient);
        if (client && event.location.client_name !== client.name) return false;
      } else if (event.location_path) {
        const client = clients.find(c => c.id === selectedClient);
        if (client && !event.location_path.includes(client.name)) return false;
      } else {
        return false; // Pas de localisation, on l'exclut si un filtre client est actif
      }
    }
    
    // Filtre par bâtiment
    if (selectedBuilding !== 'all') {
      if (event.location?.building_name) {
        const building = buildings.find(b => b.id === selectedBuilding);
        if (building && event.location.building_name !== building.name) return false;
      } else if (event.location_path) {
        const building = buildings.find(b => b.id === selectedBuilding);
        if (building && !event.location_path.includes(building.name)) return false;
      } else {
        return false;
      }
    }
    
    return true;
  });

  // Statistiques
  const stats = {
    new: events.filter(e => e.status === 'NEW').length,
    ack: events.filter(e => e.status === 'ACK').length,
    presence: events.filter(e => e.type === 'PRESENCE').length,
    active: events.filter(e => e.presence_detected).length,
    critical: events.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length,
    radarsOnline: Object.values(radarStatuses).filter(r => r.deviceOnline).length,
    radarsTotal: Object.keys(radarStatuses).length
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement des événements...</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="live-page" className="space-y-6">
      {/* Son d'alerte (invisible) */}
      <audio ref={alertSoundRef} preload="auto">
        <source src="/alert.mp3" type="audio/mpeg" />
      </audio>
      
      {/* === HEADER === */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Indicateur de connexion WebSocket */}
          <div className="relative">
            <Activity className="h-7 w-7 text-primary" />
            {connected ? (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            ) : (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </div>
          
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Mur d'événements
              <Badge variant="outline" className={cn(
                "ml-2 font-normal",
                connected ? "border-green-500 text-green-600" : "border-red-500 text-red-600"
              )}>
                {connected ? (
                  <>
                    <Wifi className="h-3 w-3 mr-1" />
                    {isPolling ? 'Auto-refresh (3s)' : 'Temps réel'}
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3 mr-1" />
                    Hors ligne
                  </>
                )}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredEvents.length} événement{filteredEvents.length > 1 ? 's' : ''} • 
              {stats.critical > 0 && (
                <span className="text-red-500 font-medium ml-1">
                  {stats.critical} critique{stats.critical > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        
        {/* Actions rapides */}
        <div className="flex items-center gap-2">
          {/* Toggle son */}
          <Button
            variant={soundEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="sound-toggle"
            className={cn(!soundEnabled && "text-muted-foreground")}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>
          
          {/* Toggle vue */}
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Refresh */}
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-btn">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* === FILTRES === */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtres:</span>
            </div>
            
            {/* Filtre Client */}
            <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedBuilding('all'); }}>
              <SelectTrigger className="w-52" data-testid="client-filter">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Filtre Bâtiment (visible seulement si client sélectionné) */}
            {selectedClient !== 'all' && buildings.length > 0 && (
              <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                <SelectTrigger className="w-48" data-testid="building-filter">
                  <SelectValue placeholder="Bâtiment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les bâtiments</SelectItem>
                  {buildings.map(building => (
                    <SelectItem key={building.id} value={building.id}>{building.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Filtre Type */}
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setLoading(true); }}>
              <SelectTrigger className="w-40" data-testid="type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="FALL">🔴 Chute</SelectItem>
                <SelectItem value="PRE_FALL">🟠 Pré-chute</SelectItem>
                <SelectItem value="PRESENCE">🟢 Présence</SelectItem>
                <SelectItem value="INACTIVITY">🟡 Inactivité</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtre Statut */}
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setLoading(true); }}>
              <SelectTrigger className="w-40" data-testid="status-filter">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="NEW">Nouveau</SelectItem>
                <SelectItem value="ACK">Acquitté</SelectItem>
                <SelectItem value="RESOLVED">Résolu</SelectItem>
                <SelectItem value="FALSE_ALARM">Fausse alerte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* === STATISTIQUES === */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={cn(stats.new > 0 && "border-blue-500/50 bg-blue-500/5")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
                <div className="text-xs text-muted-foreground">Nouveaux</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={cn(stats.ack > 0 && "border-amber-500/50 bg-amber-500/5")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-600">{stats.ack}</div>
                <div className="text-xs text-muted-foreground">Acquittés</div>
              </div>
              <Clock className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={cn(stats.critical > 0 && "border-red-500/50 bg-red-500/5")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                <div className="text-xs text-muted-foreground">Critiques</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats.presence}</div>
                <div className="text-xs text-muted-foreground">Présences</div>
              </div>
              <Users className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                <div className="text-xs text-muted-foreground">Actifs</div>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        
        {/* Radars en ligne - Temps réel */}
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {stats.radarsOnline}/{stats.radarsTotal}
                </div>
                <div className="text-xs text-muted-foreground">Radars en ligne</div>
              </div>
              <div className="relative">
                <Wifi className="h-8 w-8 text-primary/30" />
                {connected && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === GRILLE D'ÉVÉNEMENTS === */}
      <Card>
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5 text-primary" />
              Événements en direct
            </CardTitle>
            {connected && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                En direct
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          {filteredEvents.length === 0 ? (
            <div className="py-16 text-center">
              <Radio className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                Aucun événement à afficher
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les nouveaux événements apparaîtront automatiquement
              </p>
            </div>
          ) : (
            <div className={cn(
              "gap-4",
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" 
                : "flex flex-col"
            )}>
              {filteredEvents.map((event, index) => {
                // Récupérer le statut temps réel du radar associé à cet événement
                const radarStatus = radarStatuses[event.sensor_id] || {};
                const realtimeData = {
                  isActive: event.status === 'NEW' || event.status === 'ACK',
                  lastUpdateTs: radarStatus.last_seen || event.timestamp || event.occurred_at,
                  deviceOnline: radarStatus.deviceOnline !== undefined ? radarStatus.deviceOnline : true
                };
                
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "transition-all duration-300",
                      index === 0 && "animate-in slide-in-from-top-4"
                    )}
                  >
                    <LiveEventCard
                      event={{
                        ...event,
                        realtime: realtimeData
                      }}
                      isNew={newEventIds.has(event.id)}
                      onAcknowledge={(id) => handleUpdateStatus(id, 'ACK')}
                      onResolve={(id) => handleUpdateStatus(id, 'RESOLVED')}
                      onFalseAlarm={(id) => handleUpdateStatus(id, 'FALSE_ALARM')}
                      onViewDetails={handleViewDetails}
                      language={i18n.language}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default LivePage;
