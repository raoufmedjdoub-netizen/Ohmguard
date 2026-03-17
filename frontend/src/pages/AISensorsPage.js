/**
 * AISensorsPage - Page for managing AI camera sensors (Seedoo)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Camera, Wifi, WifiOff, RefreshCw, Plus, Settings2, Trash2, 
  Video, AlertTriangle, Eye, Activity, Clock, MapPin, Search,
  Play, CheckCircle2, XCircle, Filter, MoreVertical
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import api, { aiSensorsAPI, aiEventsAPI } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { usePageActions } from '@/contexts/PageActionsContext';

// Warning types for AI detection
const WARNING_TYPES = [
  { value: 'Fall_Detected', label: 'Chute Détectée', color: 'bg-red-500' },
  { value: 'Violence_Detected', label: 'Violence Détectée', color: 'bg-red-700' },
  { value: 'Unattended_Bag', label: 'Bagage Abandonné', color: 'bg-amber-500' },
  { value: 'Open_Door', label: 'Porte Ouverte', color: 'bg-blue-500' },
];

const getWarningBadge = (warningType) => {
  const warning = WARNING_TYPES.find(w => w.value === warningType);
  if (!warning) return <Badge variant="outline">{warningType}</Badge>;
  return <Badge className={warning.color}>{warning.label}</Badge>;
};

const getSeverityBadge = (severity) => {
  switch (severity) {
    case 'HIGH':
      return <Badge className="bg-red-500">Haute</Badge>;
    case 'MEDIUM':
      return <Badge className="bg-yellow-500">Moyenne</Badge>;
    case 'LOW':
      return <Badge className="bg-green-500">Basse</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'ONLINE':
      return <Badge className="bg-green-500"><Wifi className="h-3 w-3 mr-1" />En ligne</Badge>;
    case 'OFFLINE':
      return <Badge variant="outline" className="text-gray-500"><WifiOff className="h-3 w-3 mr-1" />Hors ligne</Badge>;
    case 'WARNING':
      return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />Attention</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function AISensorsPage() {
  const navigate = useNavigate();
  const { lastMessage } = useWebSocket();
  
  const [sensors, setSensors] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sensors');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarningType, setSelectedWarningType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  
  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    channel: '',
    channel_name: '',
    name: '',
    confidence_threshold: 0.5,
    confidence_filter_enabled: false,
    enabled_warnings: [],
    warning_thresholds: {},
    push_notifications_enabled: true
  });
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    events_today: 0
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sensorsRes, eventsRes, countRes] = await Promise.all([
        aiSensorsAPI.list(),
        aiEventsAPI.list({ limit: 50 }),
        aiEventsAPI.count()
      ]);
      
      setSensors(sensorsRes.data);
      setEvents(eventsRes.data);
      
      // Calculate stats
      const onlineSensors = sensorsRes.data.filter(s => s.status === 'ONLINE').length;
      setStats({
        total: sensorsRes.data.length,
        online: onlineSensors,
        offline: sensorsRes.data.length - onlineSensors,
        events_today: countRes.data.count
      });
    } catch (error) {
      console.error('Failed to fetch AI sensors:', error);
      toast.error('Erreur lors du chargement des capteurs IA');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle real-time AI events
  useEffect(() => {
    if (lastMessage?.event_source === 'ai_camera') {
      setEvents(prev => [lastMessage, ...prev.slice(0, 49)]);
      toast.info(`Nouvel événement IA: ${lastMessage.warning_type}`);
    }
  }, [lastMessage]);

  const handleCreateSensor = async () => {
    try {
      await aiSensorsAPI.create(formData);
      toast.success('Capteur IA créé');
      setCreateDialogOpen(false);
      setFormData({ channel: '', channel_name: '', name: '', confidence_threshold: 0.5, confidence_filter_enabled: false, enabled_warnings: [], warning_thresholds: {}, push_notifications_enabled: true });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const handleUpdateSensor = async () => {
    if (!selectedSensor) return;
    try {
      await aiSensorsAPI.update(selectedSensor.id, {
        name: formData.name,
        confidence_threshold: formData.confidence_threshold,
        confidence_filter_enabled: formData.confidence_filter_enabled,
        enabled_warnings: formData.enabled_warnings,
        warning_thresholds: formData.warning_thresholds,
        push_notifications_enabled: formData.push_notifications_enabled
      });
      toast.success('Configuration mise à jour');
      setConfigDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteSensor = async () => {
    if (!selectedSensor) return;
    try {
      await aiSensorsAPI.delete(selectedSensor.id);
      toast.success('Capteur IA supprimé');
      setDeleteDialogOpen(false);
      setSelectedSensor(null);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const openConfigDialog = (sensor) => {
    setSelectedSensor(sensor);
    setFormData({
      channel: sensor.channel,
      channel_name: sensor.channel_name,
      name: sensor.name || '',
      confidence_threshold: sensor.confidence_threshold || 0.5,
      confidence_filter_enabled: sensor.confidence_filter_enabled === true,
      enabled_warnings: sensor.enabled_warnings || [],
      warning_thresholds: sensor.warning_thresholds || {},
      push_notifications_enabled: sensor.push_notifications_enabled !== false
    });
    setConfigDialogOpen(true);
  };

  const filteredSensors = sensors.filter(sensor => {
    if (searchQuery && !sensor.name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !sensor.channel_name?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedStatus !== 'all' && sensor.status !== selectedStatus) {
      return false;
    }
    return true;
  });

  const filteredEvents = events.filter(event => {
    if (selectedWarningType !== 'all' && event.warning_type !== selectedWarningType) {
      return false;
    }
    return true;
  });

  // Inject actions into SubNavbar
  usePageActions(
    useMemo(() => (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter
        </Button>
      </div>
    ), [loading, fetchData])
  );

  return (
    <div data-testid="ai-sensors-page" className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Capteurs</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Camera className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En ligne</p>
                <p className="text-2xl font-bold text-green-500">{stats.online}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hors ligne</p>
                <p className="text-2xl font-bold text-gray-500">{stats.offline}</p>
              </div>
              <WifiOff className="h-8 w-8 text-gray-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Événements</p>
                <p className="text-2xl font-bold text-blue-500">{stats.events_today}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sensors">Capteurs ({sensors.length})</TabsTrigger>
          <TabsTrigger value="events">Événements ({events.length})</TabsTrigger>
        </TabsList>

        {/* Sensors Tab */}
        <TabsContent value="sensors" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="ONLINE">En ligne</SelectItem>
                <SelectItem value="OFFLINE">Hors ligne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Seuil</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead>Événements</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSensors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun capteur IA trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSensors.map((sensor) => (
                    <TableRow key={sensor.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sensor.name || sensor.channel_name}</p>
                          {sensor.location_path && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {sensor.location_path}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {sensor.channel_name}
                        </code>
                      </TableCell>
                      <TableCell>{getStatusBadge(sensor.status)}</TableCell>
                      <TableCell>{Math.round(sensor.confidence_threshold * 100)}%</TableCell>
                      <TableCell>
                        {sensor.last_seen ? (
                          <span className="text-sm text-muted-foreground">
                            {new Date(sensor.last_seen).toLocaleString('fr-FR')}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sensor.event_count || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openConfigDialog(sensor)}>
                              <Settings2 className="h-4 w-4 mr-2" />
                              Configurer
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => { setSelectedSensor(sensor); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedWarningType} onValueChange={setSelectedWarningType}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type d'alerte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {WARNING_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Heure</TableHead>
                    <TableHead>Caméra</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sévérité</TableHead>
                    <TableHead>Confiance</TableHead>
                    <TableHead>Vidéo</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Aucun événement IA
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(event.timestamp).toLocaleString('fr-FR')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{event.channel_name}</p>
                        </TableCell>
                        <TableCell>{getWarningBadge(event.warning_type)}</TableCell>
                        <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${event.confidence >= 0.8 ? 'bg-green-500' : event.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${event.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-sm">{Math.round(event.confidence * 100)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.video_url ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(event.video_url, '_blank')}
                            >
                              <Video className="h-4 w-4 mr-1" />
                              Voir
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={event.status === 'NEW' ? 'default' : 'outline'}>
                            {event.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Sensor Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Capteur IA</DialogTitle>
            <DialogDescription>
              Enregistrez une nouvelle caméra Seedoo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Canal (ID technique)</Label>
              <Input
                placeholder="easy4ipcloud.com-XXX_channel_X"
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nom du canal</Label>
              <Input
                placeholder="Ex: Hall Entrée"
                value={formData.channel_name}
                onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nom personnalisé (optionnel)</Label>
              <Input
                placeholder="Ex: Caméra Accueil"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Seuil de confiance: {Math.round(formData.confidence_threshold * 100)}%</Label>
              <Slider
                value={[formData.confidence_threshold]}
                onValueChange={([v]) => setFormData({ ...formData, confidence_threshold: v })}
                min={0.1}
                max={1}
                step={0.05}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateSensor} disabled={!formData.channel || !formData.channel_name}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog - Configuration avancée */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurer le Capteur IA</DialogTitle>
            <DialogDescription>
              {selectedSensor?.channel_name}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">Général</TabsTrigger>
              <TabsTrigger value="thresholds" className="flex-1">Seuils par type</TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1">Notifications</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nom personnalisé</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Seuil global par défaut: {Math.round(formData.confidence_threshold * 100)}%</Label>
                <Slider
                  value={[formData.confidence_threshold]}
                  onValueChange={([v]) => setFormData({ ...formData, confidence_threshold: v })}
                  min={0.1}
                  max={1}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  Utilisé quand aucun seuil spécifique n&apos;est défini pour un type d&apos;alerte
                </p>
              </div>
              <div className="space-y-2">
                <Label>Types d&apos;alertes activés</Label>
                <div className="grid grid-cols-2 gap-2">
                  {WARNING_TYPES.map(type => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <Switch
                        checked={formData.enabled_warnings.length === 0 || formData.enabled_warnings.includes(type.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            if (formData.enabled_warnings.length > 0) {
                              setFormData({ ...formData, enabled_warnings: [...formData.enabled_warnings, type.value] });
                            }
                          } else {
                            const newWarnings = formData.enabled_warnings.length === 0 
                              ? WARNING_TYPES.filter(w => w.value !== type.value).map(w => w.value)
                              : formData.enabled_warnings.filter(w => w !== type.value);
                            setFormData({ ...formData, enabled_warnings: newWarnings });
                          }
                        }}
                      />
                      <Label className="text-sm">{type.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="thresholds" className="space-y-4 mt-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Filtrage par confiance</p>
                  <p className="text-xs text-muted-foreground">Ignorer les alertes sous le seuil de confiance</p>
                </div>
                <Switch
                  checked={formData.confidence_filter_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, confidence_filter_enabled: checked })}
                />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Définissez un seuil de confiance spécifique pour chaque type d&apos;alerte.
                Les alertes en dessous du seuil seront ignorées.
              </p>
              <div className="space-y-4">
                {WARNING_TYPES.map(type => {
                  const threshold = formData.warning_thresholds?.[type.value] ?? formData.confidence_threshold;
                  const isCritical = ['Fall_Detected', 'Violence_Detected'].includes(type.value);
                  return (
                    <div key={type.value} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={type.color + " text-xs"}>{type.label}</Badge>
                          {isCritical && <Badge variant="outline" className="text-xs text-red-500">Critique</Badge>}
                        </div>
                        <span className="text-sm font-mono">{Math.round(threshold * 100)}%</span>
                      </div>
                      <Slider
                        value={[threshold]}
                        onValueChange={([v]) => setFormData({ 
                          ...formData, 
                          warning_thresholds: { 
                            ...formData.warning_thresholds, 
                            [type.value]: v 
                          }
                        })}
                        min={0.1}
                        max={1}
                        step={0.05}
                        className={isCritical ? "[&_[role=slider]]:bg-red-500" : ""}
                      />
                    </div>
                  );
                })}
              </div>
            </TabsContent>
            
            <TabsContent value="notifications" className="space-y-4 mt-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">Notifications Push</Label>
                  <p className="text-sm text-muted-foreground">
                    Recevoir des alertes push sur mobile pour les événements critiques
                  </p>
                </div>
                <Switch
                  checked={formData.push_notifications_enabled !== false}
                  onCheckedChange={(checked) => setFormData({ ...formData, push_notifications_enabled: checked })}
                />
              </div>
              <Card className="border-amber-500/30">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Types critiques (notifications automatiques)</p>
                      <p className="text-sm text-muted-foreground">
                        Chute, Violence, Feu, Fumée, Intrusion
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleUpdateSensor}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer le Capteur IA</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer {selectedSensor?.name || selectedSensor?.channel_name} ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteSensor}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AISensorsPage;
