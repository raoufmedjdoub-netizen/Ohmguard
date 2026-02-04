/**
 * SensorImportModal - Modal for batch importing sensors from CSV
 */
import React, { useState, useRef } from 'react';
import { 
  Upload, Download, FileText, CheckCircle2, XCircle, 
  AlertTriangle, Loader2, FileSpreadsheet, Plus, RefreshCw
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import api from '@/lib/api';

export function SensorImportModal({ open, onOpenChange, onImportComplete }) {
  const [step, setStep] = useState('upload'); // upload, preview, executing, complete
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const resetState = () => {
    setStep('upload');
    setCsvContent('');
    setFileName('');
    setPreview(null);
    setImportResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/sensors/import/template', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sensors_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Template téléchargé');
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Veuillez sélectionner un fichier CSV');
      return;
    }

    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvContent(e.target.result);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvContent) {
      toast.error('Veuillez d\'abord sélectionner un fichier');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/sensors/import/preview', {
        csv_content: csvContent
      });
      
      setPreview(response.data);
      setStep('preview');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    setStep('executing');
    setLoading(true);
    
    try {
      const response = await api.post('/sensors/import/execute', {
        csv_content: csvContent
      });
      
      setImportResult(response.data);
      setStep('complete');
      
      if (response.data.success) {
        toast.success(`Import terminé: ${response.data.created_sensors} créés, ${response.data.updated_sensors} mis à jour`);
        onImportComplete?.();
      } else {
        toast.warning('Import terminé avec des erreurs');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'import');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'update':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-green-500">Nouveau</Badge>;
      case 'update':
        return <Badge className="bg-blue-500">Mise à jour</Badge>;
      case 'error':
        return <Badge className="bg-red-500">Erreur</Badge>;
      default:
        return <Badge variant="outline">En attente</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import de capteurs
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Importez plusieurs capteurs en une seule opération via un fichier CSV'}
            {step === 'preview' && 'Vérifiez les données avant de confirmer l\'import'}
            {step === 'executing' && 'Import en cours...'}
            {step === 'complete' && 'Import terminé'}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-6 py-4">
            {/* Template download */}
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Template CSV</h4>
                    <p className="text-sm text-muted-foreground">
                      Téléchargez le modèle et remplissez-le avec vos données
                    </p>
                  </div>
                  <Button variant="outline" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Télécharger
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* File upload area */}
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                className="hidden"
              />
              
              {fileName ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-primary" />
                  <p className="font-medium">{fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    Cliquez pour changer de fichier
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="font-medium">Cliquez ou glissez un fichier CSV</p>
                  <p className="text-sm text-muted-foreground">
                    Format accepté : .csv
                  </p>
                </div>
              )}
            </div>

            {/* CSV Format info */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-2">Colonnes requises</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><code className="bg-muted px-1 rounded">serial_number</code> - N° de série *</div>
                  <div><code className="bg-muted px-1 rounded">name</code> - Nom (optionnel)</div>
                  <div><code className="bg-muted px-1 rounded">organisation</code> - Organisation *</div>
                  <div><code className="bg-muted px-1 rounded">batiment</code> - Bâtiment *</div>
                  <div><code className="bg-muted px-1 rounded">etage</code> - Étage *</div>
                  <div><code className="bg-muted px-1 rounded">chambre</code> - Chambre *</div>
                  <div><code className="bg-muted px-1 rounded">espace</code> - Espace *</div>
                  <div><code className="bg-muted px-1 rounded">model</code> - Modèle</div>
                  <div><code className="bg-muted px-1 rounded">firmware</code> - Firmware</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * Champs obligatoires. Les organisations/bâtiments/étages/chambres/espaces seront créés automatiquement s&apos;ils n&apos;existent pas.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4 py-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.new_sensors}</p>
                  <p className="text-sm text-muted-foreground">Nouveaux capteurs</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{preview.updates}</p>
                  <p className="text-sm text-muted-foreground">Mises à jour</p>
                </CardContent>
              </Card>
              <Card className="border-red-500/30 bg-red-500/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.errors}</p>
                  <p className="text-sm text-muted-foreground">Erreurs</p>
                </CardContent>
              </Card>
            </div>

            {/* Locations to create */}
            {(preview.locations_to_create.organisations.length > 0 ||
              preview.locations_to_create.batiments.length > 0 ||
              preview.locations_to_create.etages.length > 0 ||
              preview.locations_to_create.chambres.length > 0 ||
              preview.locations_to_create.espaces.length > 0) && (
              <Card className="border-amber-500/30">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="font-medium">Emplacements à créer automatiquement</h4>
                  </div>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    {preview.locations_to_create.organisations.length > 0 && (
                      <p>Organisations: {preview.locations_to_create.organisations.join(', ')}</p>
                    )}
                    {preview.locations_to_create.batiments.length > 0 && (
                      <p>Bâtiments: {preview.locations_to_create.batiments.length} à créer</p>
                    )}
                    {preview.locations_to_create.etages.length > 0 && (
                      <p>Étages: {preview.locations_to_create.etages.length} à créer</p>
                    )}
                    {preview.locations_to_create.chambres.length > 0 && (
                      <p>Chambres: {preview.locations_to_create.chambres.length} à créer</p>
                    )}
                    {preview.locations_to_create.espaces.length > 0 && (
                      <p>Espaces: {preview.locations_to_create.espaces.length} à créer</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed results */}
            <Tabs defaultValue="all" className="w-full">
              <TabsList>
                <TabsTrigger value="all">Tous ({preview.total_lines})</TabsTrigger>
                <TabsTrigger value="new">Nouveaux ({preview.new_sensors})</TabsTrigger>
                <TabsTrigger value="update">Mises à jour ({preview.updates})</TabsTrigger>
                {preview.errors > 0 && (
                  <TabsTrigger value="errors" className="text-red-500">
                    Erreurs ({preview.errors})
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="all" className="mt-4">
                <ScrollArea className="h-[300px] rounded-md border p-4">
                  <div className="space-y-2">
                    {preview.results.map((result, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(result.status)}
                          <div>
                            <p className="font-mono text-sm">{result.serial_number || '(vide)'}</p>
                            <p className="text-xs text-muted-foreground">
                              Ligne {result.line_number}: {result.data?.organisation} &gt; {result.data?.chambre}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(result.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="new" className="mt-4">
                <ScrollArea className="h-[300px] rounded-md border p-4">
                  <div className="space-y-2">
                    {preview.results.filter(r => r.status === 'new').map((result, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 rounded-lg bg-green-500/5"
                      >
                        <div className="flex items-center gap-3">
                          <Plus className="h-4 w-4 text-green-500" />
                          <div>
                            <p className="font-mono text-sm">{result.serial_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {result.data?.organisation} &gt; {result.data?.batiment} &gt; {result.data?.chambre}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="update" className="mt-4">
                <ScrollArea className="h-[300px] rounded-md border p-4">
                  <div className="space-y-2">
                    {preview.results.filter(r => r.status === 'update').map((result, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 rounded-lg bg-blue-500/5"
                      >
                        <div className="flex items-center gap-3">
                          <RefreshCw className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="font-mono text-sm">{result.serial_number}</p>
                            <p className="text-xs text-muted-foreground">{result.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              {preview.errors > 0 && (
                <TabsContent value="errors" className="mt-4">
                  <ScrollArea className="h-[300px] rounded-md border p-4">
                    <div className="space-y-2">
                      {preview.results.filter(r => r.status === 'error').map((result, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded-lg bg-red-500/5"
                        >
                          <div className="flex items-center gap-3">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <div>
                              <p className="font-mono text-sm">Ligne {result.line_number}</p>
                              <p className="text-xs text-red-500">{result.message}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}

        {/* Step: Executing */}
        {step === 'executing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
            <p className="mt-4 font-medium">Import en cours...</p>
            <p className="text-sm text-muted-foreground">
              Création des emplacements et des capteurs
            </p>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && importResult && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              {importResult.success ? (
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              ) : (
                <AlertTriangle className="h-16 w-16 mx-auto text-amber-500" />
              )}
              <h3 className="text-xl font-semibold mt-4">
                {importResult.success ? 'Import réussi !' : 'Import terminé avec des erreurs'}
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xl font-bold text-green-600">{importResult.created_sensors}</p>
                  <p className="text-xs text-muted-foreground">Capteurs créés</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xl font-bold text-blue-600">{importResult.updated_sensors}</p>
                  <p className="text-xs text-muted-foreground">Capteurs mis à jour</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xl font-bold text-purple-600">
                    {importResult.created_organisations + importResult.created_batiments + 
                     importResult.created_etages + importResult.created_chambres + importResult.created_espaces}
                  </p>
                  <p className="text-xs text-muted-foreground">Emplacements créés</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xl font-bold text-red-600">{importResult.errors?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Erreurs</p>
                </CardContent>
              </Card>
            </div>

            {importResult.errors?.length > 0 && (
              <Card className="border-red-500/30">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-red-500 mb-2">Erreurs détectées</h4>
                  <ScrollArea className="h-[150px]">
                    <ul className="text-sm space-y-1">
                      {importResult.errors.map((err, idx) => (
                        <li key={idx} className="text-red-600">{err}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={handleClose}>Annuler</Button>
              <Button onClick={handlePreview} disabled={!csvContent || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Analyser le fichier
              </Button>
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Retour
              </Button>
              <Button 
                onClick={handleExecuteImport} 
                disabled={preview?.errors === preview?.total_lines}
              >
                Confirmer l&apos;import
              </Button>
            </>
          )}
          
          {step === 'complete' && (
            <Button onClick={handleClose}>Fermer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SensorImportModal;
