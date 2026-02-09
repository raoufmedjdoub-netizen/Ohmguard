/**
 * LiveStatePage - Real-time sensor state monitoring
 * Shows live status of all sensors with online/offline indicators
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Wifi, WifiOff, RefreshCw, Building2, Layers, 
  ChevronRight, Activity, Clock, AlertTriangle,
  Search, Filter, ArrowUpDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useLastState, useLastStateStats } from '@/hooks/useLastState';
import { 
  StatusDot, StatusBadge, SensorStatusCard, StatusStats,
  EventTypeBadge, PresenceIndicator 
} from '@/components/SensorStatusBadge';
import api from '@/lib/api';
import { toast } from 'sonner';

export function LiveStatePage() {
  const { t } = useTranslation();
  
  // Selection state
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('room');
  
  // Data hooks
  const { 
    sensors, 
    stats, 
    loading, 
    error, 
    lastUpdated, 
    refresh 
  } = useLastState({
    buildingId: selectedBuilding,
    floorId: selectedFloor,
    autoRefresh: true,
    refreshInterval: 15000 // 15 seconds for live view
  });
  
  const { stats: globalStats } = useLastStateStats(selectedBuilding);

  // Load buildings on mount
  useEffect(() => {
    loadBuildings();
  }, []);

  // Load floors when building changes
  useEffect(() => {
    if (selectedBuilding) {
      loadFloors(selectedBuilding);
      setSelectedFloor(null);
    } else {
      setFloors([]);
    }
  }, [selectedBuilding]);

  const loadBuildings = async () => {
    try {
      // Get all clients first
      const clientsResponse = await api.get('/clients');
      const clients = clientsResponse.data || [];
      
      // Get buildings for all clients
      const allBuildings = [];
      for (const client of clients) {
        const buildingsResponse = await api.get(`/clients/${client.id}/buildings`);
        const clientBuildings = (buildingsResponse.data || []).map(b => ({
          ...b,
          client_name: client.name,
          tenant_id: client.tenant_id
        }));
        allBuildings.push(...clientBuildings);
      }
      
      setBuildings(allBuildings);
      
      // Auto-select first building if available
      if (allBuildings.length > 0) {
        setSelectedBuilding(allBuildings[0].id);
      }
    } catch (err) {
      console.error('Error loading buildings:', err);
      toast.error('Erreur lors du chargement des bâtiments');
    } finally {
      setLoadingBuildings(false);
    }
  };

  const loadFloors = async (buildingId) => {
    try {
      // Find the building to get client_id
      const building = buildings.find(b => b.id === buildingId);
      if (!building) return;
      
      const response = await api.get(`/clients/${building.client_id}/buildings/${buildingId}/floors`);
      setFloors(response.data || []);
    } catch (err) {
      console.error('Error loading floors:', err);
    }
  };

  // Filter and sort sensors
  const filteredSensors = sensors
    .filter(sensor => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = sensor.sensor_name?.toLowerCase().includes(query);
        const matchesRoom = sensor.room_name?.toLowerCase().includes(query);
        const matchesSpace = sensor.space_name?.toLowerCase().includes(query);
        if (!matchesName && !matchesRoom && !matchesSpace) return false;
      }
      
      // Status filter
      if (statusFilter !== 'all' && sensor.status !== statusFilter) return false;
      
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'room':
          return (a.room_name || '').localeCompare(b.room_name || '');
        case 'status':
          const statusOrder = { online: 0, offline: 1, unknown: 2 };
          return (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2);
        case 'lastSeen':
          return (b.age_seconds || 999999) - (a.age_seconds || 999999);
        case 'name':
          return (a.sensor_name || '').localeCompare(b.sensor_name || '');
        default:
          return 0;
      }
    });

  const selectedBuildingName = buildings.find(b => b.id === selectedBuilding)?.name;
  const selectedFloorName = floors.find(f => f.id === selectedFloor)?.name;

  return (
    <div className="space-y-6" data-testid="live-state-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Accueil</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>État en direct</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            État en direct
          </h1>
          <p className="text-muted-foreground">
            Surveillance en temps réel de vos capteurs
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Mis à jour: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total capteurs</p>
                <p className="text-3xl font-bold">{stats.total}</p>
              </div>
              <Activity className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En ligne</p>
                <p className="text-3xl font-bold text-green-600">{stats.online}</p>
              </div>
              <div className="relative">
                <Wifi className="h-8 w-8 text-green-500 opacity-50" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hors ligne</p>
                <p className="text-3xl font-bold text-red-600">{stats.offline}</p>
              </div>
              <WifiOff className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inconnu</p>
                <p className="text-3xl font-bold text-gray-500">{stats.unknown}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Building selector */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedBuilding || ''}
                onValueChange={(val) => setSelectedBuilding(val || null)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sélectionner un bâtiment" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map(building => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Floor selector */}
            {floors.length > 0 && (
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedFloor || 'all'}
                  onValueChange={(val) => setSelectedFloor(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tous les étages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les étages</SelectItem>
                    {floors.map(floor => (
                      <SelectItem key={floor.id} value={floor.id}>
                        {floor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="h-6 w-px bg-border" />

            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="online">En ligne</SelectItem>
                <SelectItem value="offline">Hors ligne</SelectItem>
                <SelectItem value="unknown">Inconnu</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="room">Par chambre</SelectItem>
                <SelectItem value="status">Par statut</SelectItem>
                <SelectItem value="lastSeen">Par activité</SelectItem>
                <SelectItem value="name">Par nom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sensors Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {selectedBuildingName || 'Capteurs'}
                {selectedFloorName && ` • ${selectedFloorName}`}
              </CardTitle>
              <CardDescription>
                {filteredSensors.length} capteur{filteredSensors.length !== 1 ? 's' : ''} affiché{filteredSensors.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <StatusStats stats={stats} />
          </div>
        </CardHeader>
        <CardContent>
          {loading && !sensors.length ? (
            // Loading skeleton
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : error ? (
            // Error state
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-500 font-medium">{error}</p>
              <Button variant="outline" onClick={refresh} className="mt-4">
                Réessayer
              </Button>
            </div>
          ) : filteredSensors.length === 0 ? (
            // Empty state
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                {!selectedBuilding 
                  ? 'Sélectionnez un bâtiment pour voir les capteurs'
                  : stats.total === 0
                    ? 'Aucun capteur affecté à ce bâtiment'
                    : 'Aucun capteur ne correspond aux filtres'
                }
              </p>
              {stats.total === 0 && selectedBuilding && (
                <p className="text-xs text-muted-foreground mt-2">
                  Affectez des capteurs à ce bâtiment depuis la page Capteurs
                </p>
              )}
            </div>
          ) : (
            // Sensors grid
            <ScrollArea className="h-[500px] pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSensors.map(sensor => (
                  <SensorCard key={sensor.sensor_id} sensor={sensor} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Individual sensor card component
function SensorCard({ sensor }) {
  const status = sensor?.status || 'unknown';
  
  const statusColors = {
    online: 'border-green-500/30 bg-green-500/5',
    offline: 'border-red-500/30 bg-red-500/5',
    unknown: 'border-gray-400/30 bg-gray-400/5'
  };
  
  return (
    <div className={`rounded-lg border-2 p-4 transition-all hover:shadow-md ${statusColors[status]}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot status={status} size="md" />
          <div>
            <p className="font-medium truncate max-w-[150px]">
              {sensor.sensor_name || 'Capteur'}
            </p>
            <p className="text-xs text-muted-foreground">
              {sensor.room_name}
              {sensor.space_name && ` • ${sensor.space_name}`}
            </p>
          </div>
        </div>
        <StatusBadge status={status} size="sm" showIcon={false} />
      </div>
      
      {/* Details */}
      <div className="space-y-2 text-sm">
        {/* Presence */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Présence</span>
          <PresenceIndicator 
            detected={sensor.presence_detected} 
            targetCount={sensor.target_count}
          />
        </div>
        
        {/* Last event */}
        {sensor.last_event_type && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Dernier événement</span>
            <EventTypeBadge type={sensor.last_event_type} />
          </div>
        )}
        
        {/* Last seen */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Dernière activité</span>
          <span className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {sensor.last_seen_ago || 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default LiveStatePage;
