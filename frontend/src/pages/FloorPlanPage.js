import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  Map,
  Upload,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Building,
  Layers,
  Radio,
  ImageOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Download,
  Eye
} from 'lucide-react';

// Zoom/Pan component with mouse controls
function FloorPlanViewer({ imageUrl, onLoad, children }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.min(Math.max(0.1, prev * delta), 5));
  }, []);

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const zoomIn = () => setScale(prev => Math.min(prev * 1.2, 5));
  const zoomOut = () => setScale(prev => Math.max(prev * 0.8, 0.1));

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  return (
    <div className="relative h-full">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 border">
        <Button variant="ghost" size="sm" onClick={zoomIn} title="Zoom avant">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={zoomOut} title="Zoom arrière">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={resetView} title="Réinitialiser">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground self-center px-2">
          {Math.round(scale * 100)}%
        </span>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="h-full overflow-hidden cursor-grab active:cursor-grabbing bg-muted/30 rounded-lg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
          className="h-full w-full flex items-center justify-center"
        >
          {imageUrl ? (
            <div className="relative">
              <img
                src={imageUrl}
                alt="Plan d'étage"
                className="max-w-none"
                onLoad={() => {
                  setImageLoaded(true);
                  onLoad?.();
                }}
                draggable={false}
              />
              {/* Markers overlay - for Phase 2 */}
              {imageLoaded && children}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12">
              <ImageOff className="h-16 w-16 mb-4 opacity-50" />
              <p>Aucun plan chargé</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FloorPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Selections
  const [organisations, setOrganisations] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  
  const [selectedOrg, setSelectedOrg] = useState(searchParams.get('org') || '');
  const [selectedBuilding, setSelectedBuilding] = useState(searchParams.get('building') || '');
  const [selectedFloor, setSelectedFloor] = useState(searchParams.get('floor') || '');
  
  // Plan data
  const [planData, setPlanData] = useState(null);
  const [planImageUrl, setPlanImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  const fileInputRef = useRef(null);

  // Load organisations
  useEffect(() => {
    const loadOrganisations = async () => {
      try {
        const res = await api.get('/clients');
        setOrganisations(res.data);
        
        // Auto-select first org if none selected
        if (!selectedOrg && res.data.length > 0) {
          setSelectedOrg(res.data[0].id);
        }
      } catch (error) {
        console.error('Failed to load organisations:', error);
      }
    };
    loadOrganisations();
  }, []);

  // Load buildings when org changes
  useEffect(() => {
    if (!selectedOrg) {
      setBuildings([]);
      setSelectedBuilding('');
      return;
    }
    
    const loadBuildings = async () => {
      try {
        const res = await api.get(`/clients/${selectedOrg}/buildings`);
        setBuildings(res.data);
        
        // Auto-select first building
        if (res.data.length > 0) {
          setSelectedBuilding(res.data[0].id);
        } else {
          setSelectedBuilding('');
        }
      } catch (error) {
        console.error('Failed to load buildings:', error);
      }
    };
    loadBuildings();
  }, [selectedOrg]);

  // Load floors when building changes
  useEffect(() => {
    if (!selectedBuilding) {
      setFloors([]);
      setSelectedFloor('');
      return;
    }
    
    const loadFloors = async () => {
      try {
        const res = await api.get(`/buildings/${selectedBuilding}/floors`);
        setFloors(res.data);
        
        // Auto-select first floor
        if (res.data.length > 0) {
          setSelectedFloor(res.data[0].id);
        } else {
          setSelectedFloor('');
        }
      } catch (error) {
        console.error('Failed to load floors:', error);
      }
    };
    loadFloors();
  }, [selectedBuilding]);

  // Load plan when floor changes
  useEffect(() => {
    if (!selectedFloor) {
      setPlanData(null);
      setPlanImageUrl(null);
      return;
    }
    
    const loadPlan = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/floors/${selectedFloor}/plan`);
        setPlanData(res.data);
        
        // Load image as blob and create object URL
        const imageRes = await api.get(`/floors/${selectedFloor}/plan/image`, {
          responseType: 'blob'
        });
        const imageUrl = URL.createObjectURL(imageRes.data);
        setPlanImageUrl(imageUrl);
      } catch (error) {
        if (error.response?.status === 404) {
          setPlanData(null);
          setPlanImageUrl(null);
        } else {
          console.error('Failed to load plan:', error);
        }
      } finally {
        setLoading(false);
      }
    };
    loadPlan();
    
    // Update URL params
    setSearchParams({ org: selectedOrg, building: selectedBuilding, floor: selectedFloor });
    
    // Cleanup blob URL on unmount or floor change
    return () => {
      if (planImageUrl && planImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(planImageUrl);
      }
    };
  }, [selectedFloor]);

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Type de fichier non supporté. Utilisez PNG, JPG, WEBP ou PDF.');
      return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 MB)');
      return;
    }
    
    setSelectedFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    
    setShowUploadModal(true);
  };

  // Upload plan
  const handleUpload = async () => {
    if (!selectedFile || !selectedFloor) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      await api.post(`/floors/${selectedFloor}/plan`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success('Plan uploadé avec succès');
      setShowUploadModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      
      // Reload plan
      const res = await api.get(`/floors/${selectedFloor}/plan`);
      setPlanData(res.data);
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      setPlanImageUrl(`${backendUrl}/api/floors/${selectedFloor}/plan/image?token=${token}&t=${Date.now()}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  // Delete plan
  const handleDelete = async () => {
    if (!selectedFloor || !planData) return;
    
    if (!window.confirm('Supprimer ce plan d\'étage ?')) return;
    
    try {
      await api.delete(`/floors/${selectedFloor}/plan`);
      toast.success('Plan supprimé');
      setPlanData(null);
      setPlanImageUrl(null);
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const selectedFloorData = floors.find(f => f.id === selectedFloor);

  return (
    <div data-testid="floor-plan-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Map className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Carte Interactive</h1>
            <p className="text-muted-foreground">
              Visualisez les plans d'étage et la position des capteurs
            </p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Organisation selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Organisation</Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {organisations.map(org => (
                    <SelectItem key={org.id} value={org.id}>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-blue-500" />
                        {org.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Building selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Bâtiment</Label>
              <Select 
                value={selectedBuilding} 
                onValueChange={setSelectedBuilding}
                disabled={!selectedOrg || buildings.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={buildings.length === 0 ? "Aucun bâtiment" : "Sélectionner..."} />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map(building => (
                    <SelectItem key={building.id} value={building.id}>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-emerald-500" />
                        {building.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Floor selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Étage</Label>
              <Select 
                value={selectedFloor} 
                onValueChange={setSelectedFloor}
                disabled={!selectedBuilding || floors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={floors.length === 0 ? "Aucun étage" : "Sélectionner..."} />
                </SelectTrigger>
                <SelectContent>
                  {floors.map(floor => (
                    <SelectItem key={floor.id} value={floor.id}>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-amber-500" />
                        {floor.name}
                        {floor.radars_count > 0 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            <Radio className="h-3 w-3 mr-1" />
                            {floor.radars_count}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Actions</Label>
              <div className="flex gap-2">
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedFloor}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {planData ? 'Remplacer' : 'Importer'}
                </Button>
                {planData && (
                  <Button variant="outline" size="icon" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Viewer */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {selectedFloorData ? `Plan - ${selectedFloorData.name}` : 'Plan d\'étage'}
            </CardTitle>
            {planData && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Plan chargé
                <span className="text-xs">
                  ({new Date(planData.uploaded_at).toLocaleDateString('fr-FR')})
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[600px] border-t">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !selectedFloor ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Map className="h-16 w-16 mb-4 opacity-50" />
                <p>Sélectionnez un étage pour voir son plan</p>
              </div>
            ) : (
              <FloorPlanViewer imageUrl={planImageUrl}>
                {/* Markers will be added in Phase 2 */}
              </FloorPlanViewer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {selectedFloorData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Radio className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedFloorData.radars_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Capteurs</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Building className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedFloorData.rooms_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Chambres</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Layers className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedFloorData.zones_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Zones</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Map className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{planData ? '1' : '0'}</div>
                  <div className="text-sm text-muted-foreground">Plan</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer un plan d'étage</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedFile && (
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{selectedFile.name}</span>
                  <Badge variant="outline">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                </div>
                
                {previewUrl && (
                  <div className="mt-4 border rounded-lg overflow-hidden bg-muted/30">
                    <img 
                      src={previewUrl} 
                      alt="Aperçu" 
                      className="max-h-[300px] mx-auto"
                    />
                  </div>
                )}
                
                {selectedFile.type === 'application/pdf' && (
                  <div className="mt-4 p-4 bg-amber-500/10 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <span className="text-sm">
                      La première page du PDF sera convertie en image
                    </span>
                  </div>
                )}
              </div>
            )}
            
            <div className="text-sm text-muted-foreground">
              <p>Formats acceptés : PNG, JPG, WEBP, PDF</p>
              <p>Taille maximale : 10 MB</p>
              <p>L'image sera optimisée automatiquement</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadModal(false);
              setSelectedFile(null);
              setPreviewUrl(null);
            }}>
              Annuler
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FloorPlanPage;
