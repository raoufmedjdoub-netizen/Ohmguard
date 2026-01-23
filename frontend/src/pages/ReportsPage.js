/**
 * ReportsPage - Page de génération et visualisation des rapports
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { ReportFilters, ReportViewer } from '@/components/reports';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileText, Clock, BarChart3 } from 'lucide-react';

export function ReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportFilters, setReportFilters] = useState(null);
  const [reportMeta, setReportMeta] = useState(null);

  const handleGenerate = async (filters) => {
    setLoading(true);
    try {
      // Construire les paramètres pour l'API
      const params = {
        start_date: filters.startDate,
        end_date: filters.endDate,
        limit: 500 // Max events pour le rapport
      };
      
      if (filters.clientId) params.client_id = filters.clientId;
      if (filters.buildingId) params.building_id = filters.buildingId;
      if (filters.sensorId) params.sensor_id = filters.sensorId;
      if (filters.eventTypes?.length === 1) params.event_type = filters.eventTypes[0];
      if (filters.severities?.length === 1) params.severity = filters.severities[0];
      if (filters.statuses?.length === 1) params.status = filters.statuses[0];

      // Récupérer les événements
      const response = await api.get('/events', { params });
      let events = response.data || [];
      
      // Filtres additionnels côté client (pour les multi-sélections)
      if (filters.eventTypes?.length > 1) {
        events = events.filter(e => filters.eventTypes.includes(e.type));
      }
      if (filters.severities?.length > 1) {
        events = events.filter(e => filters.severities.includes(e.severity));
      }
      if (filters.statuses?.length > 1) {
        events = events.filter(e => filters.statuses.includes(e.status));
      }

      // Calculer les statistiques
      const summary = {
        total: events.length,
        byType: {},
        byStatus: {},
        bySeverity: {}
      };

      events.forEach(event => {
        // Par type
        summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
        // Par statut
        summary.byStatus[event.status] = (summary.byStatus[event.status] || 0) + 1;
        // Par sévérité
        summary.bySeverity[event.severity] = (summary.bySeverity[event.severity] || 0) + 1;
      });

      // Top zones
      const zoneCount = {};
      events.forEach(event => {
        const loc = event.location_path || event.location || 'Unknown';
        zoneCount[loc] = (zoneCount[loc] || 0) + 1;
      });
      const topZones = Object.entries(zoneCount)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Temps moyen d'acquittement
      let avgAckTime = null;
      const ackedEvents = events.filter(e => e.acknowledged_at && (e.timestamp || e.occurred_at));
      if (ackedEvents.length > 0) {
        const totalTime = ackedEvents.reduce((sum, e) => {
          const eventTime = new Date(e.timestamp || e.occurred_at).getTime();
          const ackTime = new Date(e.acknowledged_at).getTime();
          return sum + (ackTime - eventTime) / 1000; // en secondes
        }, 0);
        avgAckTime = totalTime / ackedEvents.length;
      }

      // Générer l'ID du rapport
      const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;
      const generatedAt = new Date().toISOString();

      setReportData({
        events,
        summary,
        topZones,
        avgAckTime
      });
      setReportFilters(filters);
      setReportMeta({
        reportId,
        generatedAt,
        generatedBy: user?.email || 'Unknown'
      });

      toast.success(t('reports.generated_success', 'Rapport généré avec succès'));
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error(t('reports.generation_error', 'Erreur lors de la génération du rapport'));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseViewer = () => {
    setReportData(null);
    setReportFilters(null);
    setReportMeta(null);
  };

  return (
    <div data-testid="reports-page" className="space-y-6">
      {/* Stats rapides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-[#06B6D4]/10 rounded-lg">
              <FileText className="h-6 w-6 text-[#06B6D4]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('reports.feature', 'Fonctionnalité')}</p>
              <p className="text-lg font-semibold">{t('reports.event_reports', 'Rapports d\'événements')}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('reports.period_selection', 'Sélection période')}</p>
              <p className="text-lg font-semibold">{t('reports.custom_range', 'Plage personnalisée')}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('reports.export_formats', 'Formats d\'export')}</p>
              <p className="text-lg font-semibold">PDF, CSV</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <ReportFilters onGenerate={handleGenerate} loading={loading} />

      {/* Info */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h3 className="font-semibold text-blue-800 mb-2">{t('reports.how_it_works', 'Comment ça marche ?')}</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>1. {t('reports.step1', 'Sélectionnez la période et les filtres souhaités')}</li>
            <li>2. {t('reports.step2', 'Cliquez sur "Générer le rapport"')}</li>
            <li>3. {t('reports.step3', 'Prévisualisez le rapport puis exportez en PDF ou CSV')}</li>
          </ul>
        </CardContent>
      </Card>

      {/* Viewer modal */}
      {reportData && reportMeta && (
        <ReportViewer
          data={reportData}
          filters={reportFilters}
          generatedAt={reportMeta.generatedAt}
          generatedBy={reportMeta.generatedBy}
          reportId={reportMeta.reportId}
          onClose={handleCloseViewer}
        />
      )}
    </div>
  );
}

export default ReportsPage;
