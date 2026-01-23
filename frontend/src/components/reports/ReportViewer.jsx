/**
 * ReportViewer - Visualiseur et exportateur de rapports
 */
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReportTemplate } from './ReportTemplate';
import { cn } from '@/lib/utils';
import {
  Eye,
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

  // Fonction d'impression/PDF
  const handlePrint = useReactToPrint({
    contentRef: reportRef,
    documentTitle: `OhmGuard-Report-${reportId}`,
    onBeforePrint: () => setIsPrinting(true),
    onAfterPrint: () => setIsPrinting(false),
  });

  // Export CSV
  const handleExportCSV = () => {
    const events = data?.events || [];
    const headers = ['ID', 'Timestamp', 'Type', 'Severity', 'Status', 'Location', 'Sensor', 'Presence'];
    const rows = events.map(e => [
      e.id,
      e.timestamp || e.occurred_at,
      e.type,
      e.severity,
      e.status,
      e.location_path || '',
      e.sensor_id || '',
      e.presence_detected ? 'Yes' : 'No'
    ]);
    
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OhmGuard-Report-${reportId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
