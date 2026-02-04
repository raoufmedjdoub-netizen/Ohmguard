import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Building,
  Layers,
  Radio,
  ImageOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Save,
  X,
  GripVertical,
  CircleDot
} from 'lucide-react';

// Sensor Marker Component
function SensorMarker({ sensor, isEditMode, onDragStart, onRemove, scale }) {
  const [isDragging, setIsDragging] = useState(false);
  
  const getStatusColor = () => {
    switch (sensor.status) {
      case 'ONLINE': return 'bg-green-500 border-green-400';
      case 'OFFLINE': return 'bg-gray-400 border-gray-300';
      case 'ALERT': return 'bg-red-500 border-red-400 animate-pulse';
      default: return 'bg-blue-500 border-blue-400';
    }
  };
  
  const handleMouseDown = (e) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.(sensor, e);
  };
  
  const markerContent = (
    <div
      className={cn(
        'absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 shadow-lg cursor-pointer transition-all',
        getStatusColor(),
        isEditMode && 'cursor-move hover:scale-125',
        isDragging && 'scale-125 opacity-75'
      )}
      style={{
        left: `${sensor.marker.x}%`,
        top: `${sensor.marker.y}%`,
        zIndex: isDragging ? 100 : 10
      }}
      onMouseDown={handleMouseDown}
    >
      <Radio className="w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      
      {/* Edit mode remove button */}
      {isEditMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(sensor.id);
          }}
          className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
  
  if (isEditMode) {
    return markerContent;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {markerContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{sensor.name || sensor.device_id?.substring(0, 15)}</p>
            <div className="flex items-center gap-2">
              <Badge variant={sensor.status === 'ONLINE' ? 'default' : 'secondary'} className="text-xs">
                {sensor.status}
              </Badge>
              {sensor.type && (
                <Badge variant="outline" className="text-xs">{sensor.type}</Badge>
              )}
            </div>
            {sensor.room_info && (
              <p className="text-xs text-muted-foreground">
                Chambre {sensor.room_info.room_number}
                {sensor.room_info.name && ` - ${sensor.room_info.name}`}
              </p>
            )}
            {sensor.space_info && (
              <p className="text-xs text-muted-foreground">
                {sensor.space_info.name || sensor.space_info.space_type}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Draggable Sensor Item (sidebar)
function DraggableSensor({ sensor, onDragStart }) {
  const getStatusColor = () => {
    switch (sensor.status) {
      case 'ONLINE': return 'text-green-500';
      case 'OFFLINE': return 'text-gray-400';
      default: return 'text-blue-500';
    }
  };
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(sensor, e)}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all',
        'hover:bg-accent/50 hover:border-primary/50',
        sensor.marker?.placed && 'opacity-50'
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <Radio className={cn('h-4 w-4', getStatusColor())} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {sensor.name || sensor.device_id?.substring(0, 12)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {sensor.room_info ? `Ch. ${sensor.room_info.room_number}` : 'Non assigné'}
        </p>
      </div>
      {sensor.marker?.placed ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <CircleDot className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

// Floor Plan Viewer with markers support
function FloorPlanViewer({ imageUrl, sensors, isEditMode, onMarkerUpdate, onMarkerRemove, onSensorDrop }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [draggingSensor, setDraggingSensor] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e) => {
    if (!isEditMode) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.min(Math.max(0.5, prev * delta), 3));
    }
  }, [isEditMode]);

  const handleMouseDown = (e) => {
    if (e.button === 0 && !draggingSensor) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && !draggingSensor) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
    
    // Handle sensor marker dragging
    if (draggingSensor && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      // Clamp to image bounds
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      
      // Update marker position in real-time (visual feedback)
      setDragOffset({ x: clampedX, y: clampedY });
    }
  };

  const handleMouseUp = (e) => {
    setIsDragging(false);
    
    // Finalize sensor marker position
    if (draggingSensor && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      
      onMarkerUpdate?.(draggingSensor.id, clampedX, clampedY);
      setDraggingSensor(null);
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleSensorDragStart = (sensor, e) => {
    setDraggingSensor(sensor);
    if (sensor.marker?.placed) {
      setDragOffset({ x: sensor.marker.x, y: sensor.marker.y });
    }
  };

  // Handle drop from sidebar
  const handleDrop = (e) => {
    e.preventDefault();
    
    if (!imageRef.current) return;
    
    const sensorId = e.dataTransfer.getData('sensor-id');
    if (!sensorId) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    
    onSensorDrop?.(sensorId, clampedX, clampedY);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const zoomIn = () => setScale(prev => Math.min(prev * 1.2, 3));
  const zoomOut = () => setScale(prev => Math.max(prev * 0.8, 0.5));

  useEffect(() => {
    const container = containerRef.current;
    if (container && !isEditMode) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, isEditMode]);

  const placedSensors = sensors.filter(s => s.marker?.placed);

  return (
    <div className="relative h-full">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-20 flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 border">
        <Button variant="ghost" size="sm" onClick={zoomIn} title="Zoom avant" disabled={isEditMode}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={zoomOut} title="Zoom arrière" disabled={isEditMode}>
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
        className={cn(
          'h-full overflow-hidden rounded-lg',
          isEditMode ? 'bg-blue-500/5 cursor-crosshair' : 'bg-muted/30 cursor-grab active:cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div
          style={{
            transform: isEditMode ? 'none' : `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
          className="h-full w-full flex items-center justify-center"
        >
          {imageUrl ? (
            <div className="relative inline-block">
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Plan d'étage"
                className={cn('max-w-none', isEditMode && 'max-h-[550px] w-auto')}
                onLoad={() => setImageLoaded(true)}
                draggable={false}
              />
              
              {/* Placed markers */}
              {imageLoaded && placedSensors.map(sensor => (
                <SensorMarker
                  key={sensor.id}
                  sensor={draggingSensor?.id === sensor.id ? { ...sensor, marker: { ...sensor.marker, x: dragOffset.x, y: dragOffset.y } } : sensor}
                  isEditMode={isEditMode}
                  scale={scale}
                  onDragStart={handleSensorDragStart}
                  onRemove={onMarkerRemove}
                />
              ))}
              
              {/* Ghost marker when dragging from sidebar */}
              {draggingSensor && !draggingSensor.marker?.placed && dragOffset.x > 0 && (
                <div
                  className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-dashed border-primary bg-primary/30"
                  style={{
                    left: `${dragOffset.x}%`,
                    top: `${dragOffset.y}%`,
                    zIndex: 100
                  }}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-12">
              <ImageOff className="h-16 w-16 mb-4 opacity-50" />
              <p>Aucun plan chargé</p>
              <p className="text-sm">Importez un plan pour placer les capteurs</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Edit mode indicator */}
      {isEditMode && (
        <div className="absolute bottom-2 left-2 z-20 bg-blue-500/90 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
          <Edit3 className="h-4 w-4" />
          Mode édition actif - Glissez les capteurs sur le plan
        </div>
      )}
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
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  
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

  // Load plan and sensors when floor changes
  const loadPlanAndSensors = useCallback(async () => {
    if (!selectedFloor) {
      setPlanData(null);
      setPlanImageUrl(null);
      setSensors([]);
      return;
    }
    
    setLoading(true);
    try {
      // Load plan metadata
      const planRes = await api.get(`/floors/${selectedFloor}/plan`).catch(() => ({ data: null }));
      setPlanData(planRes.data);
      
      // Load plan image
      if (planRes.data) {
        const imageRes = await api.get(`/floors/${selectedFloor}/plan/image`, { responseType: 'blob' });
        const imageUrl = URL.createObjectURL(imageRes.data);
        setPlanImageUrl(imageUrl);
      } else {
        setPlanImageUrl(null);
      }
      
      // Load sensors with markers
      const sensorsRes = await api.get(`/floors/${selectedFloor}/sensors-markers`);
      setSensors(sensorsRes.data);
      
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Failed to load plan:', error);
      }
      setPlanData(null);
      setPlanImageUrl(null);
    } finally {
      setLoading(false);
    }
  }, [selectedFloor]);

  useEffect(() => {
    loadPlanAndSensors();
    if (selectedFloor) {
      setSearchParams({ org: selectedOrg, building: selectedBuilding, floor: selectedFloor });
    }
    
    return () => {
      if (planImageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(planImageUrl);
      }
    };
  }, [selectedFloor, loadPlanAndSensors]);

  // Handle marker update
  const handleMarkerUpdate = async (sensorId, x, y) => {
    try {
      await api.put(`/floors/${selectedFloor}/markers/${sensorId}?x=${x}&y=${y}`);
      
      // Update local state
      setSensors(prev => prev.map(s => 
        s.id === sensorId 
          ? { ...s, marker: { x, y, placed: true } }
          : s
      ));
      
      toast.success('Position mise à jour');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Handle marker remove
  const handleMarkerRemove = async (sensorId) => {
    try {
      await api.delete(`/floors/${selectedFloor}/markers/${sensorId}`);
      
      setSensors(prev => prev.map(s => 
        s.id === sensorId 
          ? { ...s, marker: { placed: false } }
          : s
      ));
      
      toast.success('Marqueur supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Handle sensor drop from sidebar
  const handleSensorDrop = async (sensorId, x, y) => {
    await handleMarkerUpdate(sensorId, x, y);
  };

  // Handle drag start from sidebar
  const handleSidebarDragStart = (sensor, e) => {
    e.dataTransfer.setData('sensor-id', sensor.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Type de fichier non supporté');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 MB)');
      return;
    }
    
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
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
      
      await loadPlanAndSensors();
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
  const placedCount = sensors.filter(s => s.marker?.placed).length;
  const unplacedSensors = sensors.filter(s => !s.marker?.placed);

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
        
        {/* Edit mode toggle */}
        {planData && sensors.length > 0 && (
          <div className="flex items-center gap-3">
            <Label htmlFor="edit-mode" className="text-sm">Mode édition</Label>
            <Switch
              id="edit-mode"
              checked={isEditMode}
              onCheckedChange={setIsEditMode}
            />
          </div>
        )}
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

      {/* Main content */}
      <div className={cn('grid gap-6', isEditMode ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1')}>
        {/* Sensors sidebar (edit mode only) */}
        {isEditMode && (
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Capteurs à placer
                <Badge variant="secondary" className="ml-auto">
                  {unplacedSensors.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[500px]">
                <div className="space-y-2 p-2">
                  {sensors.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun capteur sur cet étage
                    </p>
                  ) : (
                    <>
                      {unplacedSensors.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground font-medium px-1">Non placés</p>
                          {unplacedSensors.map(sensor => (
                            <DraggableSensor
                              key={sensor.id}
                              sensor={sensor}
                              onDragStart={handleSidebarDragStart}
                            />
                          ))}
                        </div>
                      )}
                      
                      {placedCount > 0 && (
                        <div className="space-y-2 mt-4">
                          <p className="text-xs text-muted-foreground font-medium px-1">
                            Placés ({placedCount})
                          </p>
                          {sensors.filter(s => s.marker?.placed).map(sensor => (
                            <DraggableSensor
                              key={sensor.id}
                              sensor={sensor}
                              onDragStart={handleSidebarDragStart}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Plan Viewer */}
        <Card className={cn('overflow-hidden', isEditMode ? 'lg:col-span-3' : '')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {selectedFloorData ? `Plan - ${selectedFloorData.name}` : 'Plan d\'étage'}
              </CardTitle>
              <div className="flex items-center gap-4">
                {placedCount > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Radio className="h-4 w-4 text-green-500" />
                    <span>{placedCount} capteur{placedCount > 1 ? 's' : ''} placé{placedCount > 1 ? 's' : ''}</span>
                  </div>
                )}
                {planData && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Plan chargé
                  </div>
                )}
              </div>
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
                <FloorPlanViewer 
                  imageUrl={planImageUrl}
                  sensors={sensors}
                  isEditMode={isEditMode}
                  onMarkerUpdate={handleMarkerUpdate}
                  onMarkerRemove={handleMarkerRemove}
                  onSensorDrop={handleSensorDrop}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      {selectedFloorData && !isEditMode && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Radio className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{sensors.length}</div>
                  <div className="text-sm text-muted-foreground">Capteurs total</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{placedCount}</div>
                  <div className="text-sm text-muted-foreground">Placés sur le plan</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <CircleDot className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{sensors.length - placedCount}</div>
                  <div className="text-sm text-muted-foreground">Non placés</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Radio className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {sensors.filter(s => s.status === 'ONLINE').length}
                  </div>
                  <div className="text-sm text-muted-foreground">En ligne</div>
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
