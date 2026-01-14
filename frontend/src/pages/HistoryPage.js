import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsAPI, sitesAPI } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDate, getEventTypeColor, getSeverityColor, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  History,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Eye
} from 'lucide-react';

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [page, setPage] = useState(0);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit,
        skip: page * limit,
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
  }, [page, selectedSite, selectedType, selectedStatus, selectedSeverity, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    const headers = ['ID', 'Type', 'Severity', 'Status', 'Confidence', 'Timestamp'];
    const rows = events.map(e => [
      e.id,
      e.type,
      e.severity,
      e.status,
      e.confidence,
      e.timestamp
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

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div data-testid="history-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('events.history_title')}</h1>
            <p className="text-muted-foreground">
              {totalCount} {t('events.title').toLowerCase()}
            </p>
          </div>
        </div>
        
        <Button variant="outline" onClick={handleExport} data-testid="export-btn">
          <Download className="h-4 w-4 mr-2" />
          {t('export')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('filter')}:</span>
            </div>
            
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-input"
              />
            </div>
            
            <Select value={selectedSite} onValueChange={(v) => { setSelectedSite(v); setPage(0); }}>
              <SelectTrigger className="w-40" data-testid="filter-site">
                <SelectValue placeholder={t('events.site')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {sites.map(site => (
                  <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setPage(0); }}>
              <SelectTrigger className="w-32" data-testid="filter-type">
                <SelectValue placeholder={t('events.event_type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="FALL">{t('events.type_fall')}</SelectItem>
                <SelectItem value="PRE_FALL">{t('events.type_pre_fall')}</SelectItem>
                <SelectItem value="UNKNOWN">{t('events.type_unknown')}</SelectItem>
              </SelectContent>
            </Select>
            
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
            
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(0); }}>
              <SelectTrigger className="w-36" data-testid="filter-status">
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
                  <TableHead>{t('events.confidence')}</TableHead>
                  <TableHead>{t('events.sensor')}</TableHead>
                  <TableHead>{t('events.timestamp')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow 
                    key={event.id} 
                    className="table-row-highlight"
                    data-testid={`history-row-${event.id}`}
                  >
                    <TableCell>
                      <Badge className={cn('font-mono', getEventTypeColor(event.type))}>
                        {t(`events.type_${event.type.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getSeverityColor(event.severity)}>
                        {t(`events.severity_${event.severity.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border', getStatusColor(event.status))}>
                        {t(`events.status_${event.status.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{(event.confidence * 100).toFixed(0)}%</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {event.sensor_id?.substring(0, 12)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {formatDate(event.timestamp, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" data-testid={`view-btn-${event.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
