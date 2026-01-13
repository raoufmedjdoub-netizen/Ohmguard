import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sensorsAPI, sitesAPI, zonesAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { cn, formatRelativeTime, getSensorStatusColor } from '../../lib/utils';
import { toast } from 'sonner';
import {
  Cpu,
  Plus,
  RefreshCw,
  Search,
  Key,
  Copy,
  Wifi,
  WifiOff,
  Settings,
  Loader2
} from 'lucide-react';

export function SensorsPage() {
  const { t, i18n } = useTranslation();
  const { canManageSensors, user } = useAuth();
  const [sensors, setSensors] = useState([]);
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSensor, setNewSensor] = useState({
    name: '',
    type: 'RADAR',
    model: '',
    firmware: '',
    site_id: '',
    zone_id: '',
    tenant_id: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sensorsRes, sitesRes, zonesRes] = await Promise.all([
        sensorsAPI.list({ status: selectedStatus !== 'all' ? selectedStatus : undefined }),
        sitesAPI.list(),
        zonesAPI.list()
      ]);
      setSensors(sensorsRes.data);
      setSites(sitesRes.data);
      setZones(zonesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStatus]);

  const handleCreateSensor = async () => {
    try {
      const zone = zones.find(z => z.id === newSensor.zone_id);
      const site = sites.find(s => s.id === newSensor.site_id);
      
      await sensorsAPI.create({
        ...newSensor,
        tenant_id: user?.tenant_id || site?.tenant_id
      });
      
      toast.success(t('sensors.sensor_created'));
      setDialogOpen(false);
      setNewSensor({ name: '', type: 'RADAR', model: '', firmware: '', site_id: '', zone_id: '', tenant_id: '' });
      fetchData();
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleRotateKey = async (sensorId) => {
    try {
      const result = await sensorsAPI.rotateKey(sensorId);
      toast.success(t('sensors.key_rotated'));
      // Update local state
      setSensors(prev => prev.map(s => 
        s.id === sensorId ? { ...s, api_key: result.data.api_key } : s
      ));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const filteredSensors = sensors.filter(sensor => {
    if (searchQuery && !sensor.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getSiteZones = (siteId) => zones.filter(z => z.site_id === siteId);

  return (
    <div data-testid="sensors-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('sensors.title')}</h1>
            <p className="text-muted-foreground">
              {sensors.filter(s => s.status === 'ONLINE').length} / {sensors.length} {t('sensors.status_online').toLowerCase()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-sensors">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('refresh')}
          </Button>
          
          {canManageSensors && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-sensor-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('add')} {t('sensors.title')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('add')} {t('sensors.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('sensors.name')}</Label>
                    <Input
                      value={newSensor.name}
                      onChange={(e) => setNewSensor(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Capteur-RAD-001"
                      data-testid="sensor-name-input"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{t('sensors.type')}</Label>
                    <Select
                      value={newSensor.type}
                      onValueChange={(v) => setNewSensor(prev => ({ ...prev, type: v }))}
                    >
                      <SelectTrigger data-testid="sensor-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RADAR">{t('sensors.type_radar')}</SelectItem>
                        <SelectItem value="CAMERA">{t('sensors.type_camera')}</SelectItem>
                        <SelectItem value="IOT">{t('sensors.type_iot')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('sensors.model')}</Label>
                      <Input
                        value={newSensor.model}
                        onChange={(e) => setNewSensor(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="Vayyar Walabot"
                        data-testid="sensor-model-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('sensors.firmware')}</Label>
                      <Input
                        value={newSensor.firmware}
                        onChange={(e) => setNewSensor(prev => ({ ...prev, firmware: e.target.value }))}
                        placeholder="v1.0.0"
                        data-testid="sensor-firmware-input"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{t('events.site')}</Label>
                    <Select
                      value={newSensor.site_id}
                      onValueChange={(v) => setNewSensor(prev => ({ ...prev, site_id: v, zone_id: '' }))}
                    >
                      <SelectTrigger data-testid="sensor-site-select">
                        <SelectValue placeholder={t('events.site')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map(site => (
                          <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {newSensor.site_id && (
                    <div className="space-y-2">
                      <Label>{t('events.zone')}</Label>
                      <Select
                        value={newSensor.zone_id}
                        onValueChange={(v) => setNewSensor(prev => ({ ...prev, zone_id: v }))}
                      >
                        <SelectTrigger data-testid="sensor-zone-select">
                          <SelectValue placeholder={t('events.zone')} />
                        </SelectTrigger>
                        <SelectContent>
                          {getSiteZones(newSensor.site_id).map(zone => (
                            <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <Button 
                    className="w-full" 
                    onClick={handleCreateSensor}
                    disabled={!newSensor.name || !newSensor.site_id || !newSensor.zone_id}
                    data-testid="create-sensor-submit"
                  >
                    {t('save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="sensor-search"
              />
            </div>
            
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40" data-testid="sensor-status-filter">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="ONLINE">{t('sensors.status_online')}</SelectItem>
                <SelectItem value="OFFLINE">{t('sensors.status_offline')}</SelectItem>
                <SelectItem value="MAINTENANCE">{t('sensors.status_maintenance')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sensors Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredSensors.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('sensors.no_sensors')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('sensors.name')}</TableHead>
                  <TableHead>{t('sensors.type')}</TableHead>
                  <TableHead>{t('sensors.model')}</TableHead>
                  <TableHead>{t('events.zone')}</TableHead>
                  <TableHead>{t('sensors.last_seen')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSensors.map((sensor) => (
                  <TableRow key={sensor.id} className="table-row-highlight" data-testid={`sensor-row-${sensor.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {sensor.status === 'ONLINE' ? (
                          <Wifi className={cn('h-4 w-4', getSensorStatusColor(sensor.status))} />
                        ) : (
                          <WifiOff className={cn('h-4 w-4', getSensorStatusColor(sensor.status))} />
                        )}
                        <Badge variant="outline" className={getSensorStatusColor(sensor.status)}>
                          {t(`sensors.status_${sensor.status.toLowerCase()}`)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{sensor.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`sensors.type_${sensor.type.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sensor.model || '-'}</TableCell>
                    <TableCell>
                      {zones.find(z => z.id === sensor.zone_id)?.name || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sensor.last_seen ? formatRelativeTime(sensor.last_seen, i18n.language) : t('time.never')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(sensor.api_key)}
                          title={t('sensors.api_key')}
                          data-testid={`copy-key-${sensor.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {canManageSensors && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRotateKey(sensor.id)}
                            title={t('sensors.rotate_key')}
                            data-testid={`rotate-key-${sensor.id}`}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
