/**
 * ReportFilters - Filtres pour la génération de rapports
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Filter,
  Building2,
  Home,
  Radio,
  AlertTriangle,
  FileText,
  Loader2
} from 'lucide-react';

const EVENT_TYPES = [
  { value: 'FALL', labelKey: 'events.type_fall' },
  { value: 'PRE_FALL', labelKey: 'events.type_pre_fall' },
  { value: 'PRESENCE', labelKey: 'events.type_presence' },
  { value: 'INACTIVITY', labelKey: 'events.type_inactivity' },
  { value: 'UNKNOWN', labelKey: 'events.type_unknown' }
];

const SEVERITIES = [
  { value: 'HIGH', labelKey: 'events.severity_high' },
  { value: 'MED', labelKey: 'events.severity_med' },
  { value: 'LOW', labelKey: 'events.severity_low' }
];

const STATUSES = [
  { value: 'NEW', labelKey: 'events.status_new' },
  { value: 'ACK', labelKey: 'events.status_ack' },
  { value: 'RESOLVED', labelKey: 'events.status_resolved' },
  { value: 'FALSE_ALARM', labelKey: 'events.status_false_alarm' }
];

export function ReportFilters({ onGenerate, loading }) {
  const { t } = useTranslation();
  
  // Dates
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Filtres hiérarchiques
  const [clients, setClients] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [sensors, setSensors] = useState([]);
  
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedSensor, setSelectedSensor] = useState('all');
  
  // Filtres par type/statut/criticité
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedSeverities, setSelectedSeverities] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);

  // Charger les clients
  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data)).catch(() => setClients([]));
    api.get('/sensors').then(res => setSensors(res.data)).catch(() => setSensors([]));
  }, []);

  // Charger les bâtiments quand un client change
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

  // Charger les étages quand un bâtiment change
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

  const toggleType = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleSeverity = (sev) => {
    setSelectedSeverities(prev => 
      prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]
    );
  };

  const toggleStatus = (status) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handleGenerate = () => {
    const filters = {
      startDate,
      endDate,
      clientId: selectedClient !== 'all' ? selectedClient : null,
      buildingId: selectedBuilding !== 'all' ? selectedBuilding : null,
      floorId: selectedFloor !== 'all' ? selectedFloor : null,
      sensorId: selectedSensor !== 'all' ? selectedSensor : null,
      eventTypes: selectedTypes.length > 0 ? selectedTypes : null,
      severities: selectedSeverities.length > 0 ? selectedSeverities : null,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
      // Metadata for report
      clientName: selectedClient !== 'all' ? clients.find(c => c.id === selectedClient)?.name : null,
      buildingName: selectedBuilding !== 'all' ? buildings.find(b => b.id === selectedBuilding)?.name : null
    };
    onGenerate(filters);
  };

  return (
    <Card data-testid="report-filters">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Filter className="h-5 w-5" />
          {t('reports.filters', 'Filtres du rapport')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Période */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t('reports.start_date', 'Date de début')}
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="start-date"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t('reports.end_date', 'Date de fin')}
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="end-date"
            />
          </div>
        </div>

        {/* Localisation */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t('reports.location', 'Localisation')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedBuilding('all'); setSelectedFloor('all'); }}>
              <SelectTrigger data-testid="filter-client">
                <Home className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('reports.client', 'Client')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', 'Tous')}</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedBuilding} onValueChange={(v) => { setSelectedBuilding(v); setSelectedFloor('all'); }} disabled={selectedClient === 'all'}>
              <SelectTrigger data-testid="filter-building">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('reports.building', 'Bâtiment')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', 'Tous')}</SelectItem>
                {buildings.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedFloor} onValueChange={setSelectedFloor} disabled={selectedBuilding === 'all'}>
              <SelectTrigger data-testid="filter-floor">
                <SelectValue placeholder={t('reports.floor', 'Étage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', 'Tous')}</SelectItem>
                {floors.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSensor} onValueChange={setSelectedSensor}>
              <SelectTrigger data-testid="filter-sensor">
                <Radio className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('reports.device', 'Capteur')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', 'Tous')}</SelectItem>
                {sensors.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name || s.serial_product || s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Types d'événements */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t('reports.event_types', 'Types d\'événements')}</Label>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPES.map(type => (
              <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={selectedTypes.includes(type.value)}
                  onCheckedChange={() => toggleType(type.value)}
                />
                <span className="text-sm">{t(type.labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Criticité */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t('reports.severity', 'Criticité')}
          </Label>
          <div className="flex flex-wrap gap-3">
            {SEVERITIES.map(sev => (
              <label key={sev.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={selectedSeverities.includes(sev.value)}
                  onCheckedChange={() => toggleSeverity(sev.value)}
                />
                <span className="text-sm">{t(sev.labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Statuts */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t('reports.statuses', 'Statuts')}</Label>
          <div className="flex flex-wrap gap-3">
            {STATUSES.map(status => (
              <label key={status.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={selectedStatuses.includes(status.value)}
                  onCheckedChange={() => toggleStatus(status.value)}
                />
                <span className="text-sm">{t(status.labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Bouton générer */}
        <Button 
          onClick={handleGenerate} 
          className="w-full"
          disabled={loading}
          data-testid="generate-report-btn"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('reports.generating', 'Génération en cours...')}
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              {t('reports.generate', 'Générer le rapport')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ReportFilters;
