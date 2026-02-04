/**
 * RoomVisualEditor - Éditeur visuel de configuration de chambre pour radars Vayyar
 * Basé sur les Vayyar Care Device Placement Guidelines
 * 
 * Système de coordonnées Vayyar (radar au centre = 0,0) :
 * - X (largeur) : Axe horizontal (-gauche, +droite)
 * - Y (profondeur) : Axe vertical (-derrière, +devant)
 * - Z (hauteur) : Axe vertical
 * 
 * Pour une pièce de 5m × 5m avec radar au centre :
 * - xMin = -2.5m, xMax = +2.5m
 * - yMin = -2.5m (plafond) ou -0.3m (mural), yMax = +2.5m
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Bed,
  DoorOpen,
  Grid3X3,
  Eye,
  Move,
  RotateCcw,
  Info,
  Settings,
  AlertTriangle,
  Layers,
  Plus,
  Trash2,
  Square,
  Maximize2,
  Minimize2,
  X,
  Save,
  FolderOpen,
  FileText,
  Download,
  Upload,
  Star,
  Copy
} from 'lucide-react';

// Constants based on Vayyar Guidelines
const SCALE = 100; // pixels per meter (increased for better visibility)
const ROOM_PADDING = 60;
const MAX_ROOM_SIZE = 5; // 5m × 5m max

// Mounting configurations from Vayyar specs
const MOUNTING_CONFIG = {
  Wall: {
    label: 'Mural',
    description: 'Radar fixé sur le mur à 1.5m du sol',
    height: 1.5,
    maxRoom: { width: 5, depth: 5 },
    radarMovement: 'horizontal'
  },
  Ceiling: {
    label: 'Plafond',
    description: 'Radar fixé au plafond (recommandé)',
    height: 2.7,
    maxRoom: { width: 5, depth: 5 },
    radarMovement: 'both'
  }
};

// SubRegion types
const SUBREGION_TYPES = {
  bed: {
    label: 'Lit',
    icon: Bed,
    color: '#3b82f6',
    defaultSize: { width: 0.9, length: 2.0 },
    isFallingDetection: true,
    isPresenceDetection: true,
    isHorizontal: true,
    isDoor: false
  },
  door: {
    label: 'Porte',
    icon: DoorOpen,
    color: '#f59e0b',
    defaultSize: { width: 0.9, length: 0.3 },
    isFallingDetection: false,
    isPresenceDetection: true,
    isHorizontal: false,
    isDoor: true
  },
  zone: {
    label: 'Zone',
    icon: Square,
    color: '#8b5cf6',
    defaultSize: { width: 1.5, length: 1.5 },
    isFallingDetection: true,
    isPresenceDetection: true,
    isHorizontal: true,
    isDoor: false
  }
};

// Predefined room templates
const PREDEFINED_TEMPLATES = [
  {
    id: 'standard-single',
    name: 'Chambre Standard',
    description: 'Chambre simple avec 1 lit',
    icon: '🛏️',
    category: 'standard',
    config: {
      roomWidth: 3.5,
      roomDepth: 4.0,
      mounting: 'Wall',
      radarHeight: 1.5,
      subRegions: [
        { type: 'bed', name: 'Lit', roomX: 0.3, roomY: 1.2, width: 0.9, length: 2.0 },
        { type: 'door', name: 'Porte', roomX: 2.8, roomY: 3.6, width: 0.9, length: 0.3 }
      ]
    }
  },
  {
    id: 'standard-double',
    name: 'Chambre Double',
    description: '2 lits côte à côte',
    icon: '🛏️🛏️',
    category: 'standard',
    config: {
      roomWidth: 4.5,
      roomDepth: 4.0,
      mounting: 'Wall',
      radarHeight: 1.5,
      subRegions: [
        { type: 'bed', name: 'Lit 1', roomX: 0.3, roomY: 1.2, width: 0.9, length: 2.0 },
        { type: 'bed', name: 'Lit 2', roomX: 2.3, roomY: 1.2, width: 0.9, length: 2.0 },
        { type: 'door', name: 'Porte', roomX: 3.8, roomY: 3.6, width: 0.9, length: 0.3 }
      ]
    }
  },
  {
    id: 'large-single',
    name: 'Grande Chambre',
    description: 'Chambre spacieuse avec lit double',
    icon: '🏠',
    category: 'standard',
    config: {
      roomWidth: 4.5,
      roomDepth: 5.0,
      mounting: 'Wall',
      radarHeight: 1.5,
      subRegions: [
        { type: 'bed', name: 'Lit Double', roomX: 0.5, roomY: 1.5, width: 1.4, length: 2.0 },
        { type: 'door', name: 'Porte', roomX: 3.8, roomY: 4.6, width: 0.9, length: 0.3 }
      ]
    }
  },
  {
    id: 'ceiling-square',
    name: 'Plafond Carré',
    description: 'Radar au plafond, pièce carrée',
    icon: '⬜',
    category: 'ceiling',
    config: {
      roomWidth: 4.0,
      roomDepth: 4.0,
      mounting: 'Ceiling',
      radarHeight: 2.7,
      subRegions: [
        { type: 'bed', name: 'Lit', roomX: 0.5, roomY: 0.5, width: 0.9, length: 2.0 },
        { type: 'door', name: 'Porte', roomX: 3.3, roomY: 1.5, width: 0.3, length: 0.9 }
      ]
    }
  },
  {
    id: 'ceiling-large',
    name: 'Plafond Grande Pièce',
    description: 'Radar plafond, 5m×5m',
    icon: '🔲',
    category: 'ceiling',
    config: {
      roomWidth: 5.0,
      roomDepth: 5.0,
      mounting: 'Ceiling',
      radarHeight: 2.7,
      subRegions: [
        { type: 'bed', name: 'Lit 1', roomX: 0.3, roomY: 0.3, width: 0.9, length: 2.0 },
        { type: 'bed', name: 'Lit 2', roomX: 3.0, roomY: 0.3, width: 0.9, length: 2.0 },
        { type: 'door', name: 'Porte', roomX: 4.6, roomY: 2.0, width: 0.3, length: 0.9 }
      ]
    }
  },
  {
    id: 'corridor',
    name: 'Couloir',
    description: 'Espace long et étroit',
    icon: '📏',
    category: 'special',
    config: {
      roomWidth: 2.0,
      roomDepth: 5.0,
      mounting: 'Wall',
      radarHeight: 1.5,
      subRegions: [
        { type: 'door', name: 'Porte Entrée', roomX: 0.5, roomY: 4.6, width: 0.9, length: 0.3 },
        { type: 'door', name: 'Porte Sortie', roomX: 0.5, roomY: 0.1, width: 0.9, length: 0.3 }
      ]
    }
  }
];

// LocalStorage key for custom templates
const CUSTOM_TEMPLATES_KEY = 'vayyar-room-templates';

/**
 * SVG Room Canvas Component - Vue de dessus
 * Radar au centre = origine (0,0)
 */
