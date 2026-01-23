/**
 * ReportTemplate - Template HTML print-friendly pour les rapports
 */
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatDate, getEventTypeColor, getSeverityColor, getStatusColor } from '@/lib/utils';
import { Shield } from 'lucide-react';

// Styles pour l'impression
const printStyles = `
  @media print {
    @page {
      size: A4;
      margin: 15mm 10mm;
    }
    
    body {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    .no-print {
      display: none !important;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    .avoid-break {
      page-break-inside: avoid;
    }
    
    .report-container {
      background: white !important;
      color: black !important;
    }
    
    table {
      page-break-inside: auto;
    }
    
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    
    thead {
      display: table-header-group;
    }
    
    .report-header {
      position: running(header);
    }
    
    .report-footer {
      position: running(footer);
    }
  }
`;

export const ReportTemplate = forwardRef(({ 
  data, 
  filters, 
  generatedAt, 
  generatedBy,
  reportId 
}, ref) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
  
  const {
    events = [],
    summary = {},
    topZones = [],
    avgAckTime = null
  } = data || {};

  const formatPeriod = () => {
    const start = new Date(filters.startDate).toLocaleDateString(locale, { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });
    const end = new Date(filters.endDate).toLocaleDateString(locale, { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });
    return `${start} - ${end}`;
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <style>{printStyles}</style>
      <div 
        ref={ref} 
        className="report-container bg-white text-gray-900 min-h-screen"
        data-testid="report-template"
      >
        {/* ========== PAGE DE GARDE ========== */}
        <div className="min-h-[90vh] flex flex-col justify-center items-center p-8 avoid-break">
          <div className="text-center space-y-8">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3">
              <Shield className="h-16 w-16 text-[#06B6D4]" />
              <span className="text-4xl font-bold text-[#1E3A5F]">OhmGuard</span>
            </div>
            
            {/* Titre */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">
                {t('reports.title', 'Rapport d\'événements')}
              </h1>
              <div className="h-1 w-32 bg-[#06B6D4] mx-auto rounded" />
            </div>
            
            {/* Infos clés */}
            <div className="space-y-4 text-lg">
              <p className="text-gray-600">
                <span className="font-semibold">{t('reports.period', 'Période')}:</span>{' '}
                {formatPeriod()}
              </p>
              {filters.clientName && (
                <p className="text-gray-600">
                  <span className="font-semibold">{t('reports.client', 'Client')}:</span>{' '}
                  {filters.clientName}
                  {filters.buildingName && ` > ${filters.buildingName}`}
                </p>
              )}
            </div>
            
            {/* Métadonnées */}
            <div className="pt-8 text-sm text-gray-500 space-y-1">
              <p>{t('reports.generated_at', 'Généré le')}: {formatDateTime(generatedAt)}</p>
              <p>{t('reports.generated_by', 'Par')}: {generatedBy}</p>
              <p className="font-mono text-xs">ID: {reportId}</p>
            </div>
          </div>
        </div>

        {/* ========== RÉSUMÉ EXÉCUTIF ========== */}
        <div className="page-break p-8">
          <h2 className="text-2xl font-bold text-[#1E3A5F] mb-6 pb-2 border-b-2 border-[#06B6D4]">
            {t('reports.executive_summary', 'Résumé Exécutif')}
          </h2>
          
          {/* Stats globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 rounded-lg p-4 text-center avoid-break">
              <div className="text-3xl font-bold text-[#1E3A5F]">{summary.total || 0}</div>
              <div className="text-sm text-gray-600">{t('reports.total_events', 'Total événements')}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center avoid-break">
              <div className="text-3xl font-bold text-red-600">{summary.byType?.FALL || 0}</div>
              <div className="text-sm text-gray-600">{t('events.type_fall', 'Chutes')}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center avoid-break">
              <div className="text-3xl font-bold text-amber-600">{summary.byStatus?.NEW || 0}</div>
              <div className="text-sm text-gray-600">{t('events.status_new', 'Nouveaux')}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center avoid-break">
              <div className="text-3xl font-bold text-green-600">{summary.byStatus?.RESOLVED || 0}</div>
              <div className="text-sm text-gray-600">{t('events.status_resolved', 'Résolus')}</div>
            </div>
          </div>

          {/* Répartition par type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="avoid-break">
              <h3 className="text-lg font-semibold mb-3">{t('reports.by_type', 'Répartition par type')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t('events.event_type', 'Type')}</th>
                    <th className="text-right py-2">{t('reports.count', 'Nombre')}</th>
                    <th className="text-right py-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.byType || {}).map(([type, count]) => (
                    <tr key={type} className="border-b border-gray-100">
                      <td className="py-2">{t(`events.type_${type.toLowerCase()}`, type)}</td>
                      <td className="text-right py-2 font-mono">{count}</td>
                      <td className="text-right py-2 font-mono text-gray-500">
                        {summary.total ? ((count / summary.total) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="avoid-break">
              <h3 className="text-lg font-semibold mb-3">{t('reports.by_status', 'Répartition par statut')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t('status', 'Statut')}</th>
                    <th className="text-right py-2">{t('reports.count', 'Nombre')}</th>
                    <th className="text-right py-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.byStatus || {}).map(([status, count]) => (
                    <tr key={status} className="border-b border-gray-100">
                      <td className="py-2">{t(`events.status_${status.toLowerCase()}`, status)}</td>
                      <td className="text-right py-2 font-mono">{count}</td>
                      <td className="text-right py-2 font-mono text-gray-500">
                        {summary.total ? ((count / summary.total) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Temps moyen d'acquittement */}
          {avgAckTime !== null && (
            <div className="bg-blue-50 rounded-lg p-4 mb-8 avoid-break">
              <h3 className="text-lg font-semibold mb-2">{t('reports.avg_ack_time', 'Temps moyen d\'acquittement')}</h3>
              <p className="text-2xl font-bold text-blue-600">
                {avgAckTime < 60 
                  ? `${avgAckTime.toFixed(0)} ${t('reports.seconds', 'secondes')}`
                  : `${(avgAckTime / 60).toFixed(1)} ${t('reports.minutes', 'minutes')}`
                }
              </p>
            </div>
          )}

          {/* Top 5 zones */}
          {topZones.length > 0 && (
            <div className="avoid-break">
              <h3 className="text-lg font-semibold mb-3">
                {t('reports.top_zones', 'Top 5 zones avec le plus d\'événements')}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">#</th>
                    <th className="text-left py-2">{t('events.location', 'Localisation')}</th>
                    <th className="text-right py-2">{t('reports.count', 'Événements')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topZones.slice(0, 5).map((zone, idx) => (
                    <tr key={zone.location || idx} className="border-b border-gray-100">
                      <td className="py-2 font-bold text-[#06B6D4]">{idx + 1}</td>
                      <td className="py-2">{zone.location || '-'}</td>
                      <td className="text-right py-2 font-mono font-bold">{zone.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ========== DÉTAILS DES ÉVÉNEMENTS ========== */}
        <div className="page-break p-8">
          <h2 className="text-2xl font-bold text-[#1E3A5F] mb-6 pb-2 border-b-2 border-[#06B6D4]">
            {t('reports.event_details', 'Détails des événements')}
          </h2>
          
          {events.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">{t('reports.no_events', 'Aucun événement sur cette période')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.slice(0, 100).map((event, idx) => (
                <div 
                  key={event.id} 
                  className="border rounded-lg p-4 avoid-break bg-gray-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        event.type === 'FALL' ? 'bg-red-100 text-red-800' :
                        event.type === 'PRE_FALL' ? 'bg-orange-100 text-orange-800' :
                        event.type === 'PRESENCE' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      )}>
                        {t(`events.type_${event.type?.toLowerCase() || 'unknown'}`)}
                      </span>
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        event.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                        event.severity === 'MED' ? 'bg-amber-100 text-amber-800' :
                        'bg-green-100 text-green-800'
                      )}>
                        {t(`events.severity_${event.severity?.toLowerCase() || 'low'}`)}
                      </span>
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium border',
                        event.status === 'NEW' ? 'border-amber-500 text-amber-700' :
                        event.status === 'ACK' ? 'border-blue-500 text-blue-700' :
                        event.status === 'RESOLVED' ? 'border-green-500 text-green-700' :
                        'border-gray-500 text-gray-700'
                      )}>
                        {t(`events.status_${event.status?.toLowerCase() || 'new'}`)}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">{event.id?.slice(0, 8)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">{t('events.timestamp', 'Horodatage')}:</span>{' '}
                      <span className="font-medium">{formatDateTime(event.timestamp || event.occurred_at)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('events.location', 'Localisation')}:</span>{' '}
                      <span className="font-medium">{event.location_path || event.location || '-'}</span>
                    </div>
                    {event.sensor_id && (
                      <div>
                        <span className="text-gray-500">{t('reports.device', 'Capteur')}:</span>{' '}
                        <span className="font-mono text-xs">{event.radar_name || event.sensor_id}</span>
                      </div>
                    )}
                    {event.presence_detected !== undefined && (
                      <div>
                        <span className="text-gray-500">{t('events.presence', 'Présence')}:</span>{' '}
                        <span className={event.presence_detected ? 'text-green-600' : 'text-gray-400'}>
                          {event.presence_detected ? t('yes', 'Oui') : t('no', 'Non')}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {event.acknowledged_at && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                      <span className="text-gray-500">{t('reports.acknowledged', 'Acquitté')}:</span>{' '}
                      {formatDateTime(event.acknowledged_at)}
                      {event.acknowledged_by && ` ${t('reports.by', 'par')} ${event.acknowledged_by}`}
                    </div>
                  )}
                  
                  {event.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <span className="text-sm text-gray-500">{t('reports.notes', 'Notes')}:</span>
                      <p className="text-sm mt-1 italic">{event.notes}</p>
                    </div>
                  )}
                </div>
              ))}
              
              {events.length > 100 && (
                <p className="text-center text-gray-500 py-4">
                  ... {t('reports.and_more', 'et')} {events.length - 100} {t('reports.more_events', 'événements supplémentaires')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ========== ANNEXES ========== */}
        <div className="page-break p-8">
          <h2 className="text-2xl font-bold text-[#1E3A5F] mb-6 pb-2 border-b-2 border-[#06B6D4]">
            {t('reports.annexes', 'Annexes')}
          </h2>
          
          {/* Table complète */}
          <h3 className="text-lg font-semibold mb-3">{t('reports.complete_list', 'Liste complète des événements')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">ID</th>
                  <th className="border p-2 text-left">{t('events.timestamp', 'Date')}</th>
                  <th className="border p-2 text-left">{t('events.event_type', 'Type')}</th>
                  <th className="border p-2 text-left">{t('events.severity', 'Criticité')}</th>
                  <th className="border p-2 text-left">{t('status', 'Statut')}</th>
                  <th className="border p-2 text-left">{t('events.location', 'Localisation')}</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 200).map(event => (
                  <tr key={event.id} className="border-b">
                    <td className="border p-1 font-mono">{event.id?.slice(0, 8)}</td>
                    <td className="border p-1">{formatDateTime(event.timestamp || event.occurred_at)}</td>
                    <td className="border p-1">{event.type}</td>
                    <td className="border p-1">{event.severity}</td>
                    <td className="border p-1">{event.status}</td>
                    <td className="border p-1">{event.location_path || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Méta-informations */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
            <h4 className="font-semibold mb-2">{t('reports.meta_info', 'Informations techniques')}</h4>
            <ul className="space-y-1">
              <li>• {t('reports.platform_version', 'Version plateforme')}: OhmGuard v1.0.0</li>
              <li>• {t('reports.report_id', 'Identifiant rapport')}: {reportId}</li>
              <li>• {t('reports.generated_at', 'Généré le')}: {formatDateTime(generatedAt)}</li>
              <li>• {t('reports.total_events_exported', 'Événements exportés')}: {events.length}</li>
            </ul>
          </div>
          
          {/* Note RGPD */}
          <div className="mt-8 p-4 bg-gray-100 rounded-lg text-xs">
            <h4 className="font-semibold mb-2">{t('reports.gdpr_notice', 'Conformité RGPD')}</h4>
            <p className="text-gray-600">
              {t('reports.gdpr_text', 'Ce rapport peut contenir des données personnelles. Conformément au RGPD, ces données doivent être traitées de manière confidentielle et ne doivent pas être conservées au-delà de la durée nécessaire à leur traitement.')}
            </p>
          </div>
        </div>

        {/* Pied de page pour impression */}
        <div className="fixed bottom-0 left-0 right-0 p-2 text-center text-xs text-gray-400 print:block hidden">
          OhmGuard - {t('reports.title', 'Rapport d\'événements')} - {formatPeriod()} - ID: {reportId}
        </div>
      </div>
    </>
  );
});

ReportTemplate.displayName = 'ReportTemplate';

export default ReportTemplate;
