/**
 * ReportTemplate - Template HTML print-friendly pour les rapports
 * Design compact et professionnel
 */
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Shield } from 'lucide-react';

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

  const formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper pour obtenir une location lisible
  const getLocationDisplay = (event) => {
    if (event.location_path && typeof event.location_path === 'string') {
      return event.location_path;
    }
    if (event.location && typeof event.location === 'string') {
      return event.location;
    }
    if (event.radar_name) return event.radar_name;
    return '-';
  };

  // Couleurs pour les types
  const getTypeStyle = (type) => {
    switch (type) {
      case 'FALL': return { bg: '#fee2e2', color: '#991b1b' };
      case 'PRE_FALL': return { bg: '#ffedd5', color: '#9a3412' };
      case 'PRESENCE': return { bg: '#dbeafe', color: '#1e40af' };
      case 'INACTIVITY': return { bg: '#fef3c7', color: '#92400e' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'HIGH': return { bg: '#fee2e2', color: '#991b1b' };
      case 'MED': return { bg: '#fef3c7', color: '#92400e' };
      default: return { bg: '#dcfce7', color: '#166534' };
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'NEW': return { bg: '#fef3c7', color: '#92400e' };
      case 'ACK': return { bg: '#dbeafe', color: '#1e40af' };
      case 'RESOLVED': return { bg: '#dcfce7', color: '#166534' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  return (
    <div 
      ref={ref} 
      className="report-container bg-white text-gray-900"
      data-testid="report-template"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* ========== PAGE DE GARDE ========== */}
      <div style={{ minHeight: '85vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
            <Shield style={{ width: '48px', height: '48px', color: '#06B6D4' }} />
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1E3A5F' }}>OhmGuard</span>
          </div>
          
          {/* Titre */}
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            {t('reports.title', 'Rapport d\'événements')}
          </h1>
          <div style={{ width: '80px', height: '3px', backgroundColor: '#06B6D4', margin: '0 auto 2rem auto', borderRadius: '2px' }} />
          
          {/* Infos clés */}
          <div style={{ fontSize: '1rem', color: '#4b5563', marginBottom: '0.5rem' }}>
            <strong>{t('reports.period', 'Période')}:</strong> {formatPeriod()}
          </div>
          {filters.clientName && (
            <div style={{ fontSize: '1rem', color: '#4b5563' }}>
              <strong>{t('reports.client', 'Client')}:</strong> {filters.clientName}
              {filters.buildingName && ` > ${filters.buildingName}`}
            </div>
          )}
          
          {/* Métadonnées */}
          <div style={{ marginTop: '3rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            <p>{t('reports.generated_at', 'Généré le')}: {formatDateTime(generatedAt)}</p>
            <p>{t('reports.generated_by', 'Par')}: {generatedBy}</p>
            <p style={{ fontFamily: 'monospace', marginTop: '0.25rem' }}>ID: {reportId}</p>
          </div>
        </div>
      </div>

      {/* ========== RÉSUMÉ EXÉCUTIF ========== */}
      <div style={{ padding: '1.5rem', pageBreakBefore: 'always' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1E3A5F', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #06B6D4' }}>
          {t('reports.executive_summary', 'Résumé Exécutif')}
        </h2>
        
        {/* Stats globales - ligne compacte */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1E3A5F' }}>{summary.total || 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{t('reports.total_events', 'Total')}</div>
          </div>
          <div style={{ backgroundColor: '#fef2f2', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>{summary.byType?.FALL || 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{t('events.type_fall', 'Chutes')}</div>
          </div>
          <div style={{ backgroundColor: '#fffbeb', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#d97706' }}>{summary.byStatus?.NEW || 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{t('events.status_new', 'Nouveaux')}</div>
          </div>
          <div style={{ backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>{summary.byStatus?.RESOLVED || 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{t('events.status_resolved', 'Résolus')}</div>
          </div>
        </div>

        {/* Répartition par type et statut côte à côte */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>{t('reports.by_type', 'Par type')}</h3>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>{t('events.event_type', 'Type')}</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>Nb</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byType || {}).map(([type, count]) => (
                  <tr key={type} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{t(`events.type_${type.toLowerCase()}`, type)}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontFamily: 'monospace' }}>{count}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontFamily: 'monospace', color: '#6b7280' }}>
                      {summary.total ? ((count / summary.total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>{t('reports.by_status', 'Par statut')}</h3>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>{t('status', 'Statut')}</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>Nb</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byStatus || {}).map(([status, count]) => (
                  <tr key={status} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{t(`events.status_${status.toLowerCase()}`, status)}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontFamily: 'monospace' }}>{count}</td>
                    <td style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontFamily: 'monospace', color: '#6b7280' }}>
                      {summary.total ? ((count / summary.total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Temps moyen et Top zones côte à côte */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          {avgAckTime !== null && (
            <div style={{ backgroundColor: '#eff6ff', borderRadius: '6px', padding: '0.75rem' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e40af' }}>
                {t('reports.avg_ack_time', 'Temps moyen acquit.')}
              </h3>
              <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2563eb' }}>
                {avgAckTime < 60 
                  ? `${avgAckTime.toFixed(0)}s`
                  : `${(avgAckTime / 60).toFixed(1)}min`
                }
              </p>
            </div>
          )}

          {topZones.length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {t('reports.top_zones', 'Top 5 zones')}
              </h3>
              <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {topZones.slice(0, 5).map((zone, idx) => (
                    <tr key={zone.location || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.2rem', fontWeight: 'bold', color: '#06B6D4', width: '20px' }}>{idx + 1}</td>
                      <td style={{ padding: '0.2rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {zone.location || '-'}
                      </td>
                      <td style={{ padding: '0.2rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{zone.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========== TABLEAU DES ÉVÉNEMENTS (Style Excel) ========== */}
      <div style={{ padding: '1.5rem', pageBreakBefore: 'always' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1E3A5F', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #06B6D4' }}>
          {t('reports.event_details', 'Détails des événements')} ({events.length})
        </h2>
        
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <p>{t('reports.no_events', 'Aucun événement sur cette période')}</p>
          </div>
        ) : (
          <table style={{ 
            width: '100%', 
            fontSize: '0.65rem', 
            borderCollapse: 'collapse',
            border: '1px solid #d1d5db'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#1E3A5F', color: 'white' }}>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'left', borderRight: '1px solid #374151', width: '25px' }}>#</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'left', borderRight: '1px solid #374151', width: '90px' }}>Date/Heure</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderRight: '1px solid #374151', width: '65px' }}>Type</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderRight: '1px solid #374151', width: '45px' }}>Crit.</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderRight: '1px solid #374151', width: '55px' }}>Statut</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'left', borderRight: '1px solid #374151' }}>Localisation</th>
                <th style={{ padding: '0.4rem 0.3rem', textAlign: 'center', width: '35px' }}>Prés.</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 150).map((event, idx) => {
                const typeStyle = getTypeStyle(event.type);
                const sevStyle = getSeverityStyle(event.severity);
                const statusStyle = getStatusStyle(event.status);
                
                return (
                  <tr 
                    key={event.id || idx} 
                    style={{ 
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <td style={{ padding: '0.3rem', textAlign: 'center', borderRight: '1px solid #e5e7eb', fontFamily: 'monospace', color: '#9ca3af' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '0.3rem', borderRight: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '0.6rem' }}>
                      {formatShortDate(event.timestamp || event.occurred_at)}
                    </td>
                    <td style={{ padding: '0.3rem', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        backgroundColor: typeStyle.bg, 
                        color: typeStyle.color, 
                        padding: '1px 4px', 
                        borderRadius: '2px',
                        fontSize: '0.6rem',
                        fontWeight: '500'
                      }}>
                        {event.type}
                      </span>
                    </td>
                    <td style={{ padding: '0.3rem', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        backgroundColor: sevStyle.bg, 
                        color: sevStyle.color, 
                        padding: '1px 4px', 
                        borderRadius: '2px',
                        fontSize: '0.6rem',
                        fontWeight: '500'
                      }}>
                        {event.severity}
                      </span>
                    </td>
                    <td style={{ padding: '0.3rem', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        backgroundColor: statusStyle.bg, 
                        color: statusStyle.color, 
                        padding: '1px 4px', 
                        borderRadius: '2px',
                        fontSize: '0.6rem',
                        fontWeight: '500'
                      }}>
                        {event.status}
                      </span>
                    </td>
                    <td style={{ 
                      padding: '0.3rem', 
                      borderRight: '1px solid #e5e7eb',
                      maxWidth: '180px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {getLocationDisplay(event)}
                    </td>
                    <td style={{ padding: '0.3rem', textAlign: 'center' }}>
                      {event.presence_detected ? (
                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        
        {events.length > 150 && (
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.7rem', marginTop: '0.5rem' }}>
            ... {t('reports.and_more', 'et')} {events.length - 150} {t('reports.more_events', 'événements supplémentaires')}
          </p>
        )}
      </div>

      {/* ========== PIED DE PAGE / ANNEXE ========== */}
      <div style={{ padding: '1.5rem', borderTop: '1px solid #e5e7eb', marginTop: '1rem' }}>
        {/* Note RGPD */}
        <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '0.75rem', fontSize: '0.65rem', color: '#6b7280' }}>
          <strong style={{ color: '#374151' }}>{t('reports.gdpr_notice', 'Conformité RGPD')}:</strong>{' '}
          {t('reports.gdpr_text', 'Ce rapport peut contenir des données personnelles. Conformément au RGPD, ces données doivent être traitées de manière confidentielle.')}
        </div>
        
        {/* Méta-informations */}
        <div style={{ marginTop: '0.75rem', fontSize: '0.6rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            OhmGuard v1.0.0 • {formatPeriod()} • {events.length} événements
          </div>
          <div style={{ fontFamily: 'monospace' }}>
            {reportId}
          </div>
        </div>
      </div>
    </div>
  );
});

ReportTemplate.displayName = 'ReportTemplate';

export default ReportTemplate;
