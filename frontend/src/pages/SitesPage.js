import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sitesAPI, zonesAPI, sensorsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, getSensorStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  MapPin,
  Building2,
  Layers,
  Cpu,
  Plus,
  ChevronRight,
  ChevronDown,
  Loader2
} from 'lucide-react';

export function SitesPage() {
  const { t } = useTranslation();
  const { canManageSensors, user } = useAuth();
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSites, setExpandedSites] = useState(new Set());
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', address: '' });
  const [newZone, setNewZone] = useState({ name: '', site_id: '', floor: '', description: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sitesRes, zonesRes, sensorsRes] = await Promise.all([
        sitesAPI.list(),
        zonesAPI.list(),
        sensorsAPI.list()
      ]);
      setSites(sitesRes.data);
      setZones(zonesRes.data);
      setSensors(sensorsRes.data);
      setExpandedSites(new Set(sitesRes.data.map(s => s.id)));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSite = async () => {
    try {
      await sitesAPI.create({
        ...newSite,
        tenant_id: user?.tenant_id
      });
      toast.success(t('sites.site_created'));
      setSiteDialogOpen(false);
      setNewSite({ name: '', address: '' });
      fetchData();
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleCreateZone = async () => {
    try {
      await zonesAPI.create(newZone);
      toast.success(t('sites.zone_created'));
      setZoneDialogOpen(false);
      setNewZone({ name: '', site_id: '', floor: '', description: '' });
      fetchData();
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const toggleSite = (siteId) => {
    setExpandedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  };

  const getSiteZones = (siteId) => zones.filter(z => z.site_id === siteId);
  const getZoneSensors = (zoneId) => sensors.filter(s => s.zone_id === zoneId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="sites-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('sites.title')} & {t('sites.zones_title')}</h1>
            <p className="text-muted-foreground">
              {sites.length} {t('sites.title').toLowerCase()}, {zones.length} {t('sites.zones_title').toLowerCase()}
            </p>
          </div>
        </div>
        
        {canManageSensors && (
          <div className="flex items-center gap-2">
            <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="add-site-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('add')} Site
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('add')} Site</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('sites.name')}</Label>
                    <Input
                      value={newSite.name}
                      onChange={(e) => setNewSite(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Bâtiment A"
                      data-testid="site-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sites.address')}</Label>
                    <Input
                      value={newSite.address}
                      onChange={(e) => setNewSite(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="12 Rue des Lilas, 75015 Paris"
                      data-testid="site-address-input"
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleCreateSite}
                    disabled={!newSite.name}
                    data-testid="create-site-submit"
                  >
                    {t('save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-zone-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('add')} Zone
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('add')} Zone</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('sites.name')}</Label>
                    <Input
                      value={newZone.name}
                      onChange={(e) => setNewZone(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Couloir Étage 1"
                      data-testid="zone-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Site</Label>
                    <select
                      className="w-full p-2 rounded-md border border-input bg-background"
                      value={newZone.site_id}
                      onChange={(e) => setNewZone(prev => ({ ...prev, site_id: e.target.value }))}
                      data-testid="zone-site-select"
                    >
                      <option value="">Select site...</option>
                      {sites.map(site => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('sites.floor')}</Label>
                      <Input
                        value={newZone.floor}
                        onChange={(e) => setNewZone(prev => ({ ...prev, floor: e.target.value }))}
                        placeholder="1"
                        data-testid="zone-floor-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('sites.description')}</Label>
                    <Input
                      value={newZone.description}
                      onChange={(e) => setNewZone(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Zone de surveillance..."
                      data-testid="zone-description-input"
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleCreateZone}
                    disabled={!newZone.name || !newZone.site_id}
                    data-testid="create-zone-submit"
                  >
                    {t('save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {sites.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t('sites.no_sites')}
            </CardContent>
          </Card>
        ) : (
          sites.map((site) => (
            <Card key={site.id} data-testid={`site-card-${site.id}`}>
              <Collapsible
                open={expandedSites.has(site.id)}
                onOpenChange={() => toggleSite(site.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedSites.has(site.id) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{site.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{site.address}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <Badge variant="outline">
                          <Layers className="h-3 w-3 mr-1" />
                          {getSiteZones(site.id).length} {t('sites.zones_title')}
                        </Badge>
                        <Badge variant="outline">
                          <Cpu className="h-3 w-3 mr-1" />
                          {sensors.filter(s => s.site_id === site.id).length} {t('sensors.title')}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {getSiteZones(site.id).length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        {t('sites.no_zones')}
                      </p>
                    ) : (
                      <div className="space-y-3 ml-8">
                        {getSiteZones(site.id).map((zone) => (
                          <div
                            key={zone.id}
                            className="p-4 rounded-lg border bg-muted/30"
                            data-testid={`zone-card-${zone.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Layers className="h-4 w-4 text-secondary" />
                                <div>
                                  <p className="font-medium">{zone.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {zone.floor && `${t('sites.floor')} ${zone.floor}`}
                                    {zone.description && ` • ${zone.description}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getZoneSensors(zone.id).map((sensor) => (
                                  <Badge
                                    key={sensor.id}
                                    variant="outline"
                                    className={cn('text-xs', getSensorStatusColor(sensor.status))}
                                  >
                                    <Cpu className="h-3 w-3 mr-1" />
                                    {sensor.name}
                                  </Badge>
                                ))}
                                {getZoneSensors(zone.id).length === 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {t('sensors.no_sensors')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