function RoomCanvas({
  roomWidth,
  roomDepth,
  radarPositionX,
  radarPositionY,
  radarMounting,
  radarHeight,
  subRegions,
  selectedRegionId,
  onSelectRegion,
  onRegionMove,
  onRegionResize,
  onRadarMove,
  showGrid,
  showDetectionZone,
  showDistances,
  showCoordinates
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const isCeiling = radarMounting === 'Ceiling';
  
  // Conversion functions
  const mToPixels = (m) => m * SCALE;
  const pixelsToM = (px) => px / SCALE;
  
  // Canvas dimensions
  const canvasWidth = mToPixels(roomWidth) + ROOM_PADDING * 2;
  const canvasHeight = mToPixels(roomDepth) + ROOM_PADDING * 2;
  
  // Room rectangle (origin top-left of canvas)
  const roomRect = {
    x: ROOM_PADDING,
    y: ROOM_PADDING,
    width: mToPixels(roomWidth),
    height: mToPixels(roomDepth)
  };
  
  // Radar position in SVG coordinates (room coordinates)
  const radarScreenPos = {
    x: roomRect.x + mToPixels(radarPositionX),
    y: roomRect.y + mToPixels(radarPositionY)
  };
  
  // Calculate detection zone boundaries (relative to radar = 0,0)
  const xMin = -radarPositionX;
  const xMax = roomWidth - radarPositionX;
  const yMin = isCeiling ? -radarPositionY : -0.3;
  const yMax = isCeiling ? (roomDepth - radarPositionY) : (roomDepth - radarPositionY);
  
  // Detection zone in SVG coordinates
  const detectionZoneRect = showDetectionZone ? {
    x: roomRect.x,
    y: isCeiling ? roomRect.y : (radarScreenPos.y + mToPixels(-0.3)),
    width: roomRect.width,
    height: isCeiling ? roomRect.height : mToPixels(roomDepth - radarPositionY + 0.3)
  } : null;
  
  // Mouse handlers
  const handleMouseDown = (e, target, id = null) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    if (target === 'radar') {
      setDragging({ type: 'radar' });
      setDragOffset({ 
        x: svgP.x - radarScreenPos.x, 
        y: svgP.y - radarScreenPos.y 
      });
    } else if (target === 'region') {
      onSelectRegion?.(id);
      const region = subRegions.find(r => r.id === id);
      if (region) {
        const regionScreenX = roomRect.x + mToPixels(region.roomX);
        const regionScreenY = roomRect.y + mToPixels(region.roomY);
        setDragging({ type: 'region', id });
        setDragOffset({
          x: svgP.x - regionScreenX,
          y: svgP.y - regionScreenY
        });
      }
    } else if (target === 'region-resize') {
      setDragging({ type: 'region-resize', id });
    }
  };
  
  const handleMouseMove = (e) => {
    if (!dragging) return;
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    if (dragging.type === 'radar') {
      let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
      let newY = pixelsToM(svgP.y - dragOffset.y - roomRect.y);
      
      newX = Math.max(0.3, Math.min(roomWidth - 0.3, newX));
      
      if (isCeiling) {
        newY = Math.max(0.3, Math.min(roomDepth - 0.3, newY));
        onRadarMove?.(newX, newY);
      } else {
        onRadarMove?.(newX, 0);
      }
    } else if (dragging.type === 'region') {
      const region = subRegions.find(r => r.id === dragging.id);
      if (region) {
        let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
        let newY = pixelsToM(svgP.y - dragOffset.y - roomRect.y);
        
        newX = Math.max(0, Math.min(roomWidth - region.width, newX));
        newY = Math.max(0, Math.min(roomDepth - region.length, newY));
        
        onRegionMove?.(dragging.id, newX, newY);
      }
    } else if (dragging.type === 'region-resize') {
      const region = subRegions.find(r => r.id === dragging.id);
      if (region) {
        const regionScreenX = roomRect.x + mToPixels(region.roomX);
        const regionScreenY = roomRect.y + mToPixels(region.roomY);
        
        const newWidth = pixelsToM(svgP.x - regionScreenX);
        const newLength = pixelsToM(svgP.y - regionScreenY);
        
        onRegionResize?.(dragging.id, 
          Math.max(0.3, Math.min(3, newWidth)),
          Math.max(0.3, Math.min(3, newLength))
        );
      }
    }
  };
  
  const handleMouseUp = () => {
    setDragging(null);
  };
  
  const handleCanvasClick = () => {
    onSelectRegion?.(null);
  };

  const mountConfig = MOUNTING_CONFIG[radarMounting] || MOUNTING_CONFIG.Wall;

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        ref={svgRef}
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="bg-slate-50 dark:bg-slate-900 rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-inner"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="coneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </linearGradient>
          <pattern id="detectionPattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M 0 10 L 10 0" stroke="#22c55e" strokeWidth="1" opacity="0.3" />
          </pattern>
          <radialGradient id="ceilingGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </radialGradient>
        </defs>
        
        {/* Grid */}
        {showGrid && (
          <g className="opacity-30">
            {Array.from({ length: Math.ceil(roomWidth * 2) + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={roomRect.x + i * mToPixels(0.5)}
                y1={roomRect.y}
                x2={roomRect.x + i * mToPixels(0.5)}
                y2={roomRect.y + roomRect.height}
                stroke="currentColor"
                strokeWidth={i % 2 === 0 ? 1 : 0.5}
                strokeDasharray={i % 2 === 0 ? "none" : "4,4"}
              />
            ))}
            {Array.from({ length: Math.ceil(roomDepth * 2) + 1 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1={roomRect.x}
                y1={roomRect.y + i * mToPixels(0.5)}
                x2={roomRect.x + roomRect.width}
                y2={roomRect.y + i * mToPixels(0.5)}
                stroke="currentColor"
                strokeWidth={i % 2 === 0 ? 1 : 0.5}
                strokeDasharray={i % 2 === 0 ? "none" : "4,4"}
              />
            ))}
          </g>
        )}
        
        {/* Room walls */}
        <rect
          x={roomRect.x}
          y={roomRect.y}
          width={roomRect.width}
          height={roomRect.height}
          fill="white"
          className="dark:fill-slate-800"
          stroke="#1e293b"
          strokeWidth={4}
        />
        
        {/* Wall label for mural */}
        {!isCeiling && (
          <text
            x={roomRect.x + roomRect.width / 2}
            y={roomRect.y - 8}
            textAnchor="middle"
            className="fill-slate-500 text-xs font-medium"
          >
            Mur du radar (Y=0)
          </text>
        )}
        
        {/* Room dimension labels */}
        <text
          x={roomRect.x + roomRect.width / 2}
          y={roomRect.y + roomRect.height + 20}
          textAnchor="middle"
          className="fill-slate-600 dark:fill-slate-400 text-sm font-bold"
        >
          {roomWidth.toFixed(1)} m
        </text>
        <text
          x={roomRect.x - 20}
          y={roomRect.y + roomRect.height / 2}
          textAnchor="middle"
          transform={`rotate(-90, ${roomRect.x - 20}, ${roomRect.y + roomRect.height / 2})`}
          className="fill-slate-600 dark:fill-slate-400 text-sm font-bold"
        >
          {roomDepth.toFixed(1)} m
        </text>
        
        {/* Detection zone */}
        {detectionZoneRect && (
          <g>
            <rect
              x={detectionZoneRect.x}
              y={detectionZoneRect.y}
              width={detectionZoneRect.width}
              height={detectionZoneRect.height}
              fill="url(#detectionPattern)"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="8,4"
              className="pointer-events-none"
            />
            <rect
              x={detectionZoneRect.x}
              y={detectionZoneRect.y}
              width={detectionZoneRect.width}
              height={detectionZoneRect.height}
              fill="rgba(34, 197, 94, 0.08)"
              className="pointer-events-none"
            />
          </g>
        )}
        
        {/* Detection cone/circle from radar */}
        {isCeiling ? (
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={Math.max(mToPixels(Math.abs(xMin)), mToPixels(xMax), mToPixels(Math.abs(yMin)), mToPixels(yMax)) * 0.8}
            fill="url(#ceilingGradient)"
            className="pointer-events-none"
          />
        ) : (
          <path
            d={`M ${radarScreenPos.x} ${radarScreenPos.y}
                L ${roomRect.x} ${roomRect.y + roomRect.height}
                L ${roomRect.x + roomRect.width} ${roomRect.y + roomRect.height}
                Z`}
            fill="url(#coneGradient)"
            className="pointer-events-none"
          />
        )}
        
        {/* SubRegions */}
        {subRegions.map((region) => {
          const regionType = SUBREGION_TYPES[region.type] || SUBREGION_TYPES.zone;
          const regionScreenPos = {
            x: roomRect.x + mToPixels(region.roomX),
            y: roomRect.y + mToPixels(region.roomY),
            width: mToPixels(region.width),
            height: mToPixels(region.length)
          };
          const isSelected = selectedRegionId === region.id;
          
          // Calculate relative coords to radar
          const relXMin = region.roomX - radarPositionX;
          const relXMax = relXMin + region.width;
          const relYMin = isCeiling ? (region.roomY - radarPositionY) : region.roomY;
          const relYMax = relYMin + region.length;
          
          return (
            <g key={region.id}>
              {/* Selection indicator */}
              {isSelected && (
                <rect
                  x={regionScreenPos.x - 6}
                  y={regionScreenPos.y - 6}
                  width={regionScreenPos.width + 12}
                  height={regionScreenPos.height + 12}
                  fill="none"
                  stroke={regionType.color}
                  strokeWidth={3}
                  strokeDasharray="6,3"
                  rx={6}
                  className="pointer-events-none animate-pulse"
                />
              )}
              
              {/* Region body */}
              <g
                className={cn('cursor-move', dragging?.id === region.id && 'opacity-70')}
                onMouseDown={(e) => handleMouseDown(e, 'region', region.id)}
                onClick={(e) => e.stopPropagation()}
              >
                <rect
                  x={regionScreenPos.x + 3}
                  y={regionScreenPos.y + 3}
                  width={regionScreenPos.width}
                  height={regionScreenPos.height}
                  rx={4}
                  fill="rgba(0,0,0,0.1)"
                />
                <rect
                  x={regionScreenPos.x}
                  y={regionScreenPos.y}
                  width={regionScreenPos.width}
                  height={regionScreenPos.height}
                  rx={4}
                  fill={regionType.color}
                  fillOpacity={0.2}
                  stroke={regionType.color}
                  strokeWidth={isSelected ? 3 : 2}
                />
                
                {/* Region label */}
                <text
                  x={regionScreenPos.x + regionScreenPos.width / 2}
                  y={regionScreenPos.y + regionScreenPos.height / 2 + 4}
                  textAnchor="middle"
                  className="text-xs font-bold pointer-events-none"
                  fill={regionType.color}
                >
                  {region.name || regionType.label}
                </text>
                
                {/* Region size */}
                <text
                  x={regionScreenPos.x + regionScreenPos.width / 2}
                  y={regionScreenPos.y + regionScreenPos.height + 14}
                  textAnchor="middle"
                  className="text-[9px] font-medium pointer-events-none"
                  fill={regionType.color}
                >
                  {region.width.toFixed(1)}×{region.length.toFixed(1)}m
                </text>
                
                {/* Resize handle */}
                {isSelected && (
                  <circle
                    cx={regionScreenPos.x + regionScreenPos.width}
                    cy={regionScreenPos.y + regionScreenPos.height}
                    r={7}
                    fill={regionType.color}
                    stroke="white"
                    strokeWidth={2}
                    className="cursor-se-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'region-resize', region.id);
                    }}
                  />
                )}
              </g>
              
              {/* Show relative coordinates for selected region */}
              {isSelected && showCoordinates && (
                <g className="pointer-events-none">
                  <rect
                    x={regionScreenPos.x}
                    y={regionScreenPos.y - 28}
                    width={regionScreenPos.width}
                    height={24}
                    rx={4}
                    fill={regionType.color}
                    fillOpacity={0.9}
                  />
                  <text
                    x={regionScreenPos.x + regionScreenPos.width / 2}
                    y={regionScreenPos.y - 12}
                    textAnchor="middle"
                    className="text-[10px] font-mono font-bold fill-white"
                  >
                    X:[{relXMin.toFixed(2)},{relXMax.toFixed(2)}] Y:[{relYMin.toFixed(2)},{relYMax.toFixed(2)}]
                  </text>
                </g>
              )}
            </g>
          );
        })}
        
        {/* Radar */}
        <g
          className={cn(
            isCeiling ? 'cursor-move' : 'cursor-ew-resize', 
            dragging?.type === 'radar' && 'opacity-70'
          )}
          onMouseDown={(e) => handleMouseDown(e, 'radar')}
        >
          {/* Radar mount indicator */}
          {!isCeiling && (
            <rect
              x={radarScreenPos.x - 20}
              y={radarScreenPos.y - 8}
              width={40}
              height={8}
              fill="#dc2626"
              rx={2}
            />
          )}
          {/* Radar body */}
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={isCeiling ? 22 : 18}
            fill="#ef4444"
            stroke="white"
            strokeWidth={3}
          />
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={isCeiling ? 8 : 6}
            fill="white"
          />
          {/* Radar waves */}
          {isCeiling ? (
            [30, 42].map((r, i) => (
              <circle
                key={i}
                cx={radarScreenPos.x}
                cy={radarScreenPos.y}
                r={r}
                fill="none"
                stroke="rgba(239, 68, 68, 0.3)"
                strokeWidth={2}
                className="pointer-events-none"
              />
            ))
          ) : (
            [26, 36].map((r, i) => (
              <path
                key={i}
                d={`M ${radarScreenPos.x - r} ${radarScreenPos.y} 
                    Q ${radarScreenPos.x - r} ${radarScreenPos.y + r * 0.7} ${radarScreenPos.x} ${radarScreenPos.y + r}
                    Q ${radarScreenPos.x + r} ${radarScreenPos.y + r * 0.7} ${radarScreenPos.x + r} ${radarScreenPos.y}`}
                fill="none"
                stroke="rgba(239, 68, 68, 0.4)"
                strokeWidth={2}
                className="pointer-events-none"
              />
            ))
          )}
          {/* Radar label */}
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y + (isCeiling ? 50 : 38)}
            textAnchor="middle"
            className="fill-red-600 text-xs font-bold pointer-events-none"
          >
            RADAR (0,0)
          </text>
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y + (isCeiling ? 62 : 50)}
            textAnchor="middle"
            className="fill-red-500 text-[10px] pointer-events-none"
          >
            H={radarHeight.toFixed(2)}m
          </text>
        </g>
        
        {/* Coordinate values display on canvas */}
        {showCoordinates && (
          <g className="pointer-events-none">
            {/* xMin label (left edge) */}
            <g>
              <rect
                x={roomRect.x - 2}
                y={radarScreenPos.y - 12}
                width={50}
                height={24}
                rx={4}
                fill="#3b82f6"
                fillOpacity={0.9}
              />
              <text
                x={roomRect.x + 23}
                y={radarScreenPos.y + 4}
                textAnchor="middle"
                className="text-[11px] font-mono font-bold fill-white"
              >
                X:{xMin.toFixed(2)}
              </text>
            </g>
            
            {/* xMax label (right edge) */}
            <g>
              <rect
                x={roomRect.x + roomRect.width - 48}
                y={radarScreenPos.y - 12}
                width={50}
                height={24}
                rx={4}
                fill="#3b82f6"
                fillOpacity={0.9}
              />
              <text
                x={roomRect.x + roomRect.width - 23}
                y={radarScreenPos.y + 4}
                textAnchor="middle"
                className="text-[11px] font-mono font-bold fill-white"
              >
                X:{xMax.toFixed(2)}
              </text>
            </g>
            
            {/* yMin label (top/back) */}
            <g>
              <rect
                x={radarScreenPos.x - 25}
                y={isCeiling ? (roomRect.y + 2) : (radarScreenPos.y + mToPixels(-0.3) - 2)}
                width={50}
                height={20}
                rx={4}
                fill="#22c55e"
                fillOpacity={0.9}
              />
              <text
                x={radarScreenPos.x}
                y={isCeiling ? (roomRect.y + 15) : (radarScreenPos.y + mToPixels(-0.3) + 12)}
                textAnchor="middle"
                className="text-[11px] font-mono font-bold fill-white"
              >
                Y:{yMin.toFixed(2)}
              </text>
            </g>
            
            {/* yMax label (bottom/front) */}
            <g>
              <rect
                x={radarScreenPos.x - 25}
                y={roomRect.y + roomRect.height - 22}
                width={50}
                height={20}
                rx={4}
                fill="#22c55e"
                fillOpacity={0.9}
              />
              <text
                x={radarScreenPos.x}
                y={roomRect.y + roomRect.height - 8}
                textAnchor="middle"
                className="text-[11px] font-mono font-bold fill-white"
              >
                Y:{yMax.toFixed(2)}
              </text>
            </g>
          </g>
        )}
        
        {/* Distance lines from radar to selected region */}
        {showDistances && selectedRegionId && (() => {
          const region = subRegions.find(r => r.id === selectedRegionId);
          if (!region) return null;
          
          const regionCenterX = roomRect.x + mToPixels(region.roomX + region.width / 2);
          const regionCenterY = roomRect.y + mToPixels(region.roomY + region.length / 2);
          
          const dx = region.roomX + region.width / 2 - radarPositionX;
          const dy = isCeiling 
            ? (region.roomY + region.length / 2 - radarPositionY)
            : (region.roomY + region.length / 2);
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          return (
            <g className="pointer-events-none">
              <line
                x1={radarScreenPos.x}
                y1={radarScreenPos.y}
                x2={regionCenterX}
                y2={regionCenterY}
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="6,4"
              />
              <rect
                x={(radarScreenPos.x + regionCenterX) / 2 - 28}
                y={(radarScreenPos.y + regionCenterY) / 2 - 10}
                width={56}
                height={20}
                rx={4}
                fill="white"
                className="dark:fill-slate-800"
                stroke="#f59e0b"
                strokeWidth={1}
              />
              <text
                x={(radarScreenPos.x + regionCenterX) / 2}
                y={(radarScreenPos.y + regionCenterY) / 2 + 4}
                textAnchor="middle"
                className="fill-amber-600 text-xs font-bold"
              >
                {distance.toFixed(2)}m
              </text>
            </g>
          );
        })()}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-2 rounded-lg border shadow-sm text-[10px]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-white" />
            <span>Radar ({isCeiling ? 'libre' : 'horizontal'})</span>
          </div>
          {Object.entries(SUBREGION_TYPES).map(([key, type]) => (
            <div key={key} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded border-2" 
                style={{ borderColor: type.color, backgroundColor: `${type.color}30` }}
              />
              <span>{type.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculated Parameters Tab Component
 */
function CalculatedParamsTab({ config, radarHeight, mountConfig, subRegions }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Paramètres walabotConfig
          </CardTitle>
          <CardDescription className="text-xs">
            Zone de détection relative au radar (0,0)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded text-center border border-blue-200 dark:border-blue-800">
              <p className="text-[10px] text-blue-600 dark:text-blue-400">xMin</p>
              <p className="text-sm font-mono font-bold text-blue-700 dark:text-blue-300">
                {(config?.walabotConfig?.xMin ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded text-center border border-blue-200 dark:border-blue-800">
              <p className="text-[10px] text-blue-600 dark:text-blue-400">xMax</p>
              <p className="text-sm font-mono font-bold text-blue-700 dark:text-blue-300">
                {(config?.walabotConfig?.xMax ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded text-center border border-green-200 dark:border-green-800">
              <p className="text-[10px] text-green-600 dark:text-green-400">yMin</p>
              <p className="text-sm font-mono font-bold text-green-700 dark:text-green-300">
                {(config?.walabotConfig?.yMin ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded text-center border border-green-200 dark:border-green-800">
              <p className="text-[10px] text-green-600 dark:text-green-400">yMax</p>
              <p className="text-sm font-mono font-bold text-green-700 dark:text-green-300">
                {(config?.walabotConfig?.yMax ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">Hauteur</p>
              <p className="text-sm font-mono font-bold">{radarHeight.toFixed(2)}</p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">Montage</p>
              <p className="text-sm font-bold">{mountConfig.label}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Sous-régions ({config?.walabotConfig?.trackerSubRegions?.length || 0})
          </CardTitle>
          <CardDescription className="text-xs">
            Zones de détection spécifiques (lit, porte, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config?.walabotConfig?.trackerSubRegions?.length > 0 ? (
            <div className="space-y-3">
              {config.walabotConfig.trackerSubRegions.map((region, idx) => {
                const regionType = SUBREGION_TYPES[subRegions[idx]?.type] || SUBREGION_TYPES.zone;
                return (
                  <div 
                    key={idx}
                    className="p-3 border rounded"
                    style={{ 
                      backgroundColor: `${regionType.color}10`,
                      borderColor: `${regionType.color}40`
                    }}
                  >
                    <p className="text-xs font-semibold mb-2 flex items-center gap-2" style={{ color: regionType.color }}>
                      <regionType.icon className="h-3 w-3" />
                      [{idx}] {region.name || 'Zone'}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <p className="text-muted-foreground">X (relatif)</p>
                        <p className="font-mono font-medium">
                          {region.xMin?.toFixed(2)} → {region.xMax?.toFixed(2)}m
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Y (relatif)</p>
                        <p className="font-mono font-medium">
                          {region.yMin?.toFixed(2)} → {region.yMax?.toFixed(2)}m
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Z</p>
                        <p className="font-mono font-medium">
                          {region.zMin?.toFixed(2)} → {region.zMax?.toFixed(2)}m
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Durées</p>
                        <p className="font-mono text-[10px]">
                          E:{region.enterDuration}s / S:{region.exitDuration}s
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t" style={{ borderColor: `${regionType.color}30` }}>
                      <Badge variant={region.isFallingDetection ? "default" : "secondary"} className="text-[9px] h-5">
                        Chute: {region.isFallingDetection ? 'Oui' : 'Non'}
                      </Badge>
                      <Badge variant={region.isPresenceDetection ? "default" : "secondary"} className="text-[9px] h-5">
                        Présence: {region.isPresenceDetection ? 'Oui' : 'Non'}
                      </Badge>
                      {region.isDoor && (
                        <Badge variant="outline" className="text-[9px] h-5">Porte</Badge>
                      )}
                      {region.isHorizontal && (
                        <Badge variant="outline" className="text-[9px] h-5">Horizontal</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune sous-région. Ajoutez un lit ou une porte dans l'éditeur visuel.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Main RoomVisualEditor Component
 */
export function RoomVisualEditor({ config, onConfigChange }) {
  // Room dimensions (max 5m × 5m)
  const [roomWidth, setRoomWidth] = useState(4.0);
  const [roomDepth, setRoomDepth] = useState(4.0);
  
  // Radar position (room coordinates, NOT relative)
  const [radarPositionX, setRadarPositionX] = useState(2.0);
  const [radarPositionY, setRadarPositionY] = useState(2.0);
  
  // SubRegions (multiple: bed, door, etc.)
  const [subRegions, setSubRegions] = useState([
    {
      id: 'bed-1',
      type: 'bed',
      name: 'Lit',
      roomX: 0.5,
      roomY: 1.0,
      width: 0.9,
      length: 2.0
    }
  ]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  
  // Display options
  const [showGrid, setShowGrid] = useState(true);
  const [showDetectionZone, setShowDetectionZone] = useState(true);
  const [showDistances, setShowDistances] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(true);
  
  // Templates
  const [customTemplates, setCustomTemplates] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  
  // Fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('visual');
  
  // Get mounting config
  const radarMounting = config?.walabotConfig?.sensorMounting || 'Wall';
  const radarHeight = config?.walabotConfig?.sensorHeight || 1.5;
  const mountConfig = MOUNTING_CONFIG[radarMounting] || MOUNTING_CONFIG.Wall;
  const isCeiling = radarMounting === 'Ceiling';
  
  // Initialize from config
  useEffect(() => {
    if (!config?.walabotConfig) return;
    
    const wc = config.walabotConfig;
    
    if (wc.xMax !== undefined && wc.xMin !== undefined) {
      const width = Math.abs(wc.xMin) + Math.abs(wc.xMax);
      setRoomWidth(Math.max(2, Math.min(MAX_ROOM_SIZE, width)));
      setRadarPositionX(Math.abs(wc.xMin));
    }
    if (wc.yMax !== undefined && wc.yMin !== undefined) {
      const depth = Math.abs(wc.yMin) + Math.abs(wc.yMax);
      setRoomDepth(Math.max(2, Math.min(MAX_ROOM_SIZE, depth)));
      if (wc.sensorMounting === 'Ceiling') {
        setRadarPositionY(Math.abs(wc.yMin));
      }
    }
    
    // Extract subregions
    if (wc.trackerSubRegions?.length > 0) {
      const loadedRegions = wc.trackerSubRegions.map((sr, idx) => {
        const type = sr.isDoor ? 'door' : (sr.name?.toLowerCase().includes('lit') || sr.name?.toLowerCase().includes('bed') ? 'bed' : 'zone');
        const absXMin = sr.xMin + Math.abs(wc.xMin || 2);
        const absYMin = wc.sensorMounting === 'Ceiling' 
          ? sr.yMin + Math.abs(wc.yMin || 2)
          : sr.yMin;
        
        return {
          id: `region-${idx}`,
          type,
          name: sr.name || (type === 'bed' ? 'Lit' : type === 'door' ? 'Porte' : 'Zone'),
          roomX: Math.max(0, absXMin),
          roomY: Math.max(0, absYMin),
          width: Math.max(0.3, sr.xMax - sr.xMin),
          length: Math.max(0.3, sr.yMax - sr.yMin)
        };
      });
      setSubRegions(loadedRegions);
    }
  }, []);
  
  // Handle mounting change
  useEffect(() => {
    if (isCeiling) {
      setRadarPositionX(roomWidth / 2);
      setRadarPositionY(roomDepth / 2);
    } else {
      setRadarPositionX(roomWidth / 2);
      setRadarPositionY(0);
    }
  }, [radarMounting]);
  
  // Update config when positions change
  const updateConfig = useCallback(() => {
    if (!onConfigChange) return;
    
    // Detection zone (radar = 0,0)
    const newXMin = -radarPositionX;
    const newXMax = roomWidth - radarPositionX;
    const newYMin = isCeiling ? -radarPositionY : -0.3;
    const newYMax = isCeiling ? (roomDepth - radarPositionY) : (roomDepth - radarPositionY);
    
    // Convert subRegions to trackerSubRegions
    const trackerSubRegions = subRegions.map(region => {
      const regionType = SUBREGION_TYPES[region.type] || SUBREGION_TYPES.zone;
      const relXMin = region.roomX - radarPositionX;
      const relXMax = relXMin + region.width;
      const relYMin = isCeiling ? (region.roomY - radarPositionY) : region.roomY;
      const relYMax = relYMin + region.length;
      
      return {
        xMin: parseFloat(relXMin.toFixed(2)),
        xMax: parseFloat(relXMax.toFixed(2)),
        yMin: parseFloat(relYMin.toFixed(2)),
        yMax: parseFloat(relYMax.toFixed(2)),
        zMin: 0,
        zMax: config?.walabotConfig?.zMax || 2.0,
        enterDuration: 120,
        exitDuration: 120,
        isFallingDetection: regionType.isFallingDetection,
        isPresenceDetection: regionType.isPresenceDetection,
        isLowSnr: true,
        isHorizontal: regionType.isHorizontal,
        isDoor: regionType.isDoor,
        name: region.name
      };
    });
    
    onConfigChange({
      ...config,
      walabotConfig: {
        ...config?.walabotConfig,
        xMin: parseFloat(newXMin.toFixed(2)),
        xMax: parseFloat(newXMax.toFixed(2)),
        yMin: parseFloat(newYMin.toFixed(2)),
        yMax: parseFloat(newYMax.toFixed(2)),
        trackerSubRegions
      }
    });
  }, [config, onConfigChange, roomWidth, roomDepth, radarPositionX, radarPositionY, subRegions, isCeiling]);
  
  // Debounced update
  useEffect(() => {
    const timer = setTimeout(updateConfig, 200);
    return () => clearTimeout(timer);
  }, [radarPositionX, radarPositionY, subRegions, roomWidth, roomDepth]);
  
  // Handlers
  const handleRadarMove = (newX, newY) => {
    setRadarPositionX(newX);
    if (isCeiling) {
      setRadarPositionY(newY);
    }
  };
  
  const handleRegionMove = (id, newX, newY) => {
    setSubRegions(regions => regions.map(r => 
      r.id === id ? { ...r, roomX: newX, roomY: newY } : r
    ));
  };
  
  const handleRegionResize = (id, newWidth, newLength) => {
    setSubRegions(regions => regions.map(r => 
      r.id === id ? { ...r, width: newWidth, length: newLength } : r
    ));
  };
  
  const addSubRegion = (type) => {
    const regionType = SUBREGION_TYPES[type];
    const newRegion = {
      id: `${type}-${Date.now()}`,
      type,
      name: regionType.label,
      roomX: roomWidth / 2 - regionType.defaultSize.width / 2,
      roomY: roomDepth / 2 - regionType.defaultSize.length / 2,
      width: regionType.defaultSize.width,
      length: regionType.defaultSize.length
    };
    setSubRegions(regions => [...regions, newRegion]);
    setSelectedRegionId(newRegion.id);
  };
  
  const deleteSubRegion = (id) => {
    setSubRegions(regions => regions.filter(r => r.id !== id));
    if (selectedRegionId === id) {
      setSelectedRegionId(null);
    }
  };
  
  const isRoomTooLarge = roomWidth > MAX_ROOM_SIZE || roomDepth > MAX_ROOM_SIZE;
  const selectedRegion = subRegions.find(r => r.id === selectedRegionId);
  
  // Fullscreen Editor Component
  const FullscreenEditor = () => (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Éditeur Visuel • Radar = (0,0)</h2>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {roomWidth.toFixed(1)}m × {roomDepth.toFixed(1)}m
          </Badge>
          <div className="text-sm font-mono">
            <span className="text-blue-600">X: [{(-radarPositionX).toFixed(2)}, {+(roomWidth - radarPositionX).toFixed(2)}]</span>
            <span className="mx-3 text-muted-foreground">|</span>
            <span className="text-green-600">Y: [{isCeiling ? (-radarPositionY).toFixed(2) : "-0.30"}, {+(isCeiling ? (roomDepth - radarPositionY) : (roomDepth - radarPositionY)).toFixed(2)}]</span>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="lg"
          onClick={() => setIsFullscreen(false)}
          className="gap-2"
        >
          <Minimize2 className="h-5 w-5" />
          Quitter plein écran
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 flex gap-6 p-6 overflow-hidden">
        {/* Settings Panel - Wider in fullscreen */}
        <Card className="w-[380px] shrink-0 overflow-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Room Dimensions */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Dimensions pièce
              </Label>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Largeur X</Label>
                    <span className="text-lg font-mono font-bold text-blue-600">{roomWidth.toFixed(1)}m</span>
                  </div>
                  <Slider
                    value={[roomWidth]}
                    onValueChange={([v]) => setRoomWidth(v)}
                    min={2}
                    max={MAX_ROOM_SIZE}
                    step={0.1}
                    className="py-2"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Profondeur Y</Label>
                    <span className="text-lg font-mono font-bold text-green-600">{roomDepth.toFixed(1)}m</span>
                  </div>
                  <Slider
                    value={[roomDepth]}
                    onValueChange={([v]) => setRoomDepth(v)}
                    min={2}
                    max={MAX_ROOM_SIZE}
                    step={0.1}
                    className="py-2"
                  />
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Radar Settings */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Radar
              </Label>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-base font-medium">Montage</Label>
                  <Select 
                    value={radarMounting}
                    onValueChange={(v) => {
                      onConfigChange?.({
                        ...config,
                        walabotConfig: { 
                          ...config?.walabotConfig, 
                          sensorMounting: v,
                          sensorHeight: MOUNTING_CONFIG[v]?.height || 1.5
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MOUNTING_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          {cfg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Hauteur</Label>
                    <span className="text-lg font-mono font-bold">{radarHeight.toFixed(2)}m</span>
                  </div>
                  <Slider
                    value={[radarHeight]}
                    onValueChange={([v]) => onConfigChange?.({
                      ...config,
                      walabotConfig: { ...config?.walabotConfig, sensorHeight: v }
                    })}
                    min={radarMounting === 'Wall' ? 1.2 : 2.3}
                    max={radarMounting === 'Wall' ? 1.8 : 3.0}
                    step={0.05}
                    className="py-2"
                  />
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Display Options */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Affichage
              </Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} id="fs-grid" />
                  <Label htmlFor="fs-grid" className="text-base cursor-pointer">Grille</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showDetectionZone} onCheckedChange={setShowDetectionZone} id="fs-zone" />
                  <Label htmlFor="fs-zone" className="text-base cursor-pointer">Zone</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showDistances} onCheckedChange={setShowDistances} id="fs-dist" />
                  <Label htmlFor="fs-dist" className="text-base cursor-pointer">Distance</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showCoordinates} onCheckedChange={setShowCoordinates} id="fs-coords" />
                  <Label htmlFor="fs-coords" className="text-base cursor-pointer">Coords</Label>
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* SubRegions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Sous-régions
                </Label>
                <Badge variant="secondary" className="text-sm">{subRegions.length}</Badge>
              </div>
              
              <div className="flex gap-2">
                {Object.entries(SUBREGION_TYPES).map(([key, type]) => (
                  <Button
                    key={key}
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => addSubRegion(key)}
                  >
                    <type.icon className="h-5 w-5 mr-2" style={{ color: type.color }} />
                    {type.label}
                  </Button>
                ))}
              </div>
              
              <div className="space-y-2">
                {subRegions.map((region) => {
                  const regionType = SUBREGION_TYPES[region.type];
                  const isSelected = selectedRegionId === region.id;
                  return (
                    <div 
                      key={region.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all",
                        isSelected ? "shadow-md" : "border-transparent bg-muted/30 hover:bg-muted/50"
                      )}
                      style={{ 
                        borderColor: isSelected ? regionType.color : 'transparent',
                        backgroundColor: isSelected ? `${regionType.color}15` : undefined
                      }}
                      onClick={() => setSelectedRegionId(region.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${regionType.color}20` }}
                        >
                          <regionType.icon className="h-5 w-5" style={{ color: regionType.color }} />
                        </div>
                        <div>
                          <span className="text-base font-medium block">{region.name}</span>
                          <span className="text-sm text-muted-foreground font-mono">
                            {region.width.toFixed(1)} × {region.length.toFixed(1)}m
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSubRegion(region.id);
                        }}
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              
              {selectedRegion && (
                <div 
                  className="p-4 rounded-lg border-2 space-y-4" 
                  style={{ borderColor: SUBREGION_TYPES[selectedRegion.type]?.color }}
                >
                  <Input
                    value={selectedRegion.name}
                    onChange={(e) => setSubRegions(regions => 
                      regions.map(r => r.id === selectedRegion.id ? { ...r, name: e.target.value } : r)
                    )}
                    className="h-11 text-base font-medium"
                    placeholder="Nom de la zone"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground block mb-1">Position</span>
                      <span className="font-mono font-medium text-base">{selectedRegion.roomX.toFixed(2)}, {selectedRegion.roomY.toFixed(2)}</span>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground block mb-1">Taille</span>
                      <span className="font-mono font-medium text-base">{selectedRegion.width.toFixed(2)} × {selectedRegion.length.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                const newX = roomWidth / 2;
                const newY = isCeiling ? roomDepth / 2 : 0;
                setRadarPositionX(newX);
                setRadarPositionY(newY);
                setSubRegions([{
                  id: 'bed-1',
                  type: 'bed',
                  name: 'Lit',
                  roomX: 0.5,
                  roomY: isCeiling ? 0.5 : 1.0,
                  width: 0.9,
                  length: 2.0
                }]);
                setSelectedRegionId(null);
              }}
            >
              <RotateCcw className="h-5 w-5 mr-2" />
              Réinitialiser tout
            </Button>
          </CardContent>
        </Card>
        
        {/* Canvas - Takes remaining space */}
        <div className="flex-1 bg-muted/20 rounded-xl border-2 flex items-center justify-center p-4">
          <RoomCanvas
            roomWidth={roomWidth}
            roomDepth={roomDepth}
            radarPositionX={radarPositionX}
            radarPositionY={isCeiling ? radarPositionY : 0}
            radarMounting={radarMounting}
            radarHeight={radarHeight}
            subRegions={subRegions}
            selectedRegionId={selectedRegionId}
            onSelectRegion={setSelectedRegionId}
            onRegionMove={handleRegionMove}
            onRegionResize={handleRegionResize}
            onRadarMove={handleRadarMove}
            showGrid={showGrid}
            showDetectionZone={showDetectionZone}
            showDistances={showDistances}
            showCoordinates={showCoordinates}
          />
        </div>
      </div>
    </div>
  );
  
  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);
  
  return (
    <div className="space-y-4">
      {/* Fullscreen overlay */}
      {isFullscreen && <FullscreenEditor />}
      
      {isRoomTooLarge && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Dimensions dépassées</p>
            <p className="text-amber-600 dark:text-amber-500">
              La taille maximale est {MAX_ROOM_SIZE}m × {MAX_ROOM_SIZE}m
            </p>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="grid grid-cols-2 w-[300px]">
            <TabsTrigger value="visual" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Éditeur Visuel
            </TabsTrigger>
            <TabsTrigger value="params" className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Paramètres
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'visual' && (
            <Button 
              variant="outline" 
              onClick={() => setIsFullscreen(true)}
              className="gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              Plein écran
            </Button>
          )}
        </div>
        
        <TabsContent value="visual" className="mt-4">
          <div className="flex gap-6">
            {/* Settings Panel - Fixed width, no scroll */}
            <Card className="w-[320px] shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Room Dimensions */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Dimensions pièce
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Largeur X</Label>
                        <span className="text-sm font-mono font-bold text-blue-600">{roomWidth.toFixed(1)}m</span>
                      </div>
                      <Slider
                        value={[roomWidth]}
                        onValueChange={([v]) => setRoomWidth(v)}
                        min={2}
                        max={MAX_ROOM_SIZE}
                        step={0.1}
                        className="py-1"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Profondeur Y</Label>
                        <span className="text-sm font-mono font-bold text-green-600">{roomDepth.toFixed(1)}m</span>
                      </div>
                      <Slider
                        value={[roomDepth]}
                        onValueChange={([v]) => setRoomDepth(v)}
                        min={2}
                        max={MAX_ROOM_SIZE}
                        step={0.1}
                        className="py-1"
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Radar Settings */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Radar
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Montage</Label>
                      <Select 
                        value={radarMounting}
                        onValueChange={(v) => {
                          onConfigChange?.({
                            ...config,
                            walabotConfig: { 
                              ...config?.walabotConfig, 
                              sensorMounting: v,
                              sensorHeight: MOUNTING_CONFIG[v]?.height || 1.5
                            }
                          });
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MOUNTING_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>
                              {cfg.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Hauteur</Label>
                        <span className="text-sm font-mono font-bold">{radarHeight.toFixed(2)}m</span>
                      </div>
                      <Slider
                        value={[radarHeight]}
                        onValueChange={([v]) => onConfigChange?.({
                          ...config,
                          walabotConfig: { ...config?.walabotConfig, sensorHeight: v }
                        })}
                        min={radarMounting === 'Wall' ? 1.2 : 2.3}
                        max={radarMounting === 'Wall' ? 1.8 : 3.0}
                        step={0.05}
                        className="py-1"
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Display Options - Compact horizontal */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Affichage
                  </Label>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={showGrid} onCheckedChange={setShowGrid} id="grid" />
                      <Label htmlFor="grid" className="text-sm cursor-pointer">Grille</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={showDetectionZone} onCheckedChange={setShowDetectionZone} id="zone" />
                      <Label htmlFor="zone" className="text-sm cursor-pointer">Zone</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={showDistances} onCheckedChange={setShowDistances} id="dist" />
                      <Label htmlFor="dist" className="text-sm cursor-pointer">Distance</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={showCoordinates} onCheckedChange={setShowCoordinates} id="coords" />
                      <Label htmlFor="coords" className="text-sm cursor-pointer">Coords</Label>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* SubRegions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Sous-régions
                    </Label>
                    <Badge variant="secondary" className="text-xs">{subRegions.length}</Badge>
                  </div>
                  
                  {/* Add buttons - Larger */}
                  <div className="flex gap-2">
                    {Object.entries(SUBREGION_TYPES).map(([key, type]) => (
                      <Button
                        key={key}
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        onClick={() => addSubRegion(key)}
                      >
                        <type.icon className="h-4 w-4 mr-1.5" style={{ color: type.color }} />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                  
                  {/* Region list - More visible */}
                  <div className="space-y-2">
                    {subRegions.map((region) => {
                      const regionType = SUBREGION_TYPES[region.type];
                      const isSelected = selectedRegionId === region.id;
                      return (
                        <div 
                          key={region.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all",
                            isSelected ? "shadow-md" : "border-transparent bg-muted/30 hover:bg-muted/50"
                          )}
                          style={{ 
                            borderColor: isSelected ? regionType.color : 'transparent',
                            backgroundColor: isSelected ? `${regionType.color}15` : undefined
                          }}
                          onClick={() => setSelectedRegionId(region.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-8 h-8 rounded-md flex items-center justify-center"
                              style={{ backgroundColor: `${regionType.color}20` }}
                            >
                              <regionType.icon className="h-4 w-4" style={{ color: regionType.color }} />
                            </div>
                            <div>
                              <span className="text-sm font-medium block">{region.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {region.width.toFixed(1)}×{region.length.toFixed(1)}m
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSubRegion(region.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Selected region details */}
                  {selectedRegion && (
                    <div 
                      className="p-3 rounded-lg border-2 space-y-3" 
                      style={{ borderColor: SUBREGION_TYPES[selectedRegion.type]?.color }}
                    >
                      <Input
                        value={selectedRegion.name}
                        onChange={(e) => setSubRegions(regions => 
                          regions.map(r => r.id === selectedRegion.id ? { ...r, name: e.target.value } : r)
                        )}
                        className="h-9 font-medium"
                        placeholder="Nom de la zone"
                      />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-2 bg-muted/50 rounded">
                          <span className="text-xs text-muted-foreground block">Position</span>
                          <span className="font-mono font-medium">{selectedRegion.roomX.toFixed(2)}, {selectedRegion.roomY.toFixed(2)}</span>
                        </div>
                        <div className="p-2 bg-muted/50 rounded">
                          <span className="text-xs text-muted-foreground block">Taille</span>
                          <span className="font-mono font-medium">{selectedRegion.width.toFixed(2)} × {selectedRegion.length.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => {
                    const newX = roomWidth / 2;
                    const newY = isCeiling ? roomDepth / 2 : 0;
                    setRadarPositionX(newX);
                    setRadarPositionY(newY);
                    setSubRegions([{
                      id: 'bed-1',
                      type: 'bed',
                      name: 'Lit',
                      roomX: 0.5,
                      roomY: isCeiling ? 0.5 : 1.0,
                      width: 0.9,
                      length: 2.0
                    }]);
                    setSelectedRegionId(null);
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Réinitialiser tout
                </Button>
              </CardContent>
            </Card>
            
            {/* Visual Canvas - Flexible width */}
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Vue de dessus • Radar = (0,0)</CardTitle>
                    <CardDescription className="text-sm font-mono mt-1">
                      <span className="text-blue-600">X: [{(-radarPositionX).toFixed(2)}, {+(roomWidth - radarPositionX).toFixed(2)}]</span>
                      <span className="mx-2">|</span>
                      <span className="text-green-600">Y: [{isCeiling ? (-radarPositionY).toFixed(2) : "-0.30"}, {+(isCeiling ? (roomDepth - radarPositionY) : (roomDepth - radarPositionY)).toFixed(2)}]</span>
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {roomWidth.toFixed(1)}m × {roomDepth.toFixed(1)}m
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-center p-6">
                <RoomCanvas
                  roomWidth={roomWidth}
                  roomDepth={roomDepth}
                  radarPositionX={radarPositionX}
                  radarPositionY={isCeiling ? radarPositionY : 0}
                  radarMounting={radarMounting}
                  radarHeight={radarHeight}
                  subRegions={subRegions}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={setSelectedRegionId}
                  onRegionMove={handleRegionMove}
                  onRegionResize={handleRegionResize}
                  onRadarMove={handleRadarMove}
                  showGrid={showGrid}
                  showDetectionZone={showDetectionZone}
                  showDistances={showDistances}
                  showCoordinates={showCoordinates}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="params" className="mt-4">
          <CalculatedParamsTab 
            config={config} 
            radarHeight={radarHeight} 
            mountConfig={mountConfig}
            subRegions={subRegions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RoomVisualEditor;
