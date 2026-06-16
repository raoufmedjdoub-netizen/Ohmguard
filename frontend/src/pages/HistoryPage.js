import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { cn, formatDate, getEventTypeColor, getEventTypeLabel, getSeverityColor, getStatusColor } from '@/lib/utils';
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
  AlertTriangle,
  X,
  Calendar,
  CheckCircle2
} from 'lucide-react';

const FALL_STATUS_LABELS = {
  fall_detected: { label: 'Suspectée', color: 'bg-orange-500 text-white' },
  fall_confirmed: { label: 'Confirmee', color: 'bg-red-700 text-white' },
  calling: { label: 'Appel', color: 'bg-orange-500 text-white' },
  on_call: { label: 'En comm.', color: 'bg-yellow-500 text-black' },
  finished: { label: 'Termine', color: 'bg-green-600 text-white' },
  fall_exit: { label: 'Sortie', color: 'bg-blue-500 text-white' },
  canceled: { label: 'Annule', color: 'bg-gray-500 text-white' },
};

function FallStatusBadge({ status }) {
  const config = FALL_STATUS_LABELS[status] || { label: status, color: 'bg-gray-400 text-white' };
  return <Badge className={cn('text-xs', config.color)}>{config.label}</Badge>;
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [page, setPage] = useState(0);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [finishEvent, setFinishEvent] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const limit = 20;

  const hasActiveFilters = selectedClient !== 'all' || selectedBuilding !== 'all' ||
    selectedFloor !== 'all' || selectedRoom !== 'all' ||
    selectedSite !== 'all' || selectedType !== 'all' || selectedStatus !== 'all' ||
    selectedSeverity !== 'all' || startDate || endDate || searchQuery;

  // Debounce de la recherche texte (évite une requête à chaque frappe)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Charger clients + sites une seule fois au démarrage (indépendant des filtres)
  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data)).catch(() => setClients([]));
    sitesAPI.list().then(res => setSites(res.data)).catch(() => setSites([]));
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

  // Charger les étages quand un bâtiment est sélectionné
  useEffect(() => {
    if (selectedBuilding && selectedBuilding !== 'all') {
      api.get(`/buildings/${selectedBuilding}/floors`).then(res => {
        setFloors(res.data);
      }).catch(() => setFloors([]));
    } else {
      setFloors([]);
      setSelectedFloor('all');
    }
  }, [selectedBuilding]);

  // Charger les chambres quand un étage est sélectionné
  useEffect(() => {
    if (selectedFloor && selectedFloor !== 'all') {
      api.get(`/floors/${selectedFloor}/rooms`).then(res => {
        setRooms(res.data);
      }).catch(() => setRooms([]));
    } else {
      setRooms([]);
      setSelectedRoom('all');
    }
  }, [selectedFloor]);

  // Construit les paramètres de filtre (sans pagination)
  const buildFilterParams = useCallback((extra = {}) => ({
    ...(selectedClient !== 'all' && { client_id: selectedClient }),
    ...(selectedBuilding !== 'all' && { building_id: selectedBuilding }),
    ...(selectedFloor !== 'all' && { floor_id: selectedFloor }),
    ...(selectedRoom !== 'all' && { room_id: selectedRoom }),
    ...(selectedSite !== 'all' && { site_id: selectedSite }),
    ...(selectedType !== 'all' && { event_type: selectedType }),
    ...(selectedStatus !== 'all' && { status: selectedStatus }),
    ...(selectedSeverity !== 'all' && { severity: selectedSeverity }),
    ...(startDate && { start_date: new Date(`${startDate}T00:00:00`).toISOString() }),
    ...(endDate && { end_date: new Date(`${endDate}T23:59:59`).toISOString() }),
    ...(debouncedSearch && { q: debouncedSearch }),
    ...extra,
  }), [selectedClient, selectedBuilding, selectedFloor, selectedRoom, selectedSite, selectedType, selectedStatus, selectedSeverity, startDate, endDate, debouncedSearch]);

  // Revenir à la première page dès qu'un filtre change (sauf au premier rendu)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setPage(0);
  }, [buildFilterParams]);

  // Compteur : recalculé uniquement quand les filtres changent (pas à chaque page)
  useEffect(() => {
    let cancelled = false;
    eventsAPI.count(buildFilterParams())
      .then(res => { if (!cancelled) setTotalCount(res.data.count); })
      .catch(() => { if (!cancelled) setTotalCount(0); });
    return () => { cancelled = true; };
  }, [buildFilterParams]);

  // Liste des événements : dépend des filtres ET de la page
  const fetchEvents = useCallback(async (noCache = false) => {
    setLoading(true);
    try {
      const params = buildFilterParams({
        limit,
        skip: page * limit,
        ...(noCache && { no_cache: true }),
      });
      const res = await eventsAPI.list(params);
      setEvents(res.data);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams, page, t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleResetFilters = () => {
    setSelectedClient('all');
    setSelectedBuilding('all');
    setSelectedFloor('all');
    setSelectedRoom('all');
    setSelectedSite('all');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedSeverity('all');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setPage(0);
  };

  // Échappe une valeur pour le format CSV (gère virgules, guillemets, retours ligne)
  const csvCell = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Récupère l'intégralité du jeu filtré (pas seulement la page courante)
      const pageSize = 500;
      const maxRows = 10000;
      const all = [];
      let skip = 0;
      while (skip < maxRows) {
        const res = await eventsAPI.list(buildFilterParams({ limit: pageSize, skip }));
        all.push(...res.data);
        if (res.data.length < pageSize) break;
        skip += pageSize;
      }

      const headers = ['ID', 'Type', 'Severity', 'Status', 'Fall Status', 'Simulated', 'Location', 'Fall X(cm)', 'Fall Y(cm)', 'Fall Z(cm)', 'Timestamp', 'Device'];
      const rows = all.map(e => [
        e.id,
        e.type,
        e.severity,
        e.status,
        e.fall_status || '-',
        e.is_simulated ? 'Yes' : 'No',
        e.location_path || '-',
        e.fall_loc_x_cm ?? '-',
        e.fall_loc_y_cm ?? '-',
        e.fall_loc_z_cm ?? '-',
        e.timestamp || e.occurred_at,
        e.location_path || e.radar_name || e.sensor_id
      ]);

      const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
      const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ohmguard-events-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} événements exportés`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('errors.generic'));
    } finally {
      setExporting(false);
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      const response = await api.delete('/admin/events/clear');
      toast.success(`${response.data.events_deleted} événements supprimés`);
      setClearDialogOpen(false);
      // Reset state and force refresh without cache
      setEvents([]);
      setTotalCount(0);
      setPage(0);
      // Force refresh bypassing cache
      setTimeout(() => {
        fetchEvents(true); // noCache = true
        eventsAPI.count(buildFilterParams())
          .then(res => setTotalCount(res.data.count))
          .catch(() => setTotalCount(0));
      }, 100);
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

  // Statuts de chute déjà terminaux (pas d'action "Terminer" proposée)
  const TERMINAL_FALL_STATUSES = ['finished', 'fall_exit', 'canceled'];

  const handleMarkFinished = async () => {
    if (!finishEvent) return;
    setFinishing(true);
    try {
      await eventsAPI.update(finishEvent.id, { fall_status: 'finished' });
      // Mise à jour locale immédiate (évite un rechargement complet)
      setEvents(prev => prev.map(e =>
        e.id === finishEvent.id ? { ...e, fall_status: 'finished' } : e
      ));
      toast.success('Statut chute mis à jour : Terminé');
      setFinishEvent(null);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Action non autorisée');
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setFinishing(false);
    }
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
            Effacer l&apos;historique
          </Button>
          <Button variant="outline" onClick={handleExport} data-testid="export-btn" disabled={exporting || totalCount === 0}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
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
              Effacer l&apos;historique
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p className="mb-4">
                Êtes-vous sûr de vouloir supprimer <strong>tous les {totalCount} événements</strong> de l&apos;historique ?
              </p>
              <p className="text-red-600 font-medium">
                Cette action est irréversible. Toutes les données d&apos;événements seront définitivement supprimées.
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

      {/* Dialog de confirmation : marquer la chute comme terminée */}
      <Dialog open={!!finishEvent} onOpenChange={(open) => { if (!open) setFinishEvent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Marquer comme terminé
            </DialogTitle>
            <DialogDescription className="pt-2">
              Confirmez-vous le passage du statut chute à <strong>Terminé</strong> ?
              {finishEvent?.location_path && (
                <span className="block mt-2 text-primary font-medium">{finishEvent.location_path}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFinishEvent(null)} disabled={finishing}>
              Annuler
            </Button>
            <Button
              onClick={handleMarkFinished}
              disabled={finishing}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="confirm-finish-btn"
            >
              {finishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmer
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
              onValueChange={(v) => { setSelectedBuilding(v); setSelectedFloor('all'); setSelectedRoom('all'); }}
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

            {/* Filtre Étage (dépend du bâtiment) */}
            <Select
              value={selectedFloor}
              onValueChange={(v) => { setSelectedFloor(v); setSelectedRoom('all'); }}
              disabled={selectedBuilding === 'all'}
            >
              <SelectTrigger className="w-40" data-testid="filter-floor">
                <SelectValue placeholder={t('history.floor', 'Étage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {floors.map(floor => (
                  <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtre Chambre (dépend de l'étage) */}
            <Select
              value={selectedRoom}
              onValueChange={setSelectedRoom}
              disabled={selectedFloor === 'all'}
            >
              <SelectTrigger className="w-40" data-testid="filter-room">
                <SelectValue placeholder={t('history.room', 'Chambre')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {rooms.map(room => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.room_number ? `Ch. ${room.room_number}` : room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtre Site */}
            {sites.length > 0 && (
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-44" data-testid="filter-site">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder={t('history.site', 'Site')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all')}</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

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
              <SelectTrigger className="w-40" data-testid="filter-type">
                <SelectValue placeholder={t('events.event_type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="FALL">Chute</SelectItem>
                <SelectItem value="SENSITIVE_FALL">Chute suspectee</SelectItem>
                <SelectItem value="BED_EXIT">Sortie de lit</SelectItem>
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

            {/* Période (date début / fin) */}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36"
                data-testid="filter-start-date"
                aria-label={t('history.start_date', 'Date de début')}
              />
              <span className="text-muted-foreground text-sm">—</span>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36"
                data-testid="filter-end-date"
                aria-label={t('history.end_date', 'Date de fin')}
              />
            </div>

            {/* Réinitialiser les filtres */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                data-testid="reset-filters-btn"
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                {t('history.reset_filters', 'Réinitialiser')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('events.no_events')}
            </div>
          ) : (
            <div className={cn('relative transition-opacity', loading && 'opacity-50 pointer-events-none')}>
              {loading && (
                <div className="absolute right-4 top-4 z-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('events.event_type')}</TableHead>
                  <TableHead>{t('events.severity')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>Statut chute</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {t('events.location')}
                    </div>
                  </TableHead>
                  <TableHead>{t('events.timestamp')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const locationPath = event.location_path;
                  const fallStatus = event.fall_status;
                  
                  return (
                    <TableRow 
                      key={event.id} 
                      className="table-row-highlight"
                      data-testid={`history-row-${event.id}`}
                    >
                      <TableCell>
                        <Badge className={cn('font-mono', getEventTypeColor(event.type))}>
                          {getEventTypeLabel(event.type)}
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
                        {fallStatus ? (
                          <FallStatusBadge status={fallStatus} />
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          {locationPath ? (
                            <span className="text-xs text-primary font-medium">
                              {locationPath}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatDate(event.timestamp || event.occurred_at, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {fallStatus && !TERMINAL_FALL_STATUSES.includes(fallStatus) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => setFinishEvent(event)}
                              data-testid={`finish-btn-${event.id}`}
                              title="Marquer comme terminé"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(event.id)}
                            data-testid={`view-btn-${event.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
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
