import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Wifi, WifiOff, Radio, RefreshCw, Settings, Activity, 
  Thermometer, Clock, MemoryStick, Plus, Copy, Key, 
  Trash2, Edit, Search, MapPin, Sliders
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import api, { sensorsAPI, sitesAPI, zonesAPI } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';

export function RadarsPage() {
  const { t } = useTranslation();
  const { lastMessage } = useWebSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mqttStatus, setMqttStatus] = useState(null);
  const [radars, setRadars] = useState([]);
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRadar, setSelectedRadar] = useState(null);
  
  // Form states
  const [newRadar, setNewRadar] = useState({
    name: '',
    serial_product: '',  // Serial number for identification
    device_id: '',       // MQTT device ID for communications
    model: '',
    firmware: '',
    site_id: '',
    zone_id: ''
  });
  const [newDeviceId, setNewDeviceId] = useState('');
  const [selectedRadarId, setSelectedRadarId] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sensorsRes, sitesRes, zonesRes, statusRes] = await Promise.all([
        api.get('/sensors'),
        sitesAPI.list(),
        zonesAPI.list(),
        api.get('/mqtt/status').catch(() => ({ data: null }))
      ]);
      
      // All sensors are now RADAR type only
      setRadars(sensorsRes.data);
      setSites(sitesRes.data);
      setZones(zonesRes.data);
      
      if (statusRes.data) {
        setMqttStatus(statusRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('radars.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'sensor_status' || lastMessage.type === 'sensor_registered' || lastMessage.type === 'new_event') {
        fetchData();
      }
    }
  }, [lastMessage]);

  const handleAddRadar = async () => {
    if (!newRadar.serial_product || !newRadar.site_id || !newRadar.zone_id) {
      toast.error(t('radars.fillRequired'));
      return;
    }
    
    try {
      const tenantId = user?.tenant_id || sites.find(s => s.id === newRadar.site_id)?.tenant_id;
      await sensorsAPI.create({
        name: newRadar.name || `Radar ${newRadar.serial_product.slice(0, 12)}`,
        serial_product: newRadar.serial_product,
        device_id: newRadar.device_id || newRadar.serial_product,  // Use serial as device_id if not provided
        model: newRadar.model || 'Vayyar Home',
        firmware: newRadar.firmware,
        site_id: newRadar.site_id,
        zone_id: newRadar.zone_id,
        type: 'RADAR',
        tenant_id: tenantId
      });
      toast.success(t('radars.radarAdded'));
      setAddDialogOpen(false);
      setNewRadar({ name: '', serial_product: '', device_id: '', model: '', firmware: '', site_id: '', zone_id: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('radars.addError'));
    }
  };

  const handleLinkDevice = async () => {
    if (!newDeviceId || !selectedRadarId) {
      toast.error(t('radars.fillFields'));
      return;
    }
    
    try {
      await api.post(`/mqtt/register-device?device_id=${encodeURIComponent(newDeviceId)}&sensor_id=${selectedRadarId}`);
      toast.success(t('radars.deviceLinked'));
      setLinkDialogOpen(false);
      setNewDeviceId('');
      setSelectedRadarId('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('radars.linkError'));
    }
  };

  const handleDeleteRadar = async () => {
    if (!selectedRadar) return;
    
    try {
      await sensorsAPI.delete(selectedRadar.id);
      toast.success(t('radars.radarDeleted'));
      setDeleteDialogOpen(false);
      setSelectedRadar(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('radars.deleteError'));
    }
  };

  const handleRotateKey = async (radarId) => {
    try {
      const response = await sensorsAPI.rotateKey(radarId);
      toast.success(t('radars.keyRotated'));
      navigator.clipboard.writeText(response.data.api_key);
      toast.info(t('radars.keyCopied'));
      fetchData();
    } catch (error) {
      toast.error(t('radars.rotateError'));
    }
  };

  const copyApiKey = (apiKey) => {
    navigator.clipboard.writeText(apiKey);
    toast.success(t('radars.keyCopied'));
  };

  const getStatusBadge = (status) => {
    const styles = {
      ONLINE: 'bg-green-500/20 text-green-600 border-green-500/30',
      OFFLINE: 'bg-red-500/20 text-red-600 border-red-500/30',
      MAINTENANCE: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30'
    };
    const labels = {
      ONLINE: t('radars.online'),
      OFFLINE: t('radars.offline'),
      MAINTENANCE: t('radars.maintenance')
    };
    return <Badge className={styles[status] || styles.OFFLINE}>{labels[status] || status}</Badge>;
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return t('radars.never');
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000;
    
    if (diff < 60) return t('radars.justNow');
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return date.toLocaleDateString();
  };

  const getSiteName = (siteId) => sites.find(s => s.id === siteId)?.name || '-';
  const getZoneName = (zoneId) => zones.find(z => z.id === zoneId)?.name || '-';
  const getZonesForSite = (siteId) => zones.filter(z => z.site_id === siteId);

  const filteredRadars = radars.filter(radar => {
    const matchesSearch = !searchQuery || 
      radar.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      radar.model?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || radar.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const onlineCount = radars.filter(r => r.status === 'ONLINE').length;
  const offlineCount = radars.filter(r => r.status === 'OFFLINE').length;
  const mqttCount = radars.filter(r => r.model?.startsWith('id_')).length;

  return (
    <div className="space-y-6" data-testid="radars-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('radars.title')}</h1>
          <p className="text-muted-foreground">{t('radars.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading} data-testid="refresh-btn">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="link-device-btn">
                <Wifi className="h-4 w-4 mr-2" />
                {t('radars.linkDevice')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('radars.linkDeviceTitle')}</DialogTitle>
                <DialogDescription>{t('radars.linkDeviceDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{t('radars.deviceId')}</Label>
                  <Input 
                    placeholder="id_QTg6MDM6..." 
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.targetRadar')}</Label>
                  <Select value={selectedRadarId} onValueChange={setSelectedRadarId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('radars.selectRadar')} />
                    </SelectTrigger>
                    <SelectContent>
                      {radars.map(radar => (
                        <SelectItem key={radar.id} value={radar.id}>{radar.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleLinkDevice} className="w-full">{t('radars.link')}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-radar-btn">
                <Plus className="h-4 w-4 mr-2" />
                {t('radars.addRadar')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('radars.addRadarTitle')}</DialogTitle>
                <DialogDescription>{t('radars.addRadarDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{t('radars.name')} *</Label>
                  <Input 
                    placeholder="Radar Chambre 101"
                    value={newRadar.name}
                    onChange={(e) => setNewRadar({...newRadar, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.serialProduct')} *</Label>
                  <Input 
                    placeholder="VPRD-XXXX-XXXX"
                    value={newRadar.serial_product}
                    onChange={(e) => setNewRadar({...newRadar, serial_product: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">{t('radars.serialProductHelp')}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.mqttDeviceId')}</Label>
                  <Input 
                    placeholder="id_QTg6MDM6MkE6..."
                    value={newRadar.device_id}
                    onChange={(e) => setNewRadar({...newRadar, device_id: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">{t('radars.mqttDeviceIdHelp')}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('radars.model')}</Label>
                    <Input 
                      placeholder="Vayyar Home"
                      value={newRadar.model}
                      onChange={(e) => setNewRadar({...newRadar, model: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('radars.firmware')}</Label>
                    <Input 
                      placeholder="v1.0.0"
                      value={newRadar.firmware}
                      onChange={(e) => setNewRadar({...newRadar, firmware: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.site')} *</Label>
                  <Select 
                    value={newRadar.site_id} 
                    onValueChange={(v) => setNewRadar({...newRadar, site_id: v, zone_id: ''})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('radars.selectSite')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(site => (
                        <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('radars.zone')} *</Label>
                  <Select 
                    value={newRadar.zone_id} 
                    onValueChange={(v) => setNewRadar({...newRadar, zone_id: v})}
                    disabled={!newRadar.site_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('radars.selectZone')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getZonesForSite(newRadar.site_id).map(zone => (
                        <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddRadar} className="w-full">{t('radars.add')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* MQTT Status + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2 border-primary/20" data-testid="mqtt-status-card">
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
                  <p className="font-semibold">{t('radars.mqttConnection')}</p>
                  <p className="text-sm text-muted-foreground">
                    {mqttStatus?.broker_host}:{mqttStatus?.broker_port}
                  </p>
                </div>
              </div>
              <Badge className={mqttStatus?.connected ? 'bg-green-500' : 'bg-red-500'}>
                {mqttStatus?.connected ? t('radars.connected') : t('radars.disconnected')}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('radars.totalRadars')}</p>
                <p className="text-2xl font-bold">{radars.length}</p>
              </div>
              <div className="p-2 rounded-full bg-primary/10">
                <Radio className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {mqttCount} {t('radars.autoDetected')}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('radars.onlineStatus')}</p>
                <p className="text-2xl font-bold text-green-500">{onlineCount}/{radars.length}</p>
              </div>
              <div className="p-2 rounded-full bg-green-500/10">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {offlineCount} {t('radars.offline').toLowerCase()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('radars.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('radars.allStatuses')}</SelectItem>
            <SelectItem value="ONLINE">{t('radars.online')}</SelectItem>
            <SelectItem value="OFFLINE">{t('radars.offline')}</SelectItem>
            <SelectItem value="MAINTENANCE">{t('radars.maintenance')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Radars Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('radars.name')}</TableHead>
                <TableHead>{t('radars.location')}</TableHead>
                <TableHead>{t('radars.model')}</TableHead>
                <TableHead>{t('radars.status')}</TableHead>
                <TableHead>{t('radars.lastSeen')}</TableHead>
                <TableHead className="text-right">{t('radars.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredRadars.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">{t('radars.noRadars')}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRadars.map(radar => (
                  <TableRow key={radar.id} data-testid={`radar-row-${radar.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${radar.status === 'ONLINE' ? 'bg-green-500/10' : 'bg-muted'}`}>
                          <Radio className={`h-4 w-4 ${radar.status === 'ONLINE' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{radar.name}</p>
                          {radar.model?.startsWith('id_') && (
                            <p className="text-xs text-muted-foreground font-mono">{radar.model.slice(0, 20)}...</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{getSiteName(radar.site_id)}</span>
                        <span className="text-muted-foreground">/ {getZoneName(radar.zone_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{radar.model?.startsWith('id_') ? 'Vayyar MQTT' : (radar.model || '-')}</p>
                        {radar.firmware && <p className="text-xs text-muted-foreground">{radar.firmware}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(radar.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatLastSeen(radar.last_seen)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => navigate(`/radars/${radar.id}/config`)}
                          title={t('radars.configure', 'Configure')}
                        >
                          <Sliders className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => copyApiKey(radar.api_key)}
                          title={t('radars.copyKey')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleRotateKey(radar.id)}
                          title={t('radars.rotateKey')}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => { setSelectedRadar(radar); setDeleteDialogOpen(true); }}
                          className="text-destructive hover:text-destructive"
                          title={t('radars.delete')}
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
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('radars.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('radars.deleteDesc', { name: selectedRadar?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteRadar}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Section */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2">{t('radars.howItWorks')}</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• {t('radars.info1')}</li>
            <li>• {t('radars.info2')}</li>
            <li>• {t('radars.info3')}</li>
            <li>• {t('radars.info4')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default RadarsPage;
