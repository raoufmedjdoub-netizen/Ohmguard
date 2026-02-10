import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Wifi, WifiOff, Radio, RefreshCw, Activity, 
  Clock, Plus, Copy, Key, 
  Trash2, Search, MapPin, Sliders, Building2, AlertCircle, Link2, Upload,
  CheckSquare, Square, Settings2, Send
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import api, { sensorsAPI } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import SensorImportModal from '@/components/SensorImportModal';

export function RadarsPage() {
  const { t } = useTranslation();
  const { lastMessage } = useWebSocket();
  const navigate = useNavigate();
  const [mqttStatus, setMqttStatus] = useState(null);
  const [radars, setRadars] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Selection for bulk operations
  const [selectedRadars, setSelectedRadars] = useState(new Set());
  const [updateBaseUrlDialogOpen, setUpdateBaseUrlDialogOpen] = useState(false);
  const [newBaseUrl, setNewBaseUrl] = useState('http://auth.ohmguard.fr:5051');
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);
  
  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedRadar, setSelectedRadar] = useState(null);
  const [selectedType, setSelectedType] = useState('all');
  
  // Assignment form
  const [assignmentData, setAssignmentData] = useState({
    clientId: '',
    buildingId: '',
    floorId: '',
    roomId: '',
    spaceId: ''
  });
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [spaces, setSpaces] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sensorsRes, clientsRes, statusRes] = await Promise.all([
        api.get('/sensors'),
        api.get('/clients'),
        api.get('/mqtt/status').catch(() => ({ data: null }))
      ]);
      
      setRadars(sensorsRes.data);
      setClients(clientsRes.data);
      
      if (statusRes.data) {
        setMqttStatus(statusRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle WebSocket messages - update specific sensor instead of refetching all
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'sensor_status') {
        // Update only the specific sensor status
        const sensorId = lastMessage.sensor_id;
        if (sensorId) {
          setRadars(prev => prev.map(r => 
            r.id === sensorId ? { ...r, status: lastMessage.status, last_seen: lastMessage.timestamp } : r
          ));
        }
      } else if (lastMessage.type === 'sensor_registered') {
        // Only refetch if a new sensor is registered
        fetchData();
      } else if (lastMessage.type === 'presence_update') {
        // Update presence state for specific sensor
        const sensorId = lastMessage.sensor_id;
        if (sensorId) {
          setRadars(prev => prev.map(r => 
            r.id === sensorId ? { 
              ...r, 
              presence_detected: lastMessage.presence_detected,
              last_seen: lastMessage.timestamp 
            } : r
          ));
        }
      }
      // Ignore 'new_event' to avoid constant refetches
    }
  }, [lastMessage]);

  // Fetch buildings when client is selected
  useEffect(() => {
    if (assignmentData.clientId) {
      api.get(`/clients/${assignmentData.clientId}/buildings`).then(res => {
        setBuildings(res.data);
        setFloors([]);
        setRooms([]);
        setSpaces([]);
      });
    }
  }, [assignmentData.clientId]);

  // Fetch floors when building is selected
  useEffect(() => {
    if (assignmentData.buildingId) {
      api.get(`/buildings/${assignmentData.buildingId}/floors`).then(res => {
        setFloors(res.data);
        setRooms([]);
        setSpaces([]);
      });
    }
  }, [assignmentData.buildingId]);

  // Fetch rooms when floor is selected
  useEffect(() => {
    if (assignmentData.floorId) {
      api.get(`/floors/${assignmentData.floorId}/rooms`).then(res => {
        setRooms(res.data);
        setSpaces([]);
      });
    }
  }, [assignmentData.floorId]);

  // Fetch spaces when room is selected
  useEffect(() => {
    if (assignmentData.roomId) {
      api.get(`/rooms/${assignmentData.roomId}`).then(res => {
        setSpaces(res.data.spaces || []);
      });
    }
  }, [assignmentData.roomId]);

  const handleAssignRadar = async () => {
    if (!selectedRadar || !assignmentData.clientId) {
      toast.error('Veuillez sélectionner au moins un client');
      return;
    }
    
    try {
      await api.post(`/radars/${selectedRadar.id}/assign`, {
        client_id: assignmentData.clientId,
        building_id: assignmentData.buildingId || null,
        floor_id: assignmentData.floorId || null,
        room_id: assignmentData.roomId || null,
        room_space_id: assignmentData.spaceId || null
      });
      
      toast.success('Radar affecté avec succès');
      setAssignDialogOpen(false);
      setSelectedRadar(null);
      setAssignmentData({ clientId: '', buildingId: '', floorId: '', roomId: '', spaceId: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'affectation');
    }
  };

  const handleUnassignRadar = async (radarId) => {
    try {
      await api.post(`/radars/${radarId}/unassign`);
      toast.success('Radar désaffecté');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la désaffectation');
    }
  };

  const handleDeleteRadar = async () => {
    if (!selectedRadar) return;
    
    try {
      await sensorsAPI.delete(selectedRadar.id);
      toast.success('Radar supprimé');
      setDeleteDialogOpen(false);
      setSelectedRadar(null);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Selection handlers for bulk operations
  const toggleRadarSelection = (radarId) => {
    setSelectedRadars(prev => {
      const newSet = new Set(prev);
      if (newSet.has(radarId)) {
        newSet.delete(radarId);
      } else {
        newSet.add(radarId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = paginatedRadars.map(r => r.id);
    setSelectedRadars(prev => {
      const newSet = new Set(prev);
      visibleIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const deselectAll = () => {
    setSelectedRadars(new Set());
  };

  const selectByBuilding = (buildingId) => {
    const buildingRadarIds = radars
      .filter(r => r.building_id === buildingId)
      .map(r => r.id);
    setSelectedRadars(prev => {
      const newSet = new Set(prev);
      buildingRadarIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const selectByFloor = (floorId) => {
    const floorRadarIds = radars
      .filter(r => r.floor_id === floorId)
      .map(r => r.id);
    setSelectedRadars(prev => {
      const newSet = new Set(prev);
      floorRadarIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredRadars.map(r => r.id);
    setSelectedRadars(new Set(allFilteredIds));
  };

  // Bulk UpdateBaseUrl command
  const handleBulkUpdateBaseUrl = async () => {
    if (selectedRadars.size === 0) {
      toast.error('Veuillez sélectionner au moins un radar');
      return;
    }
    
    if (!newBaseUrl.trim()) {
      toast.error('Veuillez entrer une URL valide');
      return;
    }
    
    setBulkOperationLoading(true);
    
    try {
      // Get platform sensor IDs for selected radars
      const sensorIds = radars
        .filter(r => selectedRadars.has(r.id))
        .map(r => r.id)
        .filter(Boolean);
      
      if (sensorIds.length === 0) {
        toast.error('Aucun radar sélectionné');
        return;
      }
      
      const response = await api.post('/devices/bulk-command', {
        device_ids: sensorIds,
        command_type: 8, // UpdateBaseUrl
        params: { baseUrl: newBaseUrl.trim() }
      });
      
      const result = response.data;
      
      if (result.success_count > 0) {
        toast.success(`Commande envoyée à ${result.success_count}/${result.total} radars`);
      }
      
      if (result.failed_count > 0) {
        toast.error(`Échec pour ${result.failed_count} radars`);
      }
      
      setUpdateBaseUrlDialogOpen(false);
      setSelectedRadars(new Set());
      
    } catch (error) {
      console.error('Bulk command error:', error);
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'envoi des commandes');
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleRotateKey = async (radarId) => {
    try {
      await api.post(`/sensors/${radarId}/rotate-key`);
      toast.success('Clé API régénérée');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la régénération');
    }
  };

  const copyApiKey = (key) => {
    if (key) {
      navigator.clipboard.writeText(key);
      toast.success('Clé API copiée');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      ONLINE: { className: 'bg-green-500', label: 'En ligne' },
      OFFLINE: { className: 'bg-red-500', label: 'Hors ligne' },
      MAINTENANCE: { className: 'bg-amber-500', label: 'Maintenance' }
    };
    const c = config[status] || config.OFFLINE;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getAssignmentBadge = (radar) => {
    if (radar.client_id || radar.room_space_id) {
      return <Badge className="bg-blue-500">Affecté</Badge>;
    }
    return <Badge variant="outline" className="border-amber-500 text-amber-500">En attente</Badge>;
  };

  // Badge type capteur
  const getSensorTypeBadge = (type) => {
    const types = {
      'RADAR': { label: 'Radar détection chute', className: 'bg-purple-500 text-white', icon: '📡' },
      'CAMERA': { label: 'Caméra', className: 'bg-blue-500 text-white', icon: '📷' },
      'MOTION': { label: 'Détecteur mouvement', className: 'bg-amber-500 text-white', icon: '🔄' },
      'DOOR': { label: 'Capteur porte', className: 'bg-cyan-500 text-white', icon: '🚪' },
      'OTHER': { label: 'Autre', className: 'bg-gray-500 text-white', icon: '📦' }
    };
    const config = types[type] || types.OTHER;
    return (
      <Badge className={config.className}>
        <span className="mr-1">{config.icon}</span>
        {config.label}
      </Badge>
    );
  };

  const getLocationDisplay = (radar) => {
    if (!radar.client_id) {
      return <span className="text-amber-500 italic">Non affecté</span>;
    }
    
    // Build location path
    const client = clients.find(c => c.id === radar.client_id);
    const parts = [];
    if (client) parts.push(client.name);
    
    // We would need to fetch these, but for now show what we have
    if (radar.location_path) {
      return <span className="text-sm">{radar.location_path}</span>;
    }
    
    if (parts.length > 0) {
      return <span className="text-sm text-primary">{parts.join(' > ')}</span>;
    }
    
    return <span className="text-muted-foreground">Client #{radar.client_id?.substring(0, 8)}</span>;
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Jamais';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString('fr-FR');
  };

  // Filtering
  const filteredRadars = radars.filter(radar => {
    const matchesSearch = !searchQuery || 
      radar.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      radar.serial_product?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      radar.device_id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || radar.status === selectedStatus;
    const matchesAssignment = selectedAssignment === 'all' || 
      (selectedAssignment === 'PENDING' && !radar.client_id) ||
      (selectedAssignment === 'ASSIGNED' && radar.client_id);
    const matchesType = selectedType === 'all' || radar.type === selectedType;
    return matchesSearch && matchesStatus && matchesAssignment && matchesType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredRadars.length / itemsPerPage);
  const paginatedRadars = filteredRadars.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus, selectedAssignment, selectedType, itemsPerPage]);

  // Stats
  const onlineCount = radars.filter(r => r.status === 'ONLINE').length;
  const pendingCount = radars.filter(r => !r.client_id).length;
  const assignedCount = radars.filter(r => r.client_id).length;

  return (
    <div className="space-y-6" data-testid="radars-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('radars.title')}</h1>
          <p className="text-muted-foreground">{t('radars.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* MQTT Status */}
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {mqttStatus?.connected ? (
                  <div className="p-2 rounded-full bg-green-500/20">
                    <Wifi className="h-5 w-5 text-green-500" />
                  </div>
                ) : (
                  <div className="p-2 rounded-full bg-red-500/20">
                    <WifiOff className="h-5 w-5 text-red-500" />
                  </div>
                )}
                <div>
                  <p className="font-semibold">Connexion MQTT</p>
                  <p className="text-xs text-muted-foreground">
                    {mqttStatus?.broker_host}:{mqttStatus?.broker_port}
                  </p>
                </div>
              </div>
              <Badge className={mqttStatus?.connected ? 'bg-green-500' : 'bg-red-500'}>
                {mqttStatus?.connected ? 'Connecté' : 'Déconnecté'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        {/* Total Radars */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Radars</p>
                <p className="text-2xl font-bold">{radars.length}</p>
              </div>
              <Radio className="h-8 w-8 text-primary/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {onlineCount} en ligne
            </p>
          </CardContent>
        </Card>
        
        {/* Pending Assignment */}
        <Card className={pendingCount > 0 ? "border-amber-500/50" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              À affecter
            </p>
          </CardContent>
        </Card>
        
        {/* Assigned */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Affectés</p>
                <p className="text-2xl font-bold text-blue-500">{assignedCount}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Localisés
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, série, device ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type capteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="RADAR">Radar détection</SelectItem>
            <SelectItem value="CAMERA">Caméra</SelectItem>
            <SelectItem value="MOTION">Mouvement</SelectItem>
            <SelectItem value="DOOR">Porte</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="ONLINE">En ligne</SelectItem>
            <SelectItem value="OFFLINE">Hors ligne</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Affectation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="PENDING">En attente</SelectItem>
            <SelectItem value="ASSIGNED">Affectés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Selection Actions Bar */}
      {selectedRadars.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {selectedRadars.size} radar(s) sélectionné(s)
                </span>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Tout désélectionner
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => setUpdateBaseUrlDialogOpen(true)}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Modifier UpdateBaseUrl
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Selection */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Sélection rapide:</span>
        <Button variant="outline" size="sm" onClick={selectAllVisible}>
          <CheckSquare className="h-4 w-4 mr-1" />
          Page actuelle ({paginatedRadars.length})
        </Button>
        <Button variant="outline" size="sm" onClick={selectAllFiltered} className="border-primary text-primary">
          <CheckSquare className="h-4 w-4 mr-1" />
          Tous les filtrés ({filteredRadars.length})
        </Button>
        {clients.map(client => (
          client.buildings?.map(building => (
            <Button 
              key={building.id} 
              variant="outline" 
              size="sm"
              onClick={() => selectByBuilding(building.id)}
            >
              <Building2 className="h-4 w-4 mr-1" />
              {building.name}
            </Button>
          ))
        ))}
      </div>

      {/* Radars Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={paginatedRadars.length > 0 && paginatedRadars.every(r => selectedRadars.has(r.id))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllVisible();
                      } else {
                        const visibleIds = paginatedRadars.map(r => r.id);
                        setSelectedRadars(prev => {
                          const newSet = new Set(prev);
                          visibleIds.forEach(id => newSet.delete(id));
                          return newSet;
                        });
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Capteur</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Localisation</TableHead>
                <TableHead>Affectation</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Firmware</TableHead>
                <TableHead>Dernière activité</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredRadars.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">Aucun capteur trouvé</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRadars.map(radar => (
                  <TableRow 
                    key={radar.id} 
                    data-testid={`radar-row-${radar.id}`}
                    className={selectedRadars.has(radar.id) ? 'bg-primary/5' : ''}
                  >
                    <TableCell>
                      <Checkbox 
                        checked={selectedRadars.has(radar.id)}
                        onCheckedChange={() => toggleRadarSelection(radar.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${radar.status === 'ONLINE' ? 'bg-green-500/10' : 'bg-muted'}`}>
                          <Radio className={`h-4 w-4 ${radar.status === 'ONLINE' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{radar.name}</p>
                          {radar.serial_product && (
                            <p className="text-xs text-muted-foreground font-mono">
                              SN: {radar.serial_product}
                            </p>
                          )}
                          <p className="text-xs text-primary/70 font-mono">
                            {radar.device_id?.substring(0, 24)}...
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getSensorTypeBadge(radar.type)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {getLocationDisplay(radar)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getAssignmentBadge(radar)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(radar.status)}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {radar.firmware_version || radar.firmware || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatLastSeen(radar.last_seen)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Assign/Unassign button */}
                        {!radar.client_id ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-primary"
                            onClick={() => {
                              setSelectedRadar(radar);
                              setAssignDialogOpen(true);
                            }}
                            title="Affecter"
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Affecter
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-amber-500"
                            onClick={() => handleUnassignRadar(radar.id)}
                            title="Désaffecter"
                          >
                            Désaffecter
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => navigate(`/radars/${radar.id}/config`)}
                          title="Configurer"
                        >
                          <Sliders className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => copyApiKey(radar.api_key)}
                          title="Copier clé API"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleRotateKey(radar.id)}
                          title="Régénérer clé"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => { setSelectedRadar(radar); setDeleteDialogOpen(true); }}
                          className="text-destructive hover:text-destructive"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                Affichage {filteredRadars.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredRadars.length)} sur {filteredRadars.length}
              </div>
              <Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
                <SelectTrigger className="w-[130px] h-8" data-testid="page-size-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="500">500 / page</SelectItem>
                  <SelectItem value="1000">1000 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  ««
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  «
                </Button>
                <span className="px-3 py-1 text-sm">
                  Page {currentPage} / {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  »
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                  »»
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Affecter le radar</DialogTitle>
            <DialogDescription>
              {selectedRadar?.name} - {selectedRadar?.serial_product}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select 
                value={assignmentData.clientId} 
                onValueChange={(v) => setAssignmentData({...assignmentData, clientId: v, buildingId: '', floorId: '', roomId: '', spaceId: ''})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {buildings.length > 0 && (
              <div className="space-y-2">
                <Label>Bâtiment</Label>
                <Select 
                  value={assignmentData.buildingId} 
                  onValueChange={(v) => setAssignmentData({...assignmentData, buildingId: v, floorId: '', roomId: '', spaceId: ''})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un bâtiment" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {floors.length > 0 && (
              <div className="space-y-2">
                <Label>Étage</Label>
                <Select 
                  value={assignmentData.floorId} 
                  onValueChange={(v) => setAssignmentData({...assignmentData, floorId: v, roomId: '', spaceId: ''})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un étage" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {rooms.length > 0 && (
              <div className="space-y-2">
                <Label>Chambre</Label>
                <Select 
                  value={assignmentData.roomId} 
                  onValueChange={(v) => setAssignmentData({...assignmentData, roomId: v, spaceId: ''})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une chambre" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>Ch. {r.room_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {spaces.length > 0 && (
              <div className="space-y-2">
                <Label>Espace</Label>
                <Select 
                  value={assignmentData.spaceId} 
                  onValueChange={(v) => setAssignmentData({...assignmentData, spaceId: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un espace" />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name || s.space_type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAssignRadar}>Affecter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le radar</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer {selectedRadar?.name} ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteRadar}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <SensorImportModal 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen}
        onImportComplete={fetchData}
      />

      {/* Update Base URL Dialog */}
      <Dialog open={updateBaseUrlDialogOpen} onOpenChange={setUpdateBaseUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Modifier UpdateBaseUrl
            </DialogTitle>
            <DialogDescription>
              Cette commande sera envoyée à {selectedRadars.size} radar(s) sélectionné(s).
              Chaque radar recevra une commande MQTT pour mettre à jour son URL de base.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Nouvelle URL de base</Label>
              <Input 
                id="baseUrl"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
                placeholder="http://auth.ohmguard.fr:5051"
              />
              <p className="text-xs text-muted-foreground">
                Format: http://hostname:port ou https://hostname:port
              </p>
            </div>
            
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm font-medium mb-2">Radars sélectionnés:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {radars
                  .filter(r => selectedRadars.has(r.id))
                  .slice(0, 10)
                  .map(r => (
                    <div key={r.id} className="text-xs flex items-center gap-2">
                      <Radio className="h-3 w-3" />
                      <span>{r.name}</span>
                      <span className="text-muted-foreground">({r.device_id?.substring(0, 15)}...)</span>
                    </div>
                  ))
                }
                {selectedRadars.size > 10 && (
                  <p className="text-xs text-muted-foreground">
                    ... et {selectedRadars.size - 10} autres
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setUpdateBaseUrlDialogOpen(false)}
              disabled={bulkOperationLoading}
            >
              Annuler
            </Button>
            <Button 
              onClick={handleBulkUpdateBaseUrl}
              disabled={bulkOperationLoading || !newBaseUrl.trim()}
            >
              {bulkOperationLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer la commande
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RadarsPage;
