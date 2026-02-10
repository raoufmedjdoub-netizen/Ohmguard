import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, BarChart3, TrendingUp, PieChartIcon, Activity } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { usePageActions } from '@/contexts/PageActionsContext';

// Color palette
const COLORS = {
  primary: '#F97316',  // Alert Orange
  secondary: '#0EA5E9', // Medical Blue
  success: '#22C55E',   // Vital Green
  warning: '#EAB308',   // Yellow
  danger: '#EF4444',    // Red
  muted: '#6B7280',     // Gray
};

const STATUS_COLORS = {
  NEW: COLORS.danger,
  ACK: COLORS.warning,
  RESOLVED: COLORS.success,
  FALSE_ALARM: COLORS.muted
};

const SEVERITY_COLORS = {
  HIGH: COLORS.danger,
  MED: COLORS.warning,
  LOW: COLORS.secondary
};

const TYPE_COLORS = {
  FALL: COLORS.danger,
  PRE_FALL: COLORS.warning,
  PRESENCE: COLORS.secondary,
  INACTIVITY: '#A855F7', // Purple
  UNKNOWN: COLORS.muted
};

const SENSOR_TYPE_COLORS = {
  RADAR: COLORS.primary
};

export function StatisticsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7');
  
  // Stats data
  const [timeline, setTimeline] = useState([]);
  const [eventsByType, setEventsByType] = useState([]);
  const [eventsBySeverity, setEventsBySeverity] = useState([]);
  const [eventsByStatus, setEventsByStatus] = useState([]);
  const [eventsBySite, setEventsBySite] = useState([]);
  const [sensorsStatus, setSensorsStatus] = useState([]);
  const [sensorsByType, setSensorsByType] = useState([]);
  const [responseTime, setResponseTime] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [
        timelineRes,
        byTypeRes,
        bySeverityRes,
        byStatusRes,
        bySiteRes,
        sensorsStatusRes,
        sensorsByTypeRes,
        responseTimeRes
      ] = await Promise.all([
        api.get(`/stats/events-timeline?days=${timeRange}`),
        api.get('/stats/events-by-type'),
        api.get('/stats/events-by-severity'),
        api.get('/stats/events-by-status'),
        api.get('/stats/events-by-site'),
        api.get('/stats/sensors-status'),
        api.get('/stats/sensors-by-type'),
        api.get('/stats/response-time')
      ]);
      
      setTimeline(timelineRes.data);
      setEventsByType(byTypeRes.data);
      setEventsBySeverity(bySeverityRes.data);
      setEventsByStatus(byStatusRes.data);
      setEventsBySite(bySiteRes.data);
      setSensorsStatus(sensorsStatusRes.data);
      setSensorsByType(sensorsByTypeRes.data);
      setResponseTime(responseTimeRes.data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeRange]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Inject actions into SubNavbar
  usePageActions(
    useMemo(() => (
      <Select value={timeRange} onValueChange={setTimeRange}>
        <SelectTrigger className="w-40 h-8" data-testid="time-range-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">7 derniers jours</SelectItem>
          <SelectItem value="14">14 derniers jours</SelectItem>
          <SelectItem value="30">30 derniers jours</SelectItem>
        </SelectContent>
      </Select>
    ), [timeRange])
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalEvents = eventsByStatus.reduce((acc, curr) => acc + curr.count, 0);
  const totalSensors = sensorsStatus.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div data-testid="statistics-page" className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Événements</p>
                <p className="text-3xl font-bold">{totalEvents}</p>
              </div>
              <Activity className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Capteurs Actifs</p>
                <p className="text-3xl font-bold">
                  {sensorsStatus.find(s => s.status === 'ONLINE')?.count || 0}/{totalSensors}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Temps Réponse Moyen</p>
                <p className="text-3xl font-bold">{responseTime?.avg_ack_time_minutes || 0} min</p>
              </div>
              <TrendingUp className="h-8 w-8 text-secondary opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taux Résolution</p>
                <p className="text-3xl font-bold">
                  {totalEvents > 0 
                    ? Math.round((eventsByStatus.find(s => s.status === 'RESOLVED')?.count || 0) / totalEvents * 100)
                    : 0}%
                </p>
              </div>
              <PieChartIcon className="h-8 w-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card data-testid="timeline-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Évolution des Événements
          </CardTitle>
          <CardDescription>Nombre d'événements par jour sur les {timeRange} derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="colorFall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPreFall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.warning} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.warning} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPresence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tickFormatter={(value) => value.slice(5)} 
              />
              <YAxis className="text-xs" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="fall" 
                name="Chutes" 
                stroke={COLORS.danger} 
                fillOpacity={1} 
                fill="url(#colorFall)" 
              />
              <Area 
                type="monotone" 
                dataKey="pre_fall" 
                name="Pré-Chutes" 
                stroke={COLORS.warning} 
                fillOpacity={1} 
                fill="url(#colorPreFall)" 
              />
              <Area 
                type="monotone" 
                dataKey="presence" 
                name="Présence" 
                stroke={COLORS.secondary} 
                fillOpacity={1} 
                fill="url(#colorPresence)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Events by Type */}
        <Card data-testid="events-by-type-chart">
          <CardHeader>
            <CardTitle>Répartition par Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={eventsByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="type"
                  label={({ type, count }) => `${type}: ${count}`}
                >
                  {eventsByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={TYPE_COLORS[entry.type] || COLORS.muted} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {eventsByType.map((item) => (
                <Badge 
                  key={item.type} 
                  variant="outline"
                  style={{ borderColor: TYPE_COLORS[item.type], color: TYPE_COLORS[item.type] }}
                >
                  {item.type}: {item.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Events by Severity */}
        <Card data-testid="events-by-severity-chart">
          <CardHeader>
            <CardTitle>Répartition par Gravité</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={eventsBySeverity} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="severity" type="category" className="text-xs" width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Événements" radius={[0, 4, 4, 0]}>
                  {eventsBySeverity.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.severity] || COLORS.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Events by Status */}
        <Card data-testid="events-by-status-chart">
          <CardHeader>
            <CardTitle>Répartition par Statut</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={eventsByStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="count"
                  nameKey="status"
                  label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                >
                  {eventsByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS.muted} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Events by Site */}
        <Card data-testid="events-by-site-chart">
          <CardHeader>
            <CardTitle>Événements par Site</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={eventsBySite}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis 
                  dataKey="site_name" 
                  className="text-xs"
                  tickFormatter={(value) => value.length > 15 ? value.slice(0, 15) + '...' : value}
                />
                <YAxis className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Événements" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sensors by Status */}
        <Card data-testid="sensors-status-chart">
          <CardHeader>
            <CardTitle>Statut des Capteurs</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sensorsStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="status"
                >
                  {sensorsStatus.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.status === 'ONLINE' ? COLORS.success : entry.status === 'OFFLINE' ? COLORS.danger : COLORS.warning} 
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sensors by Type */}
        <Card data-testid="sensors-by-type-chart">
          <CardHeader>
            <CardTitle>Capteurs par Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sensorsByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="type" type="category" className="text-xs" width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Capteurs" radius={[0, 4, 4, 0]}>
                  {sensorsByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SENSOR_TYPE_COLORS[entry.type] || COLORS.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
