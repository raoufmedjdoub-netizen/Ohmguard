/**
 * SensorImportModal - Modal for batch importing sensors with interactive table
 * Supports both CSV upload and manual table entry
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, Download, FileText, CheckCircle2, XCircle, 
  AlertTriangle, Loader2, FileSpreadsheet, Plus, RefreshCw,
  Trash2, Copy, ClipboardPaste, Table, ChevronDown, Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// Empty row template
const EMPTY_ROW = {
  serial_number: '',
  name: '',
  organisation: '',
  batiment: '',
  etage: '',
  chambre: '',
  espace: '',
  model: '',
  firmware: ''
};

// Autocomplete Input Component
function AutocompleteInput({ value, onChange, options, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              onChange(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
      </PopoverTrigger>
      {filteredOptions.length > 0 && (
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {filteredOptions.slice(0, 10).map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => {
                      onChange(option);
                      setInputValue(option);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}

export function SensorImportModal({ open, onOpenChange, onImportComplete }) {
  const [mode, setMode] = useState('table'); // 'table' or 'csv'
  const [step, setStep] = useState('edit'); // edit, preview, executing, complete
  const [rows, setRows] = useState([{ ...EMPTY_ROW, id: 1 }]);
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const nextId = useRef(2);
  
  // Autocomplete options
  const [organisations, setOrganisations] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [etages, setEtages] = useState([]);
  const [chambres, setChambres] = useState([]);
  const [espaces, setEspaces] = useState([]);

  // Load existing locations for autocomplete
  useEffect(() => {
    if (open) {
      loadLocations();
    }
  }, [open]);

  const loadLocations = async () => {
    try {
      // Load organisations (clients)
      const clientsRes = await api.get('/clients');
      const orgNames = (clientsRes.data || []).map(c => c.name);
      setOrganisations([...new Set(orgNames)]);

      // Load buildings
      const buildingsRes = await api.get('/buildings');
      const buildingNames = (buildingsRes.data || []).map(b => b.name);
      setBatiments([...new Set(buildingNames)]);

      // Load floors
      const floorsRes = await api.get('/floors');
      const floorNames = (floorsRes.data || []).map(f => f.name);
      setEtages([...new Set(floorNames)]);

      // Load rooms
      const roomsRes = await api.get('/rooms');
      const roomNames = (roomsRes.data || []).map(r => r.name);
      setChambres([...new Set(roomNames)]);
      
      // Extract space names from rooms
      const spaceNames = [];
      (roomsRes.data || []).forEach(r => {
        (r.spaces || []).forEach(s => {
          if (s.name) spaceNames.push(s.name);
        });
      });
      setEspaces([...new Set(spaceNames)]);
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const resetState = () => {
    setMode('table');
    setStep('edit');
    setRows([{ ...EMPTY_ROW, id: 1 }]);
    setCsvContent('');
    setFileName('');
    setPreview(null);
    setImportResult(null);
    setLoading(false);
    nextId.current = 2;
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  // Table row management
  const addRow = () => {
    setRows([...rows, { ...EMPTY_ROW, id: nextId.current++ }]);
  };

  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const updateRow = (id, field, value) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const duplicateRow = (id) => {
    const rowToDuplicate = rows.find(r => r.id === id);
    if (rowToDuplicate) {
      const newRow = { ...rowToDuplicate, id: nextId.current++, serial_number: '' };
      const index = rows.findIndex(r => r.id === id);
      const newRows = [...rows];
      newRows.splice(index + 1, 0, newRow);
      setRows(newRows);
    }
  };

  // Paste from clipboard (Excel/Sheets format)
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const lines = text.trim().split('\n');
      
      if (lines.length === 0) {
        toast.error('Aucune donnée dans le presse-papiers');
        return;
      }

      const newRows = [];
      lines.forEach((line, idx) => {
        const cells = line.split('\t');
        if (cells.length >= 1 && cells[0].trim()) {
          newRows.push({
            id: nextId.current++,
            serial_number: cells[0]?.trim() || '',
            name: cells[1]?.trim() || '',
            organisation: cells[2]?.trim() || '',
            batiment: cells[3]?.trim() || '',
            etage: cells[4]?.trim() || '',
            chambre: cells[5]?.trim() || '',
            espace: cells[6]?.trim() || '',
            model: cells[7]?.trim() || '',
            firmware: cells[8]?.trim() || ''
          });
        }
      });

      if (newRows.length > 0) {
        // Replace empty first row or append
        if (rows.length === 1 && !rows[0].serial_number) {
          setRows(newRows);
        } else {
          setRows([...rows, ...newRows]);
        }
        toast.success(`${newRows.length} lignes collées`);
      }
    } catch (error) {
      toast.error('Erreur lors du collage');
    }
  };

  // Convert table rows to CSV
  const tableToCsv = () => {
    const headers = ['serial_number', 'name', 'organisation', 'batiment', 'etage', 'chambre', 'espace', 'model', 'firmware'];
    const csvLines = [headers.join(',')];
    
    rows.forEach(row => {
      const values = headers.map(h => {
        const val = row[h] || '';
        // Escape commas and quotes
        if (val.includes(',') || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvLines.push(values.join(','));
    });
    
    return csvLines.join('\n');
  };

  // Download Excel template
  const downloadTemplate = async () => {
    try {
      const response = await api.get('/sensors/import/template?format=xlsx', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_import_capteurs.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Template Excel téléchargé');
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    }
  };

  // Handle file selection (CSV or Excel)
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      toast.error('Veuillez sélectionner un fichier CSV ou Excel (.xlsx)');
      return;
    }

    setFileName(file.name);
    
    if (isCsv) {
      // Parse CSV file
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        setCsvContent(content);
        parseCsvToRows(content);
      };
      reader.readAsText(file);
    } else {
      // Parse Excel file using SheetJS (loaded dynamically)
      try {
        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            
            if (jsonData.length > 1) {
              // First row is headers
              const headers = jsonData[0].map(h => 
                h?.toString().toLowerCase()
                  .replace('n° série', 'serial_number')
                  .replace('organisation', 'organisation')
                  .replace('bâtiment', 'batiment')
                  .replace('étage', 'etage')
                  .replace('chambre', 'chambre')
                  .replace('espace', 'espace')
                  .replace('modèle', 'model')
                  .replace('nom', 'name')
                  .replace('firmware', 'firmware')
                  .replace(/\s*\*\s*$/, '') // Remove asterisk
                  .trim()
              );
              
              const parsedRows = [];
              for (let i = 1; i < jsonData.length; i++) {
                const rowValues = jsonData[i];
                if (rowValues && rowValues.length > 0 && rowValues[0]) {
                  const row = { id: nextId.current++ };
                  headers.forEach((h, idx) => {
                    if (h) {
                      row[h] = rowValues[idx]?.toString()?.trim() || '';
                    }
                  });
                  // Only add if serial_number is not empty
                  if (row.serial_number) {
                    parsedRows.push(row);
                  }
                }
              }
              
              if (parsedRows.length > 0) {
                setRows(parsedRows);
                setMode('table');
                toast.success(`${parsedRows.length} lignes importées depuis Excel`);
              } else {
                toast.warning('Aucune donnée valide trouvée dans le fichier');
              }
            }
          } catch (parseError) {
            console.error('Excel parse error:', parseError);
            toast.error('Erreur lors de la lecture du fichier Excel');
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (importError) {
        toast.error('Erreur lors du chargement du module Excel');
      }
    }
  };

  // Parse CSV content to rows
  const parseCsvToRows = (content) => {
    const lines = content.split('\n');
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const parsedRows = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.length > 0 && values[0]) {
          const row = { id: nextId.current++ };
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          parsedRows.push(row);
        }
      }
      
      if (parsedRows.length > 0) {
        setRows(parsedRows);
        setMode('table');
        toast.success(`${parsedRows.length} lignes importées du CSV`);
      }
    }
  };

  // Preview import
  const handlePreview = async () => {
    // Validate at least one row has data
    const validRows = rows.filter(r => r.serial_number?.trim());
    if (validRows.length === 0) {
      toast.error('Veuillez ajouter au moins un capteur avec un numéro de série');
      return;
    }

    setLoading(true);
    try {
      const csv = tableToCsv();
      const response = await api.post('/sensors/import/preview', {
        csv_content: csv
      });
      
      setPreview(response.data);
      setStep('preview');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  // Execute import
  const handleExecuteImport = async () => {
    setStep('executing');
    setLoading(true);
    
    try {
      const csv = tableToCsv();
      const response = await api.post('/sensors/import/execute', {
        csv_content: csv
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
      case 'new': return <Plus className="h-4 w-4 text-green-500" />;
      case 'update': return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'new': return <Badge className="bg-green-500">Nouveau</Badge>;
      case 'update': return <Badge className="bg-blue-500">Mise à jour</Badge>;
      case 'error': return <Badge className="bg-red-500">Erreur</Badge>;
      default: return <Badge variant="outline">En attente</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] w-[1200px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import de capteurs
          </DialogTitle>
          <DialogDescription>
            {step === 'edit' && 'Remplissez le tableau ou importez un fichier CSV'}
            {step === 'preview' && 'Vérifiez les données avant de confirmer l\'import'}
            {step === 'executing' && 'Import en cours...'}
            {step === 'complete' && 'Import terminé'}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Edit (Table mode) */}
        {step === 'edit' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Ligne
                </Button>
                <Button variant="outline" size="sm" onClick={handlePaste}>
                  <ClipboardPaste className="h-4 w-4 mr-1" />
                  Coller
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".csv"
                  className="hidden"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1" />
                  Template Excel
                </Button>
                <Badge variant="outline">{rows.length} ligne(s)</Badge>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <ScrollArea className="h-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium w-[40px]">#</th>
                      <th className="px-2 py-2 text-left font-medium min-w-[140px]">
                        N° Série <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[120px]">Nom</th>
                      <th className="px-2 py-2 text-left font-medium min-w-[130px]">
                        Organisation <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[120px]">
                        Bâtiment <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[100px]">
                        Étage <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[100px]">
                        Chambre <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[100px]">
                        Espace <span className="text-red-500">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium min-w-[90px]">Modèle</th>
                      <th className="px-2 py-2 text-left font-medium w-[60px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.id} className="border-t hover:bg-muted/30">
                        <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                        <td className="px-1 py-1">
                          <Input
                            value={row.serial_number}
                            onChange={(e) => updateRow(row.id, 'serial_number', e.target.value)}
                            placeholder="VPRD-XXXX"
                            className="h-8 text-xs font-mono"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={row.name}
                            onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                            placeholder="Nom (optionnel)"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <AutocompleteInput
                            value={row.organisation}
                            onChange={(v) => updateRow(row.id, 'organisation', v)}
                            options={organisations}
                            placeholder="Organisation"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <AutocompleteInput
                            value={row.batiment}
                            onChange={(v) => updateRow(row.id, 'batiment', v)}
                            options={batiments}
                            placeholder="Bâtiment"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <AutocompleteInput
                            value={row.etage}
                            onChange={(v) => updateRow(row.id, 'etage', v)}
                            options={etages}
                            placeholder="Étage"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <AutocompleteInput
                            value={row.chambre}
                            onChange={(v) => updateRow(row.id, 'chambre', v)}
                            options={chambres}
                            placeholder="Chambre"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <AutocompleteInput
                            value={row.espace}
                            onChange={(v) => updateRow(row.id, 'espace', v)}
                            options={espaces}
                            placeholder="Espace"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={row.model}
                            onChange={(e) => updateRow(row.id, 'model', e.target.value)}
                            placeholder="Modèle"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => duplicateRow(row.id)}
                              title="Dupliquer"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeRow(row.id)}
                              disabled={rows.length === 1}
                              title="Supprimer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            {/* Help */}
            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Conseils :</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Copiez-collez directement depuis Excel ou Google Sheets (colonnes dans l'ordre)</li>
                <li>Les champs avec <span className="text-red-500">*</span> sont obligatoires</li>
                <li>Les organisations/bâtiments/étages/chambres/espaces inexistants seront créés automatiquement</li>
                <li>Si un capteur existe déjà (même N° série), il sera mis à jour</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
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
                <ScrollArea className="h-[250px] rounded-md border p-4">
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
                <ScrollArea className="h-[250px] rounded-md border p-4">
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
                <ScrollArea className="h-[250px] rounded-md border p-4">
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
                  <ScrollArea className="h-[250px] rounded-md border p-4">
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
          <div className="space-y-4">
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
          {step === 'edit' && (
            <>
              <Button variant="outline" onClick={handleClose}>Annuler</Button>
              <Button onClick={handlePreview} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Analyser et prévisualiser
              </Button>
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('edit')}>
                Retour au tableau
              </Button>
              <Button 
                onClick={handleExecuteImport} 
                disabled={preview?.errors === preview?.total_lines}
              >
                Confirmer l'import
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
