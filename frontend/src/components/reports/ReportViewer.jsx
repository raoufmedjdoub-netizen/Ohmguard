/**
 * ReportViewer - Visualiseur et exportateur de rapports
 */
import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ReportTemplate } from './ReportTemplate';
import { cn } from '@/lib/utils';
import {
  Printer,
  Download,
  FileText,
  Loader2,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';

export function ReportViewer({ 
  data, 
  filters, 
  generatedAt, 
  generatedBy,
  reportId,
  onClose 
}) {
  const { t } = useTranslation();
  const reportRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Fonction d'impression/PDF utilisant window.print() natif
  const handlePrint = useCallback(() => {
    if (!reportRef.current) return;
    
    setIsPrinting(true);
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      setIsPrinting(false);
      alert(t('reports.popup_blocked', 'Veuillez autoriser les popups pour imprimer'));
      return;
    }

    // Copier le contenu HTML du rapport
    const reportContent = reportRef.current.innerHTML;
    
    // Styles pour l'impression
    const printStyles = `
      <style>
        @page {
          size: A4;
          margin: 15mm 10mm;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0;
          padding: 0;
        }
        
        .page-break {
          page-break-before: always;
        }
        
        .avoid-break {
          page-break-inside: avoid;
        }
        
        table {
          page-break-inside: auto;
          border-collapse: collapse;
          width: 100%;
        }
        
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        
        thead {
          display: table-header-group;
        }
        
        /* Tailwind-like utility classes */
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }
        .font-mono { font-family: monospace; }
        .text-xs { font-size: 0.75rem; }
        .text-sm { font-size: 0.875rem; }
        .text-lg { font-size: 1.125rem; }
        .text-xl { font-size: 1.25rem; }
        .text-2xl { font-size: 1.5rem; }
        .text-3xl { font-size: 1.875rem; }
        .text-4xl { font-size: 2.25rem; }
        .mb-2 { margin-bottom: 0.5rem; }
        .mb-3 { margin-bottom: 0.75rem; }
        .mb-6 { margin-bottom: 1.5rem; }
        .mb-8 { margin-bottom: 2rem; }
        .mt-3 { margin-top: 0.75rem; }
        .mt-8 { margin-top: 2rem; }
        .p-4 { padding: 1rem; }
        .p-8 { padding: 2rem; }
        .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
        .pt-3 { padding-top: 0.75rem; }
        .pt-8 { padding-top: 2rem; }
        .space-y-1 > * + * { margin-top: 0.25rem; }
        .space-y-4 > * + * { margin-top: 1rem; }
        .space-y-8 > * + * { margin-top: 2rem; }
        .gap-3 { gap: 0.75rem; }
        .gap-4 { gap: 1rem; }
        .rounded-lg { border-radius: 0.5rem; }
        .border { border: 1px solid #e5e7eb; }
        .border-b { border-bottom: 1px solid #e5e7eb; }
        .border-t { border-top: 1px solid #e5e7eb; }
        .border-gray-100 { border-color: #f3f4f6; }
        .border-gray-200 { border-color: #e5e7eb; }
        .bg-gray-50 { background-color: #f9fafb; }
        .bg-gray-100 { background-color: #f3f4f6; }
        .bg-blue-50 { background-color: #eff6ff; }
        .bg-red-50 { background-color: #fef2f2; }
        .bg-red-100 { background-color: #fee2e2; }
        .bg-amber-50 { background-color: #fffbeb; }
        .bg-amber-100 { background-color: #fef3c7; }
        .bg-green-50 { background-color: #f0fdf4; }
        .bg-green-100 { background-color: #dcfce7; }
        .bg-blue-100 { background-color: #dbeafe; }
        .bg-orange-100 { background-color: #ffedd5; }
        .text-gray-400 { color: #9ca3af; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-600 { color: #4b5563; }
        .text-gray-800 { color: #1f2937; }
        .text-gray-900 { color: #111827; }
        .text-red-600 { color: #dc2626; }
        .text-red-800 { color: #991b1b; }
        .text-amber-600 { color: #d97706; }
        .text-amber-800 { color: #92400e; }
        .text-green-600 { color: #16a34a; }
        .text-green-800 { color: #166534; }
        .text-blue-600 { color: #2563eb; }
        .text-blue-700 { color: #1d4ed8; }
        .text-blue-800 { color: #1e40af; }
        .text-orange-800 { color: #9a3412; }
        .min-h-screen { min-height: 100vh; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .items-center { align-items: center; }
        .justify-center { justify-content: center; }
        .justify-between { justify-content: space-between; }
        .grid { display: grid; }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .italic { font-style: italic; }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        /* Custom styles */
        .report-container { background: white; color: #111827; }
        .text-\\[\\#1E3A5F\\] { color: #1E3A5F; }
        .text-\\[\\#06B6D4\\] { color: #06B6D4; }
        .border-\\[\\#06B6D4\\] { border-color: #06B6D4; }
        .bg-\\[\\#06B6D4\\] { background-color: #06B6D4; }
        
        /* Hide Lucide icons in print - use text instead */
        svg { display: none; }
      </style>
    `;

    // Écrire le document d'impression
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OhmGuard Report - ${reportId}</title>
          ${printStyles}
        </head>
        <body>
          <div class="report-container">
            ${reportContent}
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        setIsPrinting(false);
      }, 250);
    };
  }, [reportId, t]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const events = data?.events || [];
    const headers = ['ID', 'Timestamp', 'Type', 'Severity', 'Status', 'Location', 'Sensor', 'Presence'];
    const rows = events.map(e => [
      e.id || '',
      e.timestamp || e.occurred_at || '',
      e.type || '',
      e.severity || '',
      e.status || '',
      typeof e.location_path === 'string' ? e.location_path : '',
      e.sensor_id || '',
      e.presence_detected ? 'Yes' : 'No'
    ]);
    
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OhmGuard-Report-${reportId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, reportId]);

  if (!data) {
    return null;
  }

  return (
    <div 
      className={cn(
        'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4',
        isFullscreen && 'p-0'
      )}
      data-testid="report-viewer"
    >
      <div 
        className={cn(
          'bg-white rounded-lg shadow-2xl flex flex-col',
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[90vh]'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[#06B6D4]" />
            <h2 className="text-lg font-semibold text-[#1E3A5F]">
              {t('reports.preview', 'Aperçu du rapport')}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Bouton Print/PDF */}
            <Button 
              onClick={handlePrint}
              variant="default"
              className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90"
              disabled={isPrinting}
              data-testid="print-report-btn"
            >
              {isPrinting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              {t('reports.print_pdf', 'Imprimer / PDF')}
            </Button>
            
            {/* Bouton Export CSV */}
            <Button 
              onClick={handleExportCSV}
              variant="outline"
              data-testid="export-csv-btn"
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            
            {/* Fullscreen toggle */}
            <Button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              variant="ghost"
              size="icon"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            
            {/* Fermer */}
            <Button 
              onClick={onClose}
              variant="ghost"
              size="icon"
              data-testid="close-report-btn"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Contenu du rapport (scrollable) */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="max-w-[210mm] mx-auto shadow-lg">
            <ReportTemplate
              ref={reportRef}
              data={data}
              filters={filters}
              generatedAt={generatedAt}
              generatedBy={generatedBy}
              reportId={reportId}
            />
          </div>
        </div>
        
        {/* Footer avec info */}
        <div className="p-3 border-t bg-gray-50 text-center text-xs text-gray-500 rounded-b-lg">
          {t('reports.print_tip', 'Conseil : Utilisez "Imprimer / PDF" puis choisissez "Enregistrer au format PDF" dans la boîte de dialogue d\'impression')}
        </div>
      </div>
    </div>
  );
}

export default ReportViewer;
