/**
 * PresenceHistoryPage - Historique des Sessions de Présence
 * 
 * Affiche l'historique des sessions de présence agrégées (et non les événements bruts).
 * Une session = période continue de présence détectée (début, fin, durée).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  User, 
  Building2, 
  Radar, 
  RefreshCw, 
  Filter,
  Calendar,
  Timer,
  Activity,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  History
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function PresenceHistoryPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Fetch buildings for filter
  const fetchBuildings = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      // First try to get clients with their buildings
      let res = await fetch(`${API_URL}/api/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const clients = await res.json();
        // Flatten buildings from all clients
        const allBuildings = [];
        if (Array.isArray(clients)) {
          clients.forEach(client => {
            if (client.buildings) {
              client.buildings.forEach(b => {
                allBuildings.push({ 
                  id: b.id, 
                  name: b.name, 
                  clientName: client.name 
                });
              });
            }
          });
        }
        setBuildings(allBuildings);
        return;
      }
      
      // Fallback: try buildings endpoint directly
      res = await fetch(`${API_URL}/api/buildings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const buildingsList = Array.isArray(data) ? data : data.buildings || [];
        setBuildings(buildingsList.map(b => ({
          id: b.id,
          name: b.name,
          clientName: b.client_name || ''
        })));
      }
    } catch (error) {
      console.error('Failed to fetch buildings:', error);
    }
  }, []);

  // Fetch presence sessions
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      
      if (selectedBuilding !== 'all') {
        params.append('building_id', selectedBuilding);
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', pageSize);
      params.append('skip', page * pageSize);

      const res = await fetch(`${API_URL}/api/presence-sessions?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setTotalCount(data.count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch presence sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedBuilding, statusFilter, page]);

  // Fetch active sessions
  const fetchActiveSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      if (selectedBuilding !== 'all') {
        params.append('building_id', selectedBuilding);
      }

      const res = await fetch(`${API_URL}/api/presence-sessions/active?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setActiveSessions(data.active_sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch active sessions:', error);
    }
  }, [selectedBuilding]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      if (selectedBuilding !== 'all') {
        params.append('building_id', selectedBuilding);
      }

      const res = await fetch(`${API_URL}/api/presence-sessions/stats?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [selectedBuilding]);

  // Fetch daily statistics
  const fetchDailyStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      if (selectedBuilding !== 'all') {
        params.append('building_id', selectedBuilding);
      }
      params.append('days', '7');

      const res = await fetch(`${API_URL}/api/presence-sessions/daily?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setDailyStats(data.daily_stats || []);
      }
    } catch (error) {
      console.error('Failed to fetch daily stats:', error);
    }
  }, [selectedBuilding]);

  // Load all data
  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  useEffect(() => {
    fetchSessions();
    fetchActiveSessions();
    fetchStats();
    fetchDailyStats();
  }, [fetchSessions, fetchActiveSessions, fetchStats, fetchDailyStats]);

  const handleRefresh = () => {
    fetchSessions();
    fetchActiveSessions();
    fetchStats();
    fetchDailyStats();
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    try {
      return format(parseISO(isoString), 'dd/MM/yyyy HH:mm:ss', { locale: fr });
    } catch {
      return isoString;
    }
  };

  const formatTimeAgo = (isoString) => {
    if (!isoString) return '-';
    try {
      return formatDistanceToNow(parseISO(isoString), { addSuffix: true, locale: fr });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Historique de Présence
          </h1>
          <p className="text-xs text-muted-foreground">
            Sessions de présence agrégées
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats + Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Stats inline */}
        <div className="flex items-center gap-1 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
          <Activity className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">{stats?.active_sessions || activeSessions.length || 0} actives</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
          <Clock className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">{stats?.total_sessions || 0} total</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-200">
          <Timer className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-medium text-orange-700">Moy: {stats?.avg_duration_display || '0s'}</span>
        </div>
        
        <div className="flex-1" />
        
        {/* Filters */}
        <Select value={selectedBuilding} onValueChange={(v) => { setSelectedBuilding(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <Building2 className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Tous les bâtiments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les bâtiments</SelectItem>
            {buildings.map(b => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="ACTIVE">En cours</SelectItem>
            <SelectItem value="COMPLETED">Terminées</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sessions Table */}
      <Card className="flex-1">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (activeSessions.length === 0 && sessions.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune session de présence trouvée</p>
            </div>
          ) : (
            <div>
              {/* Sessions Table */}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total sessions</p>
                <p className="text-2xl font-bold">{stats?.total_sessions || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Durée moyenne</p>
                <p className="text-2xl font-bold">{stats?.avg_duration_display || '0s'}</p>
              </div>
              <Timer className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Durée totale</p>
                <p className="text-2xl font-bold">{stats?.total_duration_display || '0s'}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtres:</span>
            </div>
            
            <Select value={selectedBuilding} onValueChange={(v) => { setSelectedBuilding(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tous les bâtiments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les bâtiments</SelectItem>
                {buildings.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.clientName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Toutes les sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="ACTIVE">En cours</SelectItem>
                <SelectItem value="COMPLETED">Terminées</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List - Combined Active and Historical */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Sessions de présence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (activeSessions.length === 0 && sessions.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune session de présence trouvée</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sessions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Capteur</th>
                      <th className="text-left py-3 px-2 font-medium">Emplacement</th>
                      <th className="text-left py-3 px-2 font-medium">Début</th>
                      <th className="text-left py-3 px-2 font-medium">Fin</th>
                      <th className="text-left py-3 px-2 font-medium">Durée</th>
                      <th className="text-left py-3 px-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Sessions actives en premier */}
                    {activeSessions.map(session => (
                      <tr key={session.id} className="border-b hover:bg-green-50/50 bg-green-50/30">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <Radar className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{session.sensor_name || 'Capteur'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {session.room_name || session.space_name || '-'}
                        </td>
                        <td className="py-3 px-2">
                          <div>
                            <div>{formatDateTime(session.start_at)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatTimeAgo(session.start_at)}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">-</td>
                        <td className="py-3 px-2">
                          <span className="font-medium text-green-600">
                            {session.current_duration_display || session.duration_display || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className="bg-green-100 text-green-700">
                            En cours
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {/* Sessions historiques */}
                    {sessions.map(session => (
                      <tr key={session.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <Radar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{session.sensor_name || 'Capteur'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {session.room_name || session.space_name || '-'}
                        </td>
                        <td className="py-3 px-2">
                          <div>
                            <div>{formatDateTime(session.start_at)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatTimeAgo(session.start_at)}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {session.end_at ? (
                            <div>
                              <div>{formatDateTime(session.end_at)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatTimeAgo(session.end_at)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-2">
                          <span className="font-medium">
                            {session.duration_display || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="secondary">
                            Terminée
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  Page {page + 1} ({activeSessions.length + sessions.length} résultats)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sessions.length < pageSize}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PresenceHistoryPage;
