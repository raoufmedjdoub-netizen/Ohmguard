import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { statsAPI, eventsAPI } from '../../lib/api';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn, formatRelativeTime, getEventTypeColor, getSeverityColor, getStatusColor } from '../../lib/utils';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Activity,
  MapPin,
  TrendingUp,
  Loader2,
  XCircle
} from 'lucide-react';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { subscribe } = useWebSocket();
  const [stats, setStats] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        statsAPI.overview(),
        eventsAPI.list({ limit: 10 })
      ]);
      setStats(statsRes.data);
      setRecentEvents(eventsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe('dashboard', (message) => {
      if (message.type === 'new_event') {
        setRecentEvents(prev => [message.event, ...prev.slice(0, 9)]);
        setStats(prev => prev ? {
          ...prev,
          events: {
            ...prev.events,
            total: prev.events.total + 1,
            new: prev.events.new + 1
          }
        } : null);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    {
      title: t('dashboard.new_events'),
      value: stats?.events?.new || 0,
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10'
    },
    {
      title: t('dashboard.acknowledged'),
      value: stats?.events?.acknowledged || 0,
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning/10'
    },
    {
      title: t('dashboard.resolved'),
      value: stats?.events?.resolved || 0,
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10'
    },
    {
      title: t('dashboard.false_alarms'),
      value: stats?.events?.false_alarms || 0,
      icon: XCircle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted'
    },
    {
      title: t('dashboard.online_sensors'),
      value: `${stats?.sensors?.online || 0}/${stats?.sensors?.total || 0}`,
      icon: Cpu,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10'
    },
    {
      title: t('dashboard.total_sites'),
      value: stats?.sites?.total || 0,
      icon: MapPin,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    }
  ];

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.overview')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-success animate-pulse" />
          <span className="text-sm font-medium">{t('dashboard.system_health')}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="border" data-testid={`stat-card-${index}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className={cn('p-2 rounded-lg', stat.bgColor)}>
                  <stat.icon className={cn('h-5 w-5', stat.color)} />
                </div>
                <span className="text-2xl font-bold">{stat.value}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground uppercase tracking-wider">
                {stat.title}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Events */}
      <Card data-testid="recent-events-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('dashboard.recent_events')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span className="text-xs text-muted-foreground">LIVE</span>
          </div>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('events.no_events')}
            </p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
                    index === 0 && 'animate-fade-in'
                  )}
                  data-testid={`event-row-${event.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Badge className={cn('font-mono text-xs', getEventTypeColor(event.type))}>
                      {event.type}
                    </Badge>
                    <Badge variant="outline" className={cn(getSeverityColor(event.severity))}>
                      {event.severity}
                    </Badge>
                    <span className="text-sm text-muted-foreground font-mono">
                      {event.sensor_id?.substring(0, 8)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('border', getStatusColor(event.status))}>
                      {t(`events.status_${event.status.toLowerCase()}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(event.timestamp, i18n.language)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
