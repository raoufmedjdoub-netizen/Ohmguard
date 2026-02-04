/**
 * RoomVisualEditor - Éditeur visuel de configuration de chambre pour radars Vayyar
 * Basé sur les Vayyar Care Device Placement Guidelines
 * 
 * Système de coordonnées Vayyar :
 * - X (largeur) : Axe horizontal, perpendiculaire au radar (-gauche, +droite)
 * - Y (profondeur) : Axe vers l'avant du radar (toujours positif, direction de détection)
 * - Z (hauteur) : Axe vertical
 * 
 * Montage mural (Wall) :
 * - Radar à 1.5m du sol
 * - Zone de détection max : 4m × 4m
 * - Le radar est SUR le mur du haut (Y=0), X peut varier
 * 
 * Montage plafond (Ceiling) :
 * - Hauteur plafond : 2.3m à 3m
 * - Zone max : 4m × 5m
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Bed,
  Radio,
  Grid3X3,
  Eye,
  Move,
  RotateCcw,
  Info,
  Settings,
  AlertTriangle
} from 'lucide-react';

// Constants based on Vayyar Guidelines
const SCALE = 80; // pixels per meter
const ROOM_PADDING = 60;

// Mounting configurations from Vayyar specs
const MOUNTING_CONFIG = {
  Wall: {
    label: 'Mural',
    description: 'Radar fixé sur le mur à 1.5m du sol',
    height: 1.5,
    maxX: 2.0, // ±2m each side
    maxY: 4.0, // up to 4m forward
    maxRoom: { width: 4, depth: 4 }
  },
  Ceiling: {
    label: 'Plafond',
    description: 'Radar fixé au plafond (recommandé)',
    height: 2.7,
    maxX: 2.0, // ±2m each side
    maxY: 2.5, // ±2.5m each direction
    maxRoom: { width: 4, depth: 5 }
  }
};

/**
 * SVG Room Canvas Component - Vue de dessus
 * Le radar est toujours en haut (mur du fond) pour le montage mural
 * L'axe Y pointe vers le bas (direction de détection)
 */
