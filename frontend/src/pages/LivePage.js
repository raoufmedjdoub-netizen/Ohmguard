/**
 * LivePage - Vue temps réel du parc de radars
 * 
 * Affiche UNIQUEMENT les événements reçus en temps réel via WebSocket.
 * La page démarre vide et se remplit au fur et à mesure des événements.
 * Quand presence_detected: false, la carte disparaît.
 * Supporte les événements des radars Vayyar ET des caméras IA Seedoo.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import api from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAlerts } from '@/contexts/AlertContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Radio,
  RefreshCw,
  Filter,
  Loader2,
  Wifi,
  WifiOff,
  Building2,
  Activity,
  Camera,
  Video,
  AlertTriangle,
  User,
  Flame,
  Eye,
  CheckCircle,
  XCircle,
  Crosshair,
  Clock,
  MapPin,
  UserPlus
} from 'lucide-react';

import { RadarStatusCard } from '@/components/live';
import { EventActionDialog } from '@/components/EventActionDialog';
import { useNavigate } from 'react-router-dom';

const FALL_STATUS_LABELS = {
  fall_detected: { label: 'Detectee', color: 'bg-red-600 text-white' },
  fall_confirmed: { label: 'Confirmee', color: 'bg-red-700 text-white' },
  calling: { label: 'Appel en cours', color: 'bg-orange-500 text-white' },
  on_call: { label: 'En communication', color: 'bg-yellow-500 text-black' },
  finished: { label: 'Termine', color: 'bg-green-600 text-white' },
  fall_exit: { label: 'Sortie', color: 'bg-blue-500 text-white' },
  canceled: { label: 'Annule', color: 'bg-gray-500 text-white' },
};

const EVENT_TYPE_CONFIG = {
  FALL: { label: 'CHUTE', color: 'bg-red-600', borderColor: 'border-red-500' },
  SENSITIVE_FALL: { label: 'CHUTE SUSPECTE', color: 'bg-orange-600', borderColor: 'border-orange-500' },
  BED_EXIT: { label: 'SORTIE DE LIT', color: 'bg-amber-600', borderColor: 'border-amber-500' },
};

function ElapsedTimer({ since }) {
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
  return <span className="font-mono">{elapsed}</span>;
}

function ActiveAlertCard({ alert, onAction, onView }) {
  const config = EVENT_TYPE_CONFIG[alert.type] || EVENT_TYPE_CONFIG.FALL;
  const fallConfig = FALL_STATUS_LABELS[alert.fall_status];
  const isAcked = alert.status === 'ACK';
  const location = alert.location_path || alert.sensor_name || alert.radar_name || 'Localisation inconnue';
  const hasLocation = alert.fall_loc_x_cm != null || alert.fall_loc_y_cm != null;

  return (
    <div
      data-testid={`active-alert-${alert.id}`}
      className={cn(
        'rounded-lg border-2 p-4 transition-all',
        isAcked ? 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50' : `${config.borderColor} bg-white dark:bg-gray-900`,
        !isAcked && 'shadow-lg'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Type + Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-xs font-bold text-white', config.color)}>
              {config.label}
            </Badge>
            {fallConfig && (
              <Badge className={cn('text-xs', fallConfig.color)}>{fallConfig.label}</Badge>
            )}
            {alert.is_simulated && (
              <Badge className="bg-yellow-400/80 text-yellow-900 text-xs">TEST</Badge>
            )}
            {isAcked && (
              <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">Acquitte</Badge>
            )}
            {alert.assigned_to_name && (
              <Badge variant="outline" className="text-xs border-purple-400 text-purple-600">{alert.assigned_to_name}</Badge>
            )}
          </div>

          {/* Location */}
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">{location}</span>
          </div>

          {/* Fall location coordinates */}
          {hasLocation && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Crosshair className="h-3 w-3" />
              <span className="font-mono">X:{alert.fall_loc_x_cm} Y:{alert.fall_loc_y_cm} Z:{alert.fall_loc_z_cm}</span>
              {alert.tar_height_est != null && (
                <span className="font-mono">H:{alert.tar_height_est}cm</span>
              )}
            </div>
          )}

          {/* Timer */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <ElapsedTimer since={alert.addedAt || Date.now()} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!isAcked && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction(alert, 'ACK')}>
              Acquitter
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => onAction(alert, 'RESOLVED')}>
            <CheckCircle className="h-3 w-3 mr-1" />
            Resoudre
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction(alert, 'FALSE_ALARM')}>
            <XCircle className="h-3 w-3 mr-1" />
            Faux
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction(alert, 'ASSIGN')}>
            <UserPlus className="h-3 w-3 mr-1" />
            Assigner
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onView(alert.id)}>
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>
        </div>
      </div>

      {/* Fall status timeline (compact) */}
      {alert.fall_status_history && alert.fall_status_history.length > 1 && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            {alert.fall_status_history.slice(-4).map((entry, idx) => {
              const c = FALL_STATUS_LABELS[entry.status] || { label: entry.status, color: 'bg-gray-400 text-white' };
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-muted-foreground text-xs">→</span>}
                  <Badge className={cn('text-[10px] py-0', c.color)}>{c.label}</Badge>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveAlertsSection() {
  const { activeAlerts, updateAlert, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState('ACK');
  const [dialogEvent, setDialogEvent] = useState(null);

  const handleAction = (alert, action) => {
    setDialogEvent(alert);
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleActionSuccess = (updatedEvent) => {
    if (!updatedEvent) return;
    if (updatedEvent.status === 'RESOLVED' || updatedEvent.status === 'FALSE_ALARM') {
      dismissAlert(updatedEvent.id);
    } else {
      updateAlert(updatedEvent.id, updatedEvent);
    }
  };

  if (activeAlerts.length === 0) return null;

  const unackedCount = activeAlerts.filter(a => a.status !== 'ACK').length;

  return (
    <>
      <Card className="border-red-500/50 shadow-lg" data-testid="active-alerts-section">
        <CardHeader className="border-b border-red-500/20 py-2 px-4 bg-red-50 dark:bg-red-950/30">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            Alertes actives ({activeAlerts.length})
            {unackedCount > 0 && (
              <Badge className="bg-red-600 text-white text-xs ml-1">{unackedCount} non acquittee{unackedCount > 1 ? 's' : ''}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeAlerts.map(alert => (
              <ActiveAlertCard
                key={alert.id}
                alert={alert}
                onAction={handleAction}
                onView={(id) => navigate(`/events/${id}`)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <EventActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={dialogEvent?.id}
        action={dialogAction}
        eventInfo={dialogEvent ? {
          type: dialogEvent.type,
          location: dialogEvent.location_path || dialogEvent.sensor_name,
          sensor: dialogEvent.radar_name || dialogEvent.device_id
        } : null}
        onSuccess={handleActionSuccess}
      />
    </>
  );
}

export function LivePage() {
  const { subscribe, connected } = useWebSocket();
  
  // États
  const [events, setEvents] = useState([]);
  const [aiEvents, setAiEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [radarStatuses, setRadarStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [activeView, setActiveView] = useState('all'); // 'all', 'radars', 'ai'
  const [newEventIds, setNewEventIds] = useState(new Set());
  
  const isFetchingRef = useRef(false);

  // Chargement des métadonnées uniquement (pas d'événements historiques)
  // La page démarre vide et se remplit via WebSocket temps réel
  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setLoading(true);
    
    try {
      // Ne PAS charger les événements - uniquement les métadonnées
      const [clientsRes, sensorsRes] = await Promise.all([
        api.get('/clients'),
        api.get('/sensors')
      ]);
      
      // Pas d'événements au démarrage - page vide, temps réel uniquement
      setEvents([]);
      setClients(clientsRes.data);
      
      // Statuts des radars (pour info online/offline)
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
  }, []);

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
      
      // Mise à jour de l'état de présence - gérer la disparition des cartes
      if (message.type === 'presence_state_update' || message.type === 'presence_update') {
        const { sensor_id, device_id, presence_detected, presenceDetected } = message;
        const sensorId = sensor_id || device_id;
        const hasPresence = presence_detected ?? presenceDetected;
        
        if (sensorId && hasPresence === false) {
          // Présence disparue - supprimer la carte
          setEvents(prev => prev.filter(e => {
            const eventSensorId = e.sensor_id || e.device_id;
            return eventSensorId !== sensorId;
          }));
        }
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
        
        const sensorId = newEvent.sensor_id || newEvent.device_id;
        
        // Si presence_detected === false, SUPPRIMER la carte du radar
        if (newEvent.type === 'PRESENCE' && newEvent.presence_detected === false) {
          setEvents(prev => prev.filter(e => {
            const eventSensorId = e.sensor_id || e.device_id;
            // Supprimer tous les événements de ce sensor
            return eventSensorId !== sensorId;
          }));
          return;
        }
        
        // Sinon, ajouter/mettre à jour l'événement
        setEvents(prev => {
          // Supprimer les anciens événements du même sensor pour éviter les doublons
          const filtered = prev.filter(e => {
            const eventSensorId = e.sensor_id || e.device_id;
            return eventSensorId !== sensorId;
          });
          return [newEvent, ...filtered.slice(0, 99)];
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
      // Nouvel événement IA (caméra Seedoo)
      else if (message.type === 'new_ai_event' || message.event_source === 'ai_camera') {
        const aiEvent = message.event || message;
        if (!aiEvent) return;
        
        // Ajouter à la liste des événements IA
        setAiEvents(prev => [aiEvent, ...prev.slice(0, 49)]);
        
        setNewEventIds(prev => new Set([...prev, aiEvent.id]));
        setTimeout(() => {
          setNewEventIds(prev => {
            const next = new Set(prev);
            next.delete(aiEvent.id);
            return next;
          });
        }, 3000);
        
        // Alertes critiques IA
        const criticalTypes = ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion'];
        if (criticalTypes.includes(aiEvent.warning_type)) {
          const alertMessages = {
            'Fall_Detected': '🚨 Chute détectée (IA)!',
            'Violence': '⚠️ Violence détectée!',
            'Fire': '🔥 Feu détecté!',
            'Smoke': '💨 Fumée détectée!',
            'Intrusion': '🚷 Intrusion détectée!'
          };
          toast.error(alertMessages[aiEvent.warning_type] || '⚠️ Alerte IA!', {
            description: aiEvent.channel_name || aiEvent.location_path || 'Caméra IA',
            duration: 15000,
            action: aiEvent.video_url ? {
              label: 'Voir vidéo',
              onClick: () => window.open(aiEvent.video_url, '_blank')
            } : undefined
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

  // Stats incluant les événements IA
  const stats = {
    total: radarCards.length,
    online: radarCards.filter(e => {
      const status = radarStatuses[e.sensor_id];
      return status?.deviceOnline !== false;
    }).length,
    falls: radarCards.filter(e => e.type === 'FALL').length,
    aiEvents: aiEvents.length,
    aiCritical: aiEvents.filter(e => ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion'].includes(e.warning_type)).length
  };

  // Helper pour obtenir l'icône d'alerte IA
  const getAIWarningIcon = (warningType) => {
    switch (warningType) {
      case 'Fall_Detected': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'Violence': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'Fire': return <Flame className="h-4 w-4 text-orange-500" />;
      case 'Smoke': return <Flame className="h-4 w-4 text-gray-500" />;
      case 'Intrusion': return <Eye className="h-4 w-4 text-orange-600" />;
      case 'Person_Detected': return <User className="h-4 w-4 text-blue-500" />;
      default: return <Camera className="h-4 w-4 text-green-500" />;
    }
  };

  // Helper pour le badge de sévérité
  const getAISeverityBadge = (warningType) => {
    const critical = ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion'];
    const medium = ['Loitering', 'Person_Detected'];
    if (critical.includes(warningType)) return <Badge className="bg-red-500 text-xs">Critique</Badge>;
    if (medium.includes(warningType)) return <Badge className="bg-yellow-500 text-xs">Moyen</Badge>;
    return <Badge className="bg-green-500 text-xs">Normal</Badge>;
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
      {/* Header compact - uniquement indicateur temps réel et bouton refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className="h-5 w-5 text-primary" />
            {connected && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-muted-foreground">
              {radarCards.length === 0 
                ? 'En attente d\'événements...'
                : `${stats.online}/${stats.total} radar${stats.total > 1 ? 's' : ''}`
              }
              {stats.falls > 0 && (
                <span className="text-red-500 font-medium ml-2">
                  • {stats.falls} chute{stats.falls > 1 ? 's' : ''}
                </span>
              )}
            </span>
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
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

        {/* Tabs pour filtrer par type de capteur */}
        <Tabs value={activeView} onValueChange={setActiveView}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-7 px-3">
              Tous ({radarCards.length + aiEvents.length})
            </TabsTrigger>
            <TabsTrigger value="radars" className="text-xs h-7 px-3">
              <Radio className="h-3 w-3 mr-1" />
              Radars ({radarCards.length})
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs h-7 px-3">
              <Camera className="h-3 w-3 mr-1" />
              IA ({aiEvents.length})
              {stats.aiCritical > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">
                  {stats.aiCritical}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Alertes actives en temps reel */}
      <ActiveAlertsSection />

      {/* Grille compacte de radars - TEMPS REEL UNIQUEMENT */}
      {(activeView === 'all' || activeView === 'radars') && (
      <Card>
        <CardHeader className="border-b border-border py-2 px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Radio className="h-4 w-4 text-primary" />
            Radars en présence ({radarCards.length})
            {connected && (
              <span className="ml-2 flex items-center gap-1 text-xs text-green-600 font-normal">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                temps réel
              </span>
            )}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-3">
          {radarCards.length === 0 ? (
            <div className="py-12 text-center">
              <div className="relative mx-auto w-12 h-12 mb-3">
                <Radio className="h-12 w-12 text-muted-foreground/20" />
                {connected && (
                  <span className="absolute top-0 right-0 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {connected ? 'En attente de présence...' : 'Connexion en cours...'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Les radars apparaîtront dès détection de présence
              </p>
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
                
                // Présence active si type PRESENCE et presence_detected === true
                const presenceActive = event.type === 'PRESENCE' && event.presence_detected === true;
                
                // Timestamp du dernier événement
                const lastEventTime = event.timestamp || event.occurred_at;
                
                return (
                  <RadarStatusCard
                    key={event.sensor_id || event.id}
                    radarName={radarName}
                    isOnline={radarStatus.deviceOnline !== false}
                    eventType={event.type}
                    presenceActive={presenceActive}
                    lastEventTime={lastEventTime}
                    isNew={newEventIds.has(event.id)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Section événements IA - Caméras Seedoo */}
      {(activeView === 'all' || activeView === 'ai') && (
      <Card>
        <CardHeader className="border-b border-border py-2 px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4 text-purple-500" />
            Événements IA ({aiEvents.length})
            {stats.aiCritical > 0 && (
              <Badge className="bg-red-500 ml-2">{stats.aiCritical} critique{stats.aiCritical > 1 ? 's' : ''}</Badge>
            )}
            {connected && (
              <span className="ml-2 flex items-center gap-1 text-xs text-green-600 font-normal">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                temps réel
              </span>
            )}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-3">
          {aiEvents.length === 0 ? (
            <div className="py-12 text-center">
              <div className="relative mx-auto w-12 h-12 mb-3">
                <Camera className="h-12 w-12 text-muted-foreground/20" />
                {connected && (
                  <span className="absolute top-0 right-0 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {connected ? 'En attente d\'événements IA...' : 'Connexion en cours...'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Les alertes des caméras Seedoo apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {aiEvents.slice(0, 20).map((event) => (
                <Card 
                  key={event.id} 
                  className={cn(
                    "overflow-hidden transition-all duration-300",
                    newEventIds.has(event.id) && "ring-2 ring-purple-500 shadow-lg",
                    ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion'].includes(event.warning_type) && "border-red-500/50"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getAIWarningIcon(event.warning_type)}
                        <div>
                          <p className="font-medium text-sm truncate max-w-[150px]">
                            {event.channel_name || 'Caméra IA'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      {getAISeverityBadge(event.warning_type)}
                    </div>
                    
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {event.warning_type?.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(event.confidence * 100)}%
                        </span>
                      </div>
                      
                      {event.video_url && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => window.open(event.video_url, '_blank')}
                        >
                          <Video className="h-3 w-3 mr-1" />
                          Vidéo
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

export default LivePage;
