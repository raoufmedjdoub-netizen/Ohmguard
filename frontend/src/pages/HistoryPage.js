import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api, { eventsAPI, sitesAPI } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatDate, getEventTypeColor, getSeverityColor, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Eye,
  User,
  Target,
  Building2,
  Home,
  Trash2,
  AlertTriangle
} from 'lucide-react';

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [page, setPage] = useState(0);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const limit = 20;

  // Charger les clients au démarrage
  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data)).catch(() => setClients([]));
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit,
        skip: page * limit,
        ...(selectedClient !== 'all' && { client_id: selectedClient }),
        ...(selectedBuilding !== 'all' && { building_id: selectedBuilding }),
        ...(selectedSite !== 'all' && { site_id: selectedSite }),
        ...(selectedType !== 'all' && { event_type: selectedType }),
        ...(selectedStatus !== 'all' && { status: selectedStatus }),
        ...(selectedSeverity !== 'all' && { severity: selectedSeverity })
      };
      
      const [eventsRes, countRes, sitesRes] = await Promise.all([
        eventsAPI.list(params),
        eventsAPI.count(params),
        sitesAPI.list()
      ]);
      
      setEvents(eventsRes.data);
      setTotalCount(countRes.data.count);
      setSites(sitesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [page, selectedClient, selectedBuilding, selectedSite, selectedType, selectedStatus, selectedSeverity, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    const headers = ['ID', 'Type', 'Severity', 'Status', 'Presence', 'Active Regions', 'Targets', 'Location', 'Timestamp', 'Device'];
    const rows = events.map(e => [
      e.id,
      e.type,
      e.severity,
      e.status,
      e.presence_detected ? 'Yes' : 'No',
      (e.active_regions || []).join(';') || '-',
      e.target_count || 0,
      e.location_path || '-',
      e.timestamp || e.occurred_at,
      e.device_id || e.sensor_id
    ]);
    
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ohmguard-events-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export completed');
  };

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      const response = await api.delete('/admin/events/clear');
      toast.success(`${response.data.events_deleted} événements supprimés`);
      setClearDialogOpen(false);
      setPage(0);
      fetchData();
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Seul un Super Admin peut effacer l\'historique');
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } finally {
      setClearing(false);
    }
  };

  const handleViewDetails = (eventId) => {
    navigate(`/events/${eventId}`);
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div data-testid="history-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {totalCount} {t('events.title').toLowerCase()}
        </span>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setClearDialogOpen(true)} 
            data-testid="clear-history-btn"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={totalCount === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Effacer l'historique
          </Button>
          <Button variant="outline" onClick={handleExport} data-testid="export-btn">
            <Download className="h-4 w-4 mr-2" />
            {t('export')}
          </Button>
        </div>
      </div>

      {/* Dialog de confirmation pour effacer l'historique */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Effacer l'historique
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p className="mb-4">
                Êtes-vous sûr de vouloir supprimer <strong>tous les {totalCount} événements</strong> de l'historique ?
              </p>
              <p className="text-red-600 font-medium">
                Cette action est irréversible. Toutes les données d'événements seront définitivement supprimées.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleClearHistory} disabled={clearing}>
              {clearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Confirmer la suppression
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('filter')}:</span>
            </div>
            
            {/* Filtre Client */}
            <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedBuilding('all'); setPage(0); }}>
              <SelectTrigger className="w-44" data-testid="filter-client">
                <Home className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('history.client', 'Client')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Filtre Bâtiment (dépend du client) */}
            <Select 
              value={selectedBuilding} 
              onValueChange={(v) => { setSelectedBuilding(v); setPage(0); }}
              disabled={selectedClient === 'all'}
            >
              <SelectTrigger className="w-44" data-testid="filter-building">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('history.building', 'Bâtiment')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {buildings.map(building => (
                  <SelectItem key={building.id} value={building.id}>{building.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Recherche */}
            <div className="relative flex-1 min-w-40 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-input"
              />
            </div>
            
            {/* Type d'événement */}
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setPage(0); }}>
              <SelectTrigger className="w-32" data-testid="filter-type">
                <SelectValue placeholder={t('events.event_type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="FALL">{t('events.type_fall')}</SelectItem>
                <SelectItem value="PRE_FALL">{t('events.type_pre_fall')}</SelectItem>
                <SelectItem value="PRESENCE">{t('events.type_presence')}</SelectItem>
                <SelectItem value="INACTIVITY">{t('events.type_inactivity')}</SelectItem>
                <SelectItem value="UNKNOWN">{t('events.type_unknown')}</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Gravité */}
            <Select value={selectedSeverity} onValueChange={(v) => { setSelectedSeverity(v); setPage(0); }}>
              <SelectTrigger className="w-32" data-testid="filter-severity">
                <SelectValue placeholder={t('events.severity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="HIGH">{t('events.severity_high')}</SelectItem>
                <SelectItem value="MED">{t('events.severity_med')}</SelectItem>
                <SelectItem value="LOW">{t('events.severity_low')}</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Statut */}
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(0); }}>
              <SelectTrigger className="w-32" data-testid="filter-status">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="NEW">{t('events.status_new')}</SelectItem>
                <SelectItem value="ACK">{t('events.status_ack')}</SelectItem>
                <SelectItem value="RESOLVED">{t('events.status_resolved')}</SelectItem>
                <SelectItem value="FALSE_ALARM">{t('events.status_false_alarm')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('events.no_events')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('events.event_type')}</TableHead>
                  <TableHead>{t('events.severity')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {t('events.location')}
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {t('events.presence')}
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {t('events.target_count')}
                    </div>
                  </TableHead>
                  <TableHead>{t('events.timestamp')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const activeRegions = event.active_regions || [];
                  const targetCount = event.target_count || 0;
                  const presenceDetected = event.presence_detected;
                  const locationPath = event.location_path;
                  
                  return (
                    <TableRow 
                      key={event.id} 
                      className="table-row-highlight"
                      data-testid={`history-row-${event.id}`}
                    >
                      <TableCell>
                        <Badge className={cn('font-mono', getEventTypeColor(event.type))}>
                          {t(`events.type_${event.type?.toLowerCase() || 'unknown'}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getSeverityColor(event.severity)}>
                          {t(`events.severity_${event.severity?.toLowerCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('border', getStatusColor(event.status))}>
                          {t(`events.status_${event.status?.toLowerCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          {locationPath ? (
                            <span className="text-xs text-primary font-medium truncate block" title={locationPath}>
                              {locationPath}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            presenceDetected 
                              ? 'bg-success/20 text-success border-success/50' 
                              : 'bg-muted/50 text-muted-foreground border-muted'
                          )}
                        >
                          {presenceDetected ? t('yes') : t('no')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {targetCount > 0 
                            ? targetCount 
                            : <span className="text-muted-foreground">0</span>
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatDate(event.timestamp || event.occurred_at, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleViewDetails(event.id)}
                          data-testid={`view-btn-${event.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  data-testid="prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  data-testid="next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