function RoomCanvas({
  roomWidth,
  roomDepth,
  radarPositionX,
  radarMounting,
  radarHeight,
  bedPosition,
  bedSize,
  xMin,
  xMax,
  yMin,
  yMax,
  onRadarMoveX,
  onBedMove,
  onBedResize,
  showGrid,
  showDetectionZone,
  showDistances
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Conversion functions
  const mToPixels = (m) => m * SCALE;
  const pixelsToM = (px) => px / SCALE;
  
  // Canvas dimensions
  const canvasWidth = mToPixels(roomWidth) + ROOM_PADDING * 2;
  const canvasHeight = mToPixels(roomDepth) + ROOM_PADDING * 2;
  
  // Room rectangle (origin top-left)
  const roomRect = {
    x: ROOM_PADDING,
    y: ROOM_PADDING,
    width: mToPixels(roomWidth),
    height: mToPixels(roomDepth)
  };
  
  // Radar position in SVG coordinates
  // Pour montage mural : radar sur le mur du haut, position X variable
  // radarPositionX est en mètres depuis le bord gauche de la pièce
  const radarScreenPos = {
    x: roomRect.x + mToPixels(radarPositionX),
    y: roomRect.y // Sur le mur du haut
  };
  
  // Detection zone in SVG coordinates
  // xMin/xMax sont relatifs au radar (- = gauche, + = droite)
  // yMin/yMax sont vers l'avant (dans la pièce)
  const detectionZoneRect = showDetectionZone ? {
    x: radarScreenPos.x + mToPixels(xMin),
    y: radarScreenPos.y + mToPixels(yMin),
    width: mToPixels(xMax - xMin),
    height: mToPixels(yMax - yMin)
  } : null;
  
  // Bed position in SVG coordinates
  // bedPosition est en mètres depuis le coin supérieur gauche de la pièce
  const bedScreenPos = {
    x: roomRect.x + mToPixels(bedPosition.x),
    y: roomRect.y + mToPixels(bedPosition.y),
    width: mToPixels(bedSize.width),
    height: mToPixels(bedSize.length)
  };
  
  // Calculate distance from radar to bed center
  const calculateDistanceToBed = () => {
    const bedCenterX = bedPosition.x;
    const bedCenterY = bedPosition.y + bedSize.length / 2;
    // Distance horizontale (X) depuis le radar
    const dx = bedCenterX + bedSize.width / 2 - radarPositionX;
    // Distance en profondeur (Y) depuis le radar (qui est à Y=0)
    const dy = bedCenterY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Calculate bed coordinates relative to radar (for subregion)
  const getBedRelativeCoords = () => {
    return {
      xMin: bedPosition.x - radarPositionX,
      xMax: bedPosition.x + bedSize.width - radarPositionX,
      yMin: bedPosition.y,
      yMax: bedPosition.y + bedSize.length
    };
  };
  
  // Mouse handlers
  const handleMouseDown = (e, target) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    if (target === 'radar') {
      setDragging('radar');
      setDragOffset({ x: svgP.x - radarScreenPos.x, y: 0 });
    } else if (target === 'bed') {
      setDragging('bed');
      setDragOffset({
        x: svgP.x - bedScreenPos.x,
        y: svgP.y - bedScreenPos.y
      });
    } else if (target === 'bed-resize') {
      setDragging('bed-resize');
    }
  };
  
  const handleMouseMove = (e) => {
    if (!dragging) return;
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    if (dragging === 'radar') {
      // Radar can only move along X axis (on the wall)
      let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
      newX = Math.max(0.2, Math.min(roomWidth - 0.2, newX));
      onRadarMoveX?.(newX);
    } else if (dragging === 'bed') {
      let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
      let newY = pixelsToM(svgP.y - dragOffset.y - roomRect.y);
      
      // Constrain to room bounds
      newX = Math.max(0, Math.min(roomWidth - bedSize.width, newX));
      newY = Math.max(0.5, Math.min(roomDepth - bedSize.length, newY)); // Min 0.5m from radar wall
      
      onBedMove?.({ x: newX, y: newY });
    } else if (dragging === 'bed-resize') {
      const newWidth = pixelsToM(svgP.x - bedScreenPos.x);
      const newLength = pixelsToM(svgP.y - bedScreenPos.y);
      
      onBedResize?.({
        width: Math.max(0.6, Math.min(2.2, newWidth)),
        length: Math.max(1.4, Math.min(2.2, newLength))
      });
    }
  };
  
  const handleMouseUp = () => {
    setDragging(null);
  };
  
  const distance = calculateDistanceToBed();
  const bedRelative = getBedRelativeCoords();
  const mountConfig = MOUNTING_CONFIG[radarMounting] || MOUNTING_CONFIG.Wall;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={canvasWidth}
        height={canvasHeight}
        className="bg-slate-50 dark:bg-slate-900 rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-inner"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          {/* Gradient for detection cone */}
          <linearGradient id="coneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </linearGradient>
          {/* Pattern for detection zone */}
          <pattern id="detectionPattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M 0 10 L 10 0" stroke="#22c55e" strokeWidth="1" opacity="0.3" />
          </pattern>
        </defs>
        
        {/* Grid */}
        {showGrid && (
          <g className="opacity-30">
            {/* Vertical lines every 0.5m */}
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
            {/* Horizontal lines every 0.5m */}
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
        
        {/* Wall labels */}
        <text
          x={roomRect.x + roomRect.width / 2}
          y={roomRect.y - 8}
          textAnchor="middle"
          className="fill-slate-500 text-xs font-medium"
        >
          Mur du radar
        </text>
        
        {/* Room dimension labels */}
        <text
          x={roomRect.x + roomRect.width / 2}
          y={roomRect.y + roomRect.height + 25}
          textAnchor="middle"
          className="fill-slate-600 dark:fill-slate-400 text-sm font-bold"
        >
          {roomWidth.toFixed(1)} m (largeur)
        </text>
        <text
          x={roomRect.x - 25}
          y={roomRect.y + roomRect.height / 2}
          textAnchor="middle"
          transform={`rotate(-90, ${roomRect.x - 25}, ${roomRect.y + roomRect.height / 2})`}
          className="fill-slate-600 dark:fill-slate-400 text-sm font-bold"
        >
          {roomDepth.toFixed(1)} m (profondeur)
        </text>
        
        {/* Axis indicators */}
        <g className="opacity-60">
          {/* X axis arrow */}
          <line
            x1={roomRect.x + 20}
            y1={roomRect.y + roomRect.height + 45}
            x2={roomRect.x + 80}
            y2={roomRect.y + roomRect.height + 45}
            stroke="#3b82f6"
            strokeWidth={2}
            markerEnd="url(#arrowX)"
          />
          <text x={roomRect.x + 90} y={roomRect.y + roomRect.height + 49} className="fill-blue-500 text-xs font-bold">X</text>
          
          {/* Y axis arrow */}
          <line
            x1={roomRect.x - 45}
            y1={roomRect.y + 20}
            x2={roomRect.x - 45}
            y2={roomRect.y + 80}
            stroke="#22c55e"
            strokeWidth={2}
          />
          <text x={roomRect.x - 42} y={roomRect.y + 95} className="fill-green-500 text-xs font-bold">Y</text>
        </g>
        
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
        
        {/* Detection cone from radar */}
        <path
          d={`M ${radarScreenPos.x} ${radarScreenPos.y}
              L ${radarScreenPos.x + mToPixels(xMin)} ${radarScreenPos.y + mToPixels(yMax)}
              L ${radarScreenPos.x + mToPixels(xMax)} ${radarScreenPos.y + mToPixels(yMax)}
              Z`}
          fill="url(#coneGradient)"
          className="pointer-events-none"
        />
        
        {/* Bed SubRegion indicator */}
        <rect
          x={bedScreenPos.x - 4}
          y={bedScreenPos.y - 4}
          width={bedScreenPos.width + 8}
          height={bedScreenPos.height + 8}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6,3"
          rx={4}
          className="pointer-events-none"
        />
        
        {/* Bed */}
        <g
          className={cn('cursor-move', dragging === 'bed' && 'opacity-70')}
          onMouseDown={(e) => handleMouseDown(e, 'bed')}
        >
          {/* Bed shadow */}
          <rect
            x={bedScreenPos.x + 4}
            y={bedScreenPos.y + 4}
            width={bedScreenPos.width}
            height={bedScreenPos.height}
            rx={6}
            fill="rgba(0,0,0,0.15)"
          />
          {/* Bed body */}
          <rect
            x={bedScreenPos.x}
            y={bedScreenPos.y}
            width={bedScreenPos.width}
            height={bedScreenPos.height}
            rx={6}
            fill="#3b82f6"
            fillOpacity={0.2}
            stroke="#3b82f6"
            strokeWidth={3}
          />
          {/* Pillow */}
          <rect
            x={bedScreenPos.x + 6}
            y={bedScreenPos.y + 6}
            width={bedScreenPos.width - 12}
            height={mToPixels(0.4)}
            rx={4}
            fill="#3b82f6"
            fillOpacity={0.4}
          />
          {/* Bed label */}
          <text
            x={bedScreenPos.x + bedScreenPos.width / 2}
            y={bedScreenPos.y + bedScreenPos.height / 2 + 5}
            textAnchor="middle"
            className="fill-blue-700 dark:fill-blue-400 text-sm font-bold pointer-events-none"
          >
            LIT
          </text>
          {/* Bed dimensions */}
          <text
            x={bedScreenPos.x + bedScreenPos.width / 2}
            y={bedScreenPos.y + bedScreenPos.height + 16}
            textAnchor="middle"
            className="fill-blue-600 text-[10px] font-medium pointer-events-none"
          >
            {bedSize.width.toFixed(2)}m × {bedSize.length.toFixed(2)}m
          </text>
          {/* Resize handle */}
          <circle
            cx={bedScreenPos.x + bedScreenPos.width}
            cy={bedScreenPos.y + bedScreenPos.height}
            r={8}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            className="cursor-se-resize"
            onMouseDown={(e) => handleMouseDown(e, 'bed-resize')}
          />
        </g>
        
        {/* Radar */}
        <g
          className={cn('cursor-ew-resize', dragging === 'radar' && 'opacity-70')}
          onMouseDown={(e) => handleMouseDown(e, 'radar')}
        >
          {/* Radar mount indicator */}
          <rect
            x={radarScreenPos.x - 20}
            y={radarScreenPos.y - 8}
            width={40}
            height={8}
            fill="#dc2626"
            rx={2}
          />
          {/* Radar body */}
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={16}
            fill="#ef4444"
            stroke="white"
            strokeWidth={3}
          />
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={6}
            fill="white"
          />
          {/* Radar waves */}
          {[24, 32].map((r, i) => (
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
          ))}
          {/* Radar label */}
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y + 35}
            textAnchor="middle"
            className="fill-red-600 text-xs font-bold pointer-events-none"
          >
            RADAR
          </text>
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y + 47}
            textAnchor="middle"
            className="fill-red-500 text-[10px] pointer-events-none"
          >
            H={radarHeight.toFixed(2)}m ({mountConfig.label})
          </text>
        </g>
        
        {/* Distance line from radar to bed */}
        {showDistances && (
          <g className="pointer-events-none">
            <line
              x1={radarScreenPos.x}
              y1={radarScreenPos.y}
              x2={bedScreenPos.x + bedScreenPos.width / 2}
              y2={bedScreenPos.y + bedScreenPos.height / 2}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6,4"
            />
            {/* Distance label */}
            <rect
              x={(radarScreenPos.x + bedScreenPos.x + bedScreenPos.width / 2) / 2 - 30}
              y={(radarScreenPos.y + bedScreenPos.y + bedScreenPos.height / 2) / 2 - 10}
              width={60}
              height={20}
              rx={4}
              fill="white"
              className="dark:fill-slate-800"
              stroke="#f59e0b"
              strokeWidth={1}
            />
            <text
              x={(radarScreenPos.x + bedScreenPos.x + bedScreenPos.width / 2) / 2}
              y={(radarScreenPos.y + bedScreenPos.y + bedScreenPos.height / 2) / 2 + 4}
              textAnchor="middle"
              className="fill-amber-600 text-xs font-bold"
            >
              {distance.toFixed(2)}m
            </text>
          </g>
        )}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-3 rounded-lg border shadow-sm text-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white" />
            <span>Radar (déplacer horizontalement)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/30 border-2 border-blue-500" />
            <span>Lit (déplacer + redimensionner)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/20 border border-dashed border-green-500" />
            <span>Zone de détection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-dashed border-amber-500" />
            <span>SubRegion lit</span>
          </div>
        </div>
      </div>
      
      {/* Bed SubRegion Coordinates */}
      <div className="absolute bottom-3 right-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-xs">
        <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">SubRegion Lit (relatif au radar)</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-amber-600 dark:text-amber-500">
          <span>xMin: {bedRelative.xMin.toFixed(2)}m</span>
          <span>xMax: {bedRelative.xMax.toFixed(2)}m</span>
          <span>yMin: {bedRelative.yMin.toFixed(2)}m</span>
          <span>yMax: {bedRelative.yMax.toFixed(2)}m</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Main RoomVisualEditor Component
 */
export function RoomVisualEditor({ config, onConfigChange }) {
  // Room dimensions
  const [roomWidth, setRoomWidth] = useState(4.0);
  const [roomDepth, setRoomDepth] = useState(4.0);
  
  // Radar X position (en mètres depuis le bord gauche)
  const [radarPositionX, setRadarPositionX] = useState(2.0);
  
  // Bed position and size
  const [bedPosition, setBedPosition] = useState({ x: 0.3, y: 1.5 });
  const [bedSize, setBedSize] = useState({ width: 0.9, length: 2.0 });
  
  // Display options
  const [showGrid, setShowGrid] = useState(true);
  const [showDetectionZone, setShowDetectionZone] = useState(true);
  const [showDistances, setShowDistances] = useState(true);
  
  // Get mounting config
  const radarMounting = config?.walabotConfig?.sensorMounting || 'Wall';
  const radarHeight = config?.walabotConfig?.sensorHeight || 1.5;
  const mountConfig = MOUNTING_CONFIG[radarMounting] || MOUNTING_CONFIG.Wall;
  
  // Current detection zone from config
  const xMin = config?.walabotConfig?.xMin ?? -2.0;
  const xMax = config?.walabotConfig?.xMax ?? 2.0;
  const yMin = config?.walabotConfig?.yMin ?? 0.3;
  const yMax = config?.walabotConfig?.yMax ?? 4.0;
  
  // Initialize from config
  useEffect(() => {
    if (!config?.walabotConfig) return;
    
    const wc = config.walabotConfig;
    
    // Calculate room size from detection zone
    if (wc.xMax !== undefined && wc.xMin !== undefined) {
      const width = Math.abs(wc.xMin) + Math.abs(wc.xMax);
      setRoomWidth(Math.max(2, Math.min(6, width)));
      // Radar position X = distance from left wall = |xMin|
      setRadarPositionX(Math.abs(wc.xMin));
    }
    if (wc.yMax !== undefined) {
      setRoomDepth(Math.max(2, Math.min(6, wc.yMax)));
    }
    
    // Extract bed from subregions
    const bedRegion = wc.trackerSubRegions?.find(r => 
      r.name?.toLowerCase().includes('lit') || 
      r.name?.toLowerCase().includes('bed') ||
      r.isFallingDetection
    );
    
    if (bedRegion) {
      // Convert from radar-relative to room-absolute coordinates
      const absXMin = bedRegion.xMin + Math.abs(wc.xMin || 2);
      setBedPosition({
        x: Math.max(0, absXMin),
        y: Math.max(0.5, bedRegion.yMin || 1.5)
      });
      setBedSize({
        width: Math.max(0.6, (bedRegion.xMax - bedRegion.xMin) || 0.9),
        length: Math.max(1.4, (bedRegion.yMax - bedRegion.yMin) || 2.0)
      });
    }
  }, []);
  
  // Update config when positions change
  const updateConfig = useCallback(() => {
    if (!onConfigChange) return;
    
    // Detection zone relative to radar
    // xMin = negative (left side), xMax = positive (right side)
    const newXMin = -radarPositionX;
    const newXMax = roomWidth - radarPositionX;
    const newYMin = 0.3; // Minimum detection distance
    const newYMax = roomDepth;
    
    // Bed subregion relative to radar
    const bedXMin = bedPosition.x - radarPositionX;
    const bedXMax = bedXMin + bedSize.width;
    const bedYMin = bedPosition.y;
    const bedYMax = bedYMin + bedSize.length;
    
    const bedSubRegion = {
      xMin: parseFloat(bedXMin.toFixed(2)),
      xMax: parseFloat(bedXMax.toFixed(2)),
      yMin: parseFloat(bedYMin.toFixed(2)),
      yMax: parseFloat(bedYMax.toFixed(2)),
      zMin: 0,
      zMax: config?.walabotConfig?.zMax || 2.0,
      enterDuration: 120,
      exitDuration: 120,
      isFallingDetection: true,
      isPresenceDetection: true,
      isLowSnr: true,
      isHorizontal: true,
      isDoor: false,
      name: "Lit"
    };
    
    onConfigChange({
      ...config,
      walabotConfig: {
        ...config?.walabotConfig,
        xMin: parseFloat(newXMin.toFixed(2)),
        xMax: parseFloat(newXMax.toFixed(2)),
        yMin: parseFloat(newYMin.toFixed(2)),
        yMax: parseFloat(newYMax.toFixed(2)),
        trackerSubRegions: [bedSubRegion]
      }
    });
  }, [config, onConfigChange, roomWidth, roomDepth, radarPositionX, bedPosition, bedSize]);
  
  // Debounced update
  useEffect(() => {
    const timer = setTimeout(updateConfig, 200);
    return () => clearTimeout(timer);
  }, [radarPositionX, bedPosition, bedSize, roomWidth, roomDepth]);
  
  // Check if room exceeds max dimensions
  const isRoomTooLarge = roomWidth > mountConfig.maxRoom.width || roomDepth > mountConfig.maxRoom.depth;
  
  return (
    <div className="space-y-4">
      {/* Warning for oversized room */}
      {isRoomTooLarge && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Dimensions dépassées</p>
            <p className="text-amber-600 dark:text-amber-500">
              Pour un montage {mountConfig.label.toLowerCase()}, la taille maximale recommandée est {mountConfig.maxRoom.width}m × {mountConfig.maxRoom.depth}m
            </p>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Settings Panel */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Room Dimensions */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dimensions pièce
              </Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Largeur (X)</Label>
                  <span className="text-sm font-mono font-medium">{roomWidth.toFixed(1)}m</span>
                </div>
                <Slider
                  value={[roomWidth]}
                  onValueChange={([v]) => setRoomWidth(v)}
                  min={2}
                  max={6}
                  step={0.1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Profondeur (Y)</Label>
                  <span className="text-sm font-mono font-medium">{roomDepth.toFixed(1)}m</span>
                </div>
                <Slider
                  value={[roomDepth]}
                  onValueChange={([v]) => setRoomDepth(v)}
                  min={2}
                  max={6}
                  step={0.1}
                />
              </div>
            </div>
            
            <Separator />
            
            {/* Radar Settings */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Radar
              </Label>
              <div className="space-y-2">
                <Label className="text-sm">Montage</Label>
                <Select 
                  value={radarMounting}
                  onValueChange={(v) => onConfigChange?.({
                    ...config,
                    walabotConfig: { 
                      ...config?.walabotConfig, 
                      sensorMounting: v,
                      sensorHeight: MOUNTING_CONFIG[v]?.height || 1.5
                    }
                  })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOUNTING_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <span className="font-medium">{cfg.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            (max {cfg.maxRoom.width}×{cfg.maxRoom.depth}m)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Hauteur</Label>
                  <span className="text-sm font-mono font-medium">{radarHeight.toFixed(2)}m</span>
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
                />
                <p className="text-[10px] text-muted-foreground">
                  {radarMounting === 'Wall' ? 'Recommandé: 1.5m' : 'Plafond: 2.3m - 3.0m'}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Position X</Label>
                  <span className="text-sm font-mono font-medium">{radarPositionX.toFixed(2)}m</span>
                </div>
                <Slider
                  value={[radarPositionX]}
                  onValueChange={([v]) => setRadarPositionX(v)}
                  min={0.3}
                  max={roomWidth - 0.3}
                  step={0.05}
                />
                <p className="text-[10px] text-muted-foreground">
                  Distance depuis le mur gauche
                </p>
              </div>
            </div>
            
            <Separator />
            
            {/* Display Options */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Affichage
              </Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Grid3X3 className="h-3 w-3" />
                    Grille (50cm)
                  </Label>
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Eye className="h-3 w-3" />
                    Zone détection
                  </Label>
                  <Switch checked={showDetectionZone} onCheckedChange={setShowDetectionZone} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Move className="h-3 w-3" />
                    Distances
                  </Label>
                  <Switch checked={showDistances} onCheckedChange={setShowDistances} />
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Bed Info */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lit
              </Label>
              <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Position:</span>
                  <span className="font-mono">{bedPosition.x.toFixed(2)}, {bedPosition.y.toFixed(2)}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taille:</span>
                  <span className="font-mono">{bedSize.width.toFixed(2)} × {bedSize.length.toFixed(2)}m</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setRadarPositionX(roomWidth / 2);
                  setBedPosition({ x: (roomWidth - bedSize.width) / 2, y: 1.5 });
                  setBedSize({ width: 0.9, length: 2.0 });
                }}
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Réinitialiser
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Visual Canvas */}
        <div className="xl:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Vue de dessus de la chambre</CardTitle>
                  <CardDescription className="text-xs">
                    Glissez le radar horizontalement et le lit dans la zone de détection
                  </CardDescription>
                </div>
                <Badge variant="outline" className={isRoomTooLarge ? 'border-amber-500 text-amber-500' : ''}>
                  {roomWidth.toFixed(1)}m × {roomDepth.toFixed(1)}m
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex justify-center overflow-auto pb-4">
              <RoomCanvas
                roomWidth={roomWidth}
                roomDepth={roomDepth}
                radarPositionX={radarPositionX}
                radarMounting={radarMounting}
                radarHeight={radarHeight}
                bedPosition={bedPosition}
                bedSize={bedSize}
                xMin={-radarPositionX}
                xMax={roomWidth - radarPositionX}
                yMin={0.3}
                yMax={roomDepth}
                onRadarMoveX={setRadarPositionX}
                onBedMove={setBedPosition}
                onBedResize={setBedSize}
                showGrid={showGrid}
                showDetectionZone={showDetectionZone}
                showDistances={showDistances}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Calculated Values */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Paramètres calculés (walabotConfig)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">xMin</p>
              <p className="text-sm font-mono font-bold">{(config?.walabotConfig?.xMin ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">xMax</p>
              <p className="text-sm font-mono font-bold">{(config?.walabotConfig?.xMax ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">yMin</p>
              <p className="text-sm font-mono font-bold">{(config?.walabotConfig?.yMin ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
              <p className="text-[10px] text-muted-foreground">yMax</p>
              <p className="text-sm font-mono font-bold">{(config?.walabotConfig?.yMax ?? 0).toFixed(2)}</p>
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
          
          {/* Bed SubRegion */}
          {config?.walabotConfig?.trackerSubRegions?.[0] && (
            <div className="mt-3 p-3 border rounded bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Bed className="h-3 w-3" />
                trackerSubRegion[0] - Zone du lit
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="font-mono">
                  <span className="text-muted-foreground">X: </span>
                  {config.walabotConfig.trackerSubRegions[0].xMin?.toFixed(2)} → {config.walabotConfig.trackerSubRegions[0].xMax?.toFixed(2)}m
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Y: </span>
                  {config.walabotConfig.trackerSubRegions[0].yMin?.toFixed(2)} → {config.walabotConfig.trackerSubRegions[0].yMax?.toFixed(2)}m
                </div>
                <div>
                  <span className="text-muted-foreground">Chute: </span>
                  <Badge variant="default" className="text-[10px] h-4">Activée</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Présence: </span>
                  <Badge variant="default" className="text-[10px] h-4">Activée</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RoomVisualEditor;
