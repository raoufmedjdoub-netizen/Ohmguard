import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { io } from 'socket.io-client';
import { usePageActions } from '@/contexts/PageActionsContext';
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
  X,
  GripVertical,
  CircleDot,
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity
} from 'lucide-react';

// CSS Keyframes for animations (injected once)
const injectAnimationStyles = () => {
  if (document.getElementById('floor-plan-animations')) return;
  
  const style = document.createElement('style');
  style.id = 'floor-plan-animations';
  style.textContent = `
    @keyframes pulse-alert {
      0%, 100% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
      }
      50% { 
        transform: scale(1.15);
        box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
      }
    }
    
    @keyframes pulse-online {
      0%, 100% { 
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
      }
      50% { 
        box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
      }
    }
    
    @keyframes ripple {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(2.5);
        opacity: 0;
      }
    }
    
    @keyframes flash-new-event {
      0%, 50%, 100% { opacity: 1; }
      25%, 75% { opacity: 0.3; }
    }
    
    .marker-alert {
      animation: pulse-alert 1s ease-in-out infinite;
    }
    
    .marker-online {
      animation: pulse-online 2s ease-in-out infinite;
    }
    
    .marker-new-event {
      animation: flash-new-event 0.5s ease-in-out 3;
    }
    
    .ripple-effect::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid currentColor;
      animation: ripple 1.5s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
};

// Sensor Marker Component with real-time animations
function SensorMarker({ sensor, isEditMode, onDragStart, onRemove, hasNewEvent }) {
  const [isDragging, setIsDragging] = useState(false);
  
  const getStatusStyles = () => {
    const baseStyles = 'absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 shadow-lg cursor-pointer transition-all duration-300';
    
    switch (sensor.status) {
      case 'ONLINE':
        return {
          className: cn(baseStyles, 'bg-green-500 border-green-300 marker-online'),
          icon: <Wifi className="w-3.5 h-3.5 text-white" />,
          glow: 'shadow-green-500/50'
        };
      case 'OFFLINE':
        return {
          className: cn(baseStyles, 'bg-gray-400 border-gray-300'),
          icon: <WifiOff className="w-3.5 h-3.5 text-white" />,
          glow: ''
        };
      case 'ALERT':
      case 'FALL_DETECTED':
        return {
          className: cn(baseStyles, 'bg-red-500 border-red-300 marker-alert ripple-effect text-red-500'),
          icon: <AlertTriangle className="w-3.5 h-3.5 text-white" />,
          glow: 'shadow-red-500/70 shadow-lg'
        };
      case 'PRESENCE':
        return {
          className: cn(baseStyles, 'bg-amber-500 border-amber-300'),
          icon: <Activity className="w-3.5 h-3.5 text-white" />,
          glow: 'shadow-amber-500/50'
        };
      default:
        return {
          className: cn(baseStyles, 'bg-blue-500 border-blue-300'),
          icon: <Radio className="w-3.5 h-3.5 text-white" />,
          glow: ''
        };
    }
  };
  
  const handleMouseDown = (e) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.(sensor, e);
  };
  
  const statusStyles = getStatusStyles();
  
  const markerContent = (
    <div
      className={cn(
        statusStyles.className,
        statusStyles.glow,
        isEditMode && 'cursor-move hover:scale-125',
        isDragging && 'scale-125 opacity-75',
        hasNewEvent && 'marker-new-event'
      )}
      style={{
        left: `${sensor.marker.x}%`,
        top: `${sensor.marker.y}%`,
        zIndex: isDragging ? 100 : sensor.status === 'ALERT' ? 50 : 10
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        {statusStyles.icon}
      </div>
      
      {/* Edit mode remove button */}
      {isEditMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(sensor.id);
          }}
          className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 z-20"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
      
      {/* Status indicator dot */}
      {sensor.status === 'ONLINE' && !isEditMode && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-white" />
      )}
    </div>
  );
  
  if (isEditMode) {
    return markerContent;
  }
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          {markerContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <span className="font-semibold">{sensor.name || sensor.device_id?.substring(0, 15)}</span>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Badge 
                variant={sensor.status === 'ONLINE' ? 'default' : sensor.status === 'ALERT' ? 'destructive' : 'secondary'} 
                className="text-xs"
              >
                {sensor.status === 'ONLINE' && <Wifi className="w-3 h-3 mr-1" />}
                {sensor.status === 'OFFLINE' && <WifiOff className="w-3 h-3 mr-1" />}
                {sensor.status === 'ALERT' && <AlertTriangle className="w-3 h-3 mr-1" />}
                {sensor.status}
              </Badge>
              {sensor.type && (
                <Badge variant="outline" className="text-xs">{sensor.type}</Badge>
              )}
            </div>
            
            {sensor.room_info && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Building className="w-3 h-3" />
                Chambre {sensor.room_info.room_number}
                {sensor.room_info.name && ` - ${sensor.room_info.name}`}
              </p>
            )}
            
            {sensor.space_info && (
              <p className="text-xs text-muted-foreground">
                📍 {sensor.space_info.name || sensor.space_info.space_type}
              </p>
            )}
            
            {sensor.last_event_at && (
              <p className="text-xs text-muted-foreground border-t pt-1 mt-1">
                Dernier événement: {new Date(sensor.last_event_at).toLocaleString('fr-FR')}
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
      case 'ALERT': return 'text-red-500';
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

// Real-time status legend
function StatusLegend({ sensors }) {
  const onlineCount = sensors.filter(s => s.status === 'ONLINE').length;
  const offlineCount = sensors.filter(s => s.status === 'OFFLINE').length;
  const alertCount = sensors.filter(s => s.status === 'ALERT' || s.status === 'FALL_DETECTED').length;
  
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-green-500 marker-online" />
        <span className="text-muted-foreground">En ligne ({onlineCount})</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-gray-400" />
        <span className="text-muted-foreground">Hors ligne ({offlineCount})</span>
      </div>
      {alertCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 marker-alert" />
          <span className="text-red-500 font-medium">Alerte ({alertCount})</span>
        </div>
      )}
    </div>
  );
}

// Floor Plan Viewer with markers support
function FloorPlanViewer({ imageUrl, sensors, isEditMode, onMarkerUpdate, onMarkerRemove, onSensorDrop, newEventSensorId }) {
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
    
    if (draggingSensor && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      setDragOffset({ x: clampedX, y: clampedY });
    }
  };

  const handleMouseUp = (e) => {
    setIsDragging(false);
    
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
                  onDragStart={handleSensorDragStart}
                  onRemove={onMarkerRemove}
                  hasNewEvent={newEventSensorId === sensor.id}
                />
              ))}
              
              {/* Ghost marker when dragging */}
              {draggingSensor && !draggingSensor.marker?.placed && dragOffset.x > 0 && (
                <div
                  className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-dashed border-primary bg-primary/30"
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
          Mode édition - Glissez les capteurs sur le plan
        </div>
      )}
      
      {/* Legend (view mode only) */}
      {!isEditMode && placedSensors.length > 0 && (
        <div className="absolute bottom-2 left-2 z-20 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg border">
          <StatusLegend sensors={placedSensors} />
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
  
  // Real-time
  const [wsConnected, setWsConnected] = useState(false);
  const [newEventSensorId, setNewEventSensorId] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  const fileInputRef = useRef(null);

  // Inject animation styles
  useEffect(() => {
    injectAnimationStyles();
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const wsUrl = backendUrl.replace(/^http/, 'ws').replace('/api', '');
    
    const socket = io(backendUrl, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[FloorPlan] WebSocket connected');
      setWsConnected(true);
    });
    
    socket.on('disconnect', () => {
      console.log('[FloorPlan] WebSocket disconnected');
      setWsConnected(false);
    });
    
    // Listen for sensor events
    socket.on('new_event', (event) => {
      console.log('[FloorPlan] New event received:', event);
      
      // Find sensor by device_id or sensor_id
      setSensors(prev => {
        const updatedSensors = prev.map(sensor => {
          const isMatch = sensor.device_id === event.device_id || 
                          sensor.id === event.sensor_id ||
                          sensor.device_id?.includes(event.device_id);
          
          if (isMatch) {
            // Update sensor status based on event type
            let newStatus = sensor.status;
            if (event.event_type === 'FALL' || event.event_type === 'FALL_DETECTED') {
              newStatus = 'ALERT';
              // Show toast notification
              toast.error(`🚨 Alerte chute détectée - ${sensor.name || sensor.device_id}`, {
                duration: 5000
              });
            } else if (event.event_type === 'PRESENCE') {
              newStatus = 'PRESENCE';
            } else if (event.event_type === 'STATUS_ONLINE') {
              newStatus = 'ONLINE';
            } else if (event.event_type === 'STATUS_OFFLINE') {
              newStatus = 'OFFLINE';
            }
            
            // Trigger flash animation
            setNewEventSensorId(sensor.id);
            setTimeout(() => setNewEventSensorId(null), 1500);
            
            return {
              ...sensor,
              status: newStatus,
              last_event_at: event.timestamp || new Date().toISOString()
            };
          }
          return sensor;
        });
        
        return updatedSensors;
      });
      
      setLastEvent(event);
    });
    
    // Listen for sensor status updates
    socket.on('sensor_status', (data) => {
      console.log('[FloorPlan] Sensor status update:', data);
      
      setSensors(prev => prev.map(sensor => {
        if (sensor.id === data.sensor_id || sensor.device_id === data.device_id) {
          setNewEventSensorId(sensor.id);
          setTimeout(() => setNewEventSensorId(null), 1500);
          
          return {
            ...sensor,
            status: data.status,
            last_event_at: new Date().toISOString()
          };
        }
        return sensor;
      }));
    });
    
    return () => {
      socket.disconnect();
    };
  }, []);

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
      const planRes = await api.get(`/floors/${selectedFloor}/plan`).catch(() => ({ data: null }));
      setPlanData(planRes.data);
      
      if (planRes.data) {
        const imageRes = await api.get(`/floors/${selectedFloor}/plan/image`, { responseType: 'blob' });
        const imageUrl = URL.createObjectURL(imageRes.data);
        setPlanImageUrl(imageUrl);
      } else {
        setPlanImageUrl(null);
      }
      
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
  const onlineCount = sensors.filter(s => s.status === 'ONLINE').length;
  const alertCount = sensors.filter(s => s.status === 'ALERT' || s.status === 'FALL_DETECTED').length;

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
              Visualisez les plans d'étage et la position des capteurs en temps réel
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* WebSocket status */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
            wsConnected ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          )}>
            {wsConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Temps réel actif
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Hors ligne
              </>
            )}
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

      {/* Alert banner */}
      {alertCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 animate-pulse" />
          <div>
            <p className="font-semibold text-red-600">
              {alertCount} alerte{alertCount > 1 ? 's' : ''} active{alertCount > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-red-500">
              Vérifiez les capteurs en alerte sur le plan
            </p>
          </div>
        </div>
      )}

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
                    <span>{placedCount} placé{placedCount > 1 ? 's' : ''}</span>
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
                  newEventSensorId={newEventSensorId}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      {selectedFloorData && !isEditMode && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Radio className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{sensors.length}</div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Wifi className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{onlineCount}</div>
                  <div className="text-sm text-muted-foreground">En ligne</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-500/10">
                  <WifiOff className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{sensors.length - onlineCount - alertCount}</div>
                  <div className="text-sm text-muted-foreground">Hors ligne</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={alertCount > 0 ? 'border-red-500/50 bg-red-500/5' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', alertCount > 0 ? 'bg-red-500/20' : 'bg-red-500/10')}>
                  <AlertTriangle className={cn('h-5 w-5 text-red-500', alertCount > 0 && 'animate-pulse')} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{alertCount}</div>
                  <div className="text-sm text-muted-foreground">Alertes</div>
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
