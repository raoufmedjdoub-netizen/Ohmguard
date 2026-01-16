/**
 * LivePage - Vue compacte du parc de radars
 * 
 * Affiche l'état de chaque radar:
 * - Nom/identifiant
 * - Type d'événement (présence/chute)
 * - Statut en ligne/hors ligne
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  RefreshCw,
  Filter,
  Loader2,
  Wifi,
  WifiOff,
  Building2,
  Activity
} from 'lucide-react';

import { RadarStatusCard } from '@/components/live';

export function LivePage() {
  const { subscribe, connected } = useWebSocket();
  
  // États
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [radarStatuses, setRadarStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [newEventIds, setNewEventIds] = useState(new Set());
  
  const isFetchingRef = useRef(false);

  // Chargement des données
  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setLoading(true);
    
    try {
      const params = {
        limit: 100,
        ...(selectedClient !== 'all' && { client_id: selectedClient }),
        ...(selectedBuilding !== 'all' && { building_id: selectedBuilding })
      };
      
      const [eventsRes, clientsRes, sensorsRes] = await Promise.all([
        eventsAPI.list(params),
        api.get('/clients'),
        api.get('/sensors')
      ]);
      
      // Déduplication des événements
      const uniqueEvents = [];
      const seenIds = new Set();
      for (const event of eventsRes.data) {
        if (!seenIds.has(event.id)) {
          seenIds.add(event.id);
          uniqueEvents.push(event);
        }
      }
      
      setEvents(uniqueEvents);
      setClients(clientsRes.data);
      
      // Statuts des radars
      const statuses = {};
      sensorsRes.data.forEach(sensor => {
        statuses[sensor.id] = {
          status: sensor.status,
          deviceOnline: sensor.status === 'ONLINE',
          name: sensor.name,
          serial_product: sensor.serial_product
        };
      });
      setRadarStatuses(statuses);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [selectedClient, selectedBuilding]);

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

  // WebSocket pour les mises à jour temps réel
  const radarStatusesRef = useRef(radarStatuses);
  useEffect(() => {
    radarStatusesRef.current = radarStatuses;
  }, [radarStatuses]);

  useEffect(() => {
    const unsubscribe = subscribe('live', (message) => {
      if (message.type === 'force_refresh') {
        if (message.events && Array.isArray(message.events)) {
          const uniqueEvents = [];
          const seenIds = new Set();
          for (const event of message.events) {
            if (!seenIds.has(event.id)) {
              seenIds.add(event.id);
              uniqueEvents.push(event);
            }
          }
          setEvents(uniqueEvents);
        }
        return;
      }
      
      if (message.type === 'presence_state_update' || message.type === 'presence_update') {
        return;
      }
      
      // Mise à jour du statut d'un radar
      if (message.type === 'sensor_status') {
        const { sensor_id, status } = message;
        setRadarStatuses(prev => ({
          ...prev,
          [sensor_id]: {
            ...prev[sensor_id],
            status: status,
            deviceOnline: status === 'ONLINE'
          }
        }));
        
        if (status === 'OFFLINE') {
          const prevStatus = radarStatusesRef.current[sensor_id];
          toast.warning('Radar hors ligne', {
            description: prevStatus?.name || sensor_id,
            duration: 5000
          });
        }
      }
      // Nouvel événement
      else if (message.type === 'new_event' || message.type === 'new_radar_event') {
        const newEvent = message.event;
        if (!newEvent) return;
        
        if (newEvent.type === 'PRESENCE' && newEvent.presence_detected === false) {
          return;
        }
        
        setEvents(prev => {
          if (prev.some(e => e.id === newEvent.id)) {
            return prev;
          }
          return [newEvent, ...prev.slice(0, 99)];
        });
        
        setNewEventIds(prev => new Set([...prev, newEvent.id]));
        setTimeout(() => {
          setNewEventIds(prev => {
            const next = new Set(prev);
            next.delete(newEvent.id);
            return next;
          });
        }, 3000);
        
        // Alerte pour chutes
        if (newEvent.type === 'FALL') {
          toast.error('🚨 Chute détectée!', {
            description: newEvent.radar_name || newEvent.location_path || 'Localisation inconnue',
            duration: 10000
          });
        }
      }
      else if (message.type === 'event_updated') {
        setEvents(prev => prev.map(e => 
          e.id === message.event_id ? { ...e, ...message.update } : e
        ));
      }
      else if (message.type === 'sensor_registered') {
        const { sensor } = message;
        setRadarStatuses(prev => ({
          ...prev,
          [sensor.id]: {
            status: sensor.status,
            deviceOnline: sensor.status === 'ONLINE',
            name: sensor.name
          }
        }));
      }
    });
    return unsubscribe;
  }, [subscribe]);

  // Filtrage et déduplication par sensor_id (garder le plus récent)
  // IMPORTANT: Exclure les événements où presence_detected === false
  const radarCards = useMemo(() => {
    const filtered = events.filter(event => {
      // Exclure les événements PRESENCE avec presence_detected === false
      if (event.type === 'PRESENCE' && event.presence_detected === false) {
        return false;
      }
      
      if (selectedClient !== 'all') {
        const client = clients.find(c => c.id === selectedClient);
        if (client) {
          const eventClientName = event.location?.client_name;
          const eventPath = event.location_path;
          
          if (eventClientName) {
            if (eventClientName !== client.name) return false;
          } else if (eventPath) {
            if (!eventPath.includes(client.name)) return false;
          } else {
            return false;
          }
        }
      }
      
      if (selectedBuilding !== 'all') {
        const building = buildings.find(b => b.id === selectedBuilding);
        if (building) {
          const eventBuildingName = event.location?.building_name;
          const eventPath = event.location_path;
          
          if (eventBuildingName) {
            if (eventBuildingName !== building.name) return false;
          } else if (eventPath) {
            if (!eventPath.includes(building.name)) return false;
          } else {
            return false;
          }
        }
      }
      
      return true;
    });
    
    // Garder le plus récent par sensor_id
    const latestBySensor = new Map();
    for (const event of filtered) {
      const sensorId = event.sensor_id || event.device_id || 'unknown';
      const existing = latestBySensor.get(sensorId);
      
      if (!existing) {
        latestBySensor.set(sensorId, event);
      } else {
        const existingTime = new Date(existing.timestamp || existing.occurred_at || 0).getTime();
        const currentTime = new Date(event.timestamp || event.occurred_at || 0).getTime();
        if (currentTime > existingTime) {
          latestBySensor.set(sensorId, event);
        }
      }
    }
    
    return Array.from(latestBySensor.values()).sort((a, b) => {
      const timeA = new Date(a.timestamp || a.occurred_at || 0).getTime();
      const timeB = new Date(b.timestamp || b.occurred_at || 0).getTime();
      return timeB - timeA;
    });
  }, [events, selectedClient, selectedBuilding, clients, buildings]);

  // Stats
  const stats = {
    total: radarCards.length,
    online: radarCards.filter(e => {
      const status = radarStatuses[e.sensor_id];
      return status?.deviceOnline !== false;
    }).length,
    falls: radarCards.filter(e => e.type === 'FALL').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="live-page" className="space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className="h-6 w-6 text-primary" />
            {connected && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            )}
          </div>
          
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              État des radars
              <Badge variant="outline" className={cn(
                "text-xs font-normal",
                connected ? "border-green-500 text-green-600" : "border-amber-500 text-amber-600"
              )}>
                {connected ? (
                  <><Wifi className="h-3 w-3 mr-1" />Live</>
                ) : (
                  <><WifiOff className="h-3 w-3 mr-1" />...</>
                )}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              {stats.online}/{stats.total} en ligne
              {stats.falls > 0 && (
                <span className="text-red-500 font-medium ml-2">
                  • {stats.falls} chute{stats.falls > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchData} 
          disabled={loading}
          data-testid="refresh-btn"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Filtres compacts */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        
        <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedBuilding('all'); }}>
          <SelectTrigger className="w-44 h-8 text-xs" data-testid="client-filter">
            <Building2 className="h-3 w-3 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {selectedClient !== 'all' && buildings.length > 0 && (
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="building-filter">
              <SelectValue placeholder="Bâtiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {buildings.map(building => (
                <SelectItem key={building.id} value={building.id}>{building.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Grille compacte de radars */}
      <Card>
        <CardHeader className="border-b border-border py-2 px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Radio className="h-4 w-4 text-primary" />
            Radars ({radarCards.length})
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-3">
          {radarCards.length === 0 ? (
            <div className="py-8 text-center">
              <Radio className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Aucun radar</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {radarCards.map((event) => {
                const radarStatus = radarStatuses[event.sensor_id] || {};
                const radarName = event.radar_name || 
                                  radarStatus.name || 
                                  radarStatus.serial_product || 
                                  event.serial_product ||
                                  event.sensor_id?.substring(0, 8) || 
                                  'N/A';
                
                return (
                  <RadarStatusCard
                    key={event.sensor_id || event.id}
                    radarName={radarName}
                    isOnline={radarStatus.deviceOnline !== false}
                    eventType={event.type}
                    isNew={newEventIds.has(event.id)}
                  />
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
