import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime, getEventTypeColor, getSeverityColor } from '@/lib/utils';
import api from '@/lib/api';
import {
  AlertTriangle,
  Cpu,
  Activity,
  ChevronRight,
  ExternalLink,
  Loader2,
  Shield
} from 'lucide-react';

const COLORS = {
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#EAB308',
  muted: '#6B7280',
};

export function DashboardWidget({ 
  className, 
  showHeader = true,
  compact = false,
  onNavigate 
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/stats/widget');
        setData(response.data);
      } catch (error) {
        console.error('Failed to fetch widget data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className={cn('', className)} data-testid="dashboard-widget">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={cn('', className)} data-testid="dashboard-widget">
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          Données non disponibles
        </CardContent>
      </Card>
    );
  }

  const sensorHealthData = [
    { name: 'Online', value: data.sensors.online, color: COLORS.success },
    { name: 'Offline', value: data.sensors.total - data.sensors.online, color: COLORS.danger }
  ];

  if (compact) {
    return (
      <Card className={cn('', className)} data-testid="dashboard-widget-compact">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Shield className="h-8 w-8 text-primary" />
                {data.alerts.critical > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive text-[10px] text-white items-center justify-center font-bold">
                      {data.alerts.critical}
                    </span>
                  </span>
                )}
              </div>
              <div>
                <p className="font-semibold">FallGuard</p>
                <p className="text-xs text-muted-foreground">
                  {data.alerts.new} alertes • {data.sensors.online}/{data.sensors.total} capteurs
                </p>
              </div>
            </div>
            {onNavigate && (
              <Button variant="ghost" size="sm" onClick={onNavigate}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)} data-testid="dashboard-widget">
      {showHeader && (
        <CardHeader className="bg-primary/5 border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              FallGuard
            </CardTitle>
            <div className="flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="text-xs text-muted-foreground">LIVE</span>
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className="p-4 space-y-4">
        {/* Alert Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">Alertes</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{data.alerts.new}</span>
              {data.alerts.critical > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {data.alerts.critical} critiques
                </Badge>
              )}
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-success/10 border border-success/20">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-success">Capteurs</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold">{data.sensors.health_percent}%</span>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={30}>
                  <PieChart>
                    <Pie
                      data={sensorHealthData}
                      cx="50%"
                      cy="50%"
                      innerRadius={8}
                      outerRadius={12}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {sensorHealthData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Événements récents</span>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            {data.recent_events.slice(0, 3).map((event) => (
              <div 
                key={event.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-xs', getEventTypeColor(event.type))}>
                    {event.type}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', getSeverityColor(event.severity))}>
                    {event.severity}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(event.timestamp, i18n.language)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        {onNavigate && (
          <Button 
            variant="outline" 
            className="w-full" 
            size="sm"
            onClick={onNavigate}
          >
            Ouvrir le tableau de bord
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Standalone Widget Page
export function WidgetPage() {
  const { t } = useTranslation();
  
  return (
    <div data-testid="widget-page" className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Widgets Dashboard</h1>
        <p className="text-muted-foreground">Versions compactes du tableau de bord pour l'intégration</p>
      </div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Standard Widget */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Widget Standard</h3>
          <DashboardWidget />
        </div>
        
        {/* Compact Widget */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Widget Compact</h3>
          <DashboardWidget compact />
        </div>
        
        {/* Widget without header */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Sans En-tête</h3>
          <DashboardWidget showHeader={false} />
        </div>
      </div>

      {/* Integration Code */}
      <Card>
        <CardHeader>
          <CardTitle>Code d'intégration</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="p-4 rounded-lg bg-muted font-mono text-sm overflow-x-auto">
{`// Import du widget
import { DashboardWidget } from '@/components/widgets/DashboardWidget';

// Utilisation standard
<DashboardWidget />

// Widget compact
<DashboardWidget compact />

// Sans en-tête avec navigation
<DashboardWidget 
  showHeader={false} 
  onNavigate={() => navigate('/dashboard')} 
/>`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
