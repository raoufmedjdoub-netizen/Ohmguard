/**
 * RoomVisualEditor - Éditeur visuel de configuration de chambre pour radars Vayyar
 * Basé sur les Vayyar Care Device Placement Guidelines
 * 
 * Système de coordonnées Vayyar :
 * - X (largeur) : Axe horizontal, perpendiculaire au radar (-gauche, +droite)
 * - Y (profondeur) : Axe vers l'avant du radar (peut être négatif pour plafond)
 * - Z (hauteur) : Axe vertical
 * 
 * Montage mural (Wall) :
 * - Radar à 1.5m du sol, sur le mur du haut
 * - Zone de détection max : 5m × 5m
 * - Le radar est SUR le mur du haut, X peut varier
 * 
 * Montage plafond (Ceiling) :
 * - Hauteur plafond : 2.3m à 3m
 * - Radar au centre de la pièce par défaut
 * - Zone max : 5m × 5m
 * - Déplaçable sur X ET Y
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
import { cn } from '@/lib/utils';
import {
  Bed,
  Grid3X3,
  Eye,
  Move,
  RotateCcw,
  Info,
  Settings,
  AlertTriangle,
  Layers
} from 'lucide-react';

// Constants based on Vayyar Guidelines
const SCALE = 80; // pixels per meter
const ROOM_PADDING = 60;
const MAX_ROOM_SIZE = 5; // 5m × 5m max

// Mounting configurations from Vayyar specs
const MOUNTING_CONFIG = {
  Wall: {
    label: 'Mural',
    description: 'Radar fixé sur le mur à 1.5m du sol',
    height: 1.5,
    maxRoom: { width: 5, depth: 5 },
    radarMovement: 'horizontal' // Only X movement
  },
  Ceiling: {
    label: 'Plafond',
    description: 'Radar fixé au plafond (recommandé)',
    height: 2.7,
    maxRoom: { width: 5, depth: 5 },
    radarMovement: 'both' // X and Y movement
  }
};

/**
 * SVG Room Canvas Component - Vue de dessus
 * Pour montage mural : radar sur le mur du haut
 * Pour montage plafond : radar au centre, déplaçable librement
 */
function RoomCanvas({
  roomWidth,
  roomDepth,
  radarPositionX,
  radarPositionY,
  radarMounting,
  radarHeight,
  bedPosition,
  bedSize,
  xMin,
  xMax,
  yMin,
  yMax,
  onRadarMove,
  onBedMove,
  onBedResize,
  showGrid,
  showDetectionZone,
  showDistances,
  canvasHeight: targetHeight
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const isCeiling = radarMounting === 'Ceiling';
  
  // Conversion functions
  const mToPixels = (m) => m * SCALE;
  const pixelsToM = (px) => px / SCALE;
  
  // Canvas dimensions - use target height if provided
  const canvasWidth = mToPixels(roomWidth) + ROOM_PADDING * 2;
  const naturalCanvasHeight = mToPixels(roomDepth) + ROOM_PADDING * 2;
  const canvasHeight = targetHeight || naturalCanvasHeight;
  
  // Adjust scale to fit if needed
  const scaleAdjust = targetHeight ? Math.min(1, (targetHeight - ROOM_PADDING * 2) / mToPixels(roomDepth)) : 1;
  
  // Room rectangle (origin top-left)
  const roomRect = {
    x: ROOM_PADDING,
    y: ROOM_PADDING,
    width: mToPixels(roomWidth) * scaleAdjust,
    height: mToPixels(roomDepth) * scaleAdjust
  };
  
  // Adjusted conversion for scaled canvas
  const mToPixelsScaled = (m) => m * SCALE * scaleAdjust;
  const pixelsToMScaled = (px) => px / (SCALE * scaleAdjust);
  
  // Radar position in SVG coordinates
  const radarScreenPos = isCeiling ? {
    // Ceiling: radar can be anywhere in the room
    x: roomRect.x + mToPixelsScaled(radarPositionX),
    y: roomRect.y + mToPixelsScaled(radarPositionY)
  } : {
    // Wall: radar on top wall, only X varies
    x: roomRect.x + mToPixelsScaled(radarPositionX),
    y: roomRect.y
  };
  
  // Detection zone in SVG coordinates
  const detectionZoneRect = showDetectionZone ? {
    x: radarScreenPos.x + mToPixelsScaled(xMin),
    y: radarScreenPos.y + mToPixelsScaled(yMin),
    width: mToPixelsScaled(xMax - xMin),
    height: mToPixelsScaled(yMax - yMin)
  } : null;
  
  // Bed position in SVG coordinates (absolute room position)
  const bedScreenPos = {
    x: roomRect.x + mToPixelsScaled(bedPosition.x),
    y: roomRect.y + mToPixelsScaled(bedPosition.y),
    width: mToPixelsScaled(bedSize.width),
    height: mToPixelsScaled(bedSize.length)
  };
  
  // Calculate distance from radar to bed center
  const calculateDistanceToBed = () => {
    const bedCenterX = bedPosition.x + bedSize.width / 2;
    const bedCenterY = bedPosition.y + bedSize.length / 2;
    const dx = bedCenterX - radarPositionX;
    const dy = isCeiling ? (bedCenterY - radarPositionY) : bedCenterY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Calculate bed coordinates relative to radar (for subregion)
  const getBedRelativeCoords = () => {
    return {
      xMin: bedPosition.x - radarPositionX,
      xMax: bedPosition.x + bedSize.width - radarPositionX,
      yMin: isCeiling ? (bedPosition.y - radarPositionY) : bedPosition.y,
      yMax: isCeiling ? (bedPosition.y + bedSize.length - radarPositionY) : (bedPosition.y + bedSize.length)
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
      setDragOffset({ 
        x: svgP.x - radarScreenPos.x, 
        y: svgP.y - radarScreenPos.y 
      });
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
      let newX = pixelsToMScaled(svgP.x - dragOffset.x - roomRect.x);
      newX = Math.max(0.3, Math.min(roomWidth - 0.3, newX));
      
      if (isCeiling) {
        // Ceiling: radar can move on both axes
        let newY = pixelsToMScaled(svgP.y - dragOffset.y - roomRect.y);
        newY = Math.max(0.3, Math.min(roomDepth - 0.3, newY));
        onRadarMove?.(newX, newY);
      } else {
        // Wall: radar only moves on X axis
        onRadarMove?.(newX, 0);
      }
    } else if (dragging === 'bed') {
      let newX = pixelsToMScaled(svgP.x - dragOffset.x - roomRect.x);
      let newY = pixelsToMScaled(svgP.y - dragOffset.y - roomRect.y);
      
      // Constrain to room bounds
      newX = Math.max(0, Math.min(roomWidth - bedSize.width, newX));
      newY = Math.max(0, Math.min(roomDepth - bedSize.length, newY));
      
      onBedMove?.({ x: newX, y: newY });
    } else if (dragging === 'bed-resize') {
      const newWidth = pixelsToMScaled(svgP.x - bedScreenPos.x);
      const newLength = pixelsToMScaled(svgP.y - bedScreenPos.y);
      
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
        preserveAspectRatio="xMidYMid meet"
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
          {/* Ceiling radar pattern */}
          <radialGradient id="ceilingGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </radialGradient>
        </defs>
        
        {/* Grid */}
        {showGrid && (
          <g className="opacity-30">
            {/* Vertical lines every 0.5m */}
            {Array.from({ length: Math.ceil(roomWidth * 2) + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={roomRect.x + i * mToPixelsScaled(0.5)}
                y1={roomRect.y}
                x2={roomRect.x + i * mToPixelsScaled(0.5)}
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
                y1={roomRect.y + i * mToPixelsScaled(0.5)}
                x2={roomRect.x + roomRect.width}
                y2={roomRect.y + i * mToPixelsScaled(0.5)}
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
        {!isCeiling && (
          <text
            x={roomRect.x + roomRect.width / 2}
            y={roomRect.y - 8}
            textAnchor="middle"
            className="fill-slate-500 text-xs font-medium"
          >
            Mur du radar
          </text>
        )}
        
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
        
        {/* Detection cone/circle from radar */}
        {isCeiling ? (
          // Ceiling: circular detection area
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={Math.min(mToPixelsScaled(Math.max(Math.abs(xMin), xMax, Math.abs(yMin), yMax)), roomRect.width / 2)}
            fill="url(#ceilingGradient)"
            className="pointer-events-none"
          />
        ) : (
          // Wall: cone detection
          <path
            d={`M ${radarScreenPos.x} ${radarScreenPos.y}
                L ${radarScreenPos.x + mToPixelsScaled(xMin)} ${radarScreenPos.y + mToPixelsScaled(yMax)}
                L ${radarScreenPos.x + mToPixelsScaled(xMax)} ${radarScreenPos.y + mToPixelsScaled(yMax)}
                Z`}
            fill="url(#coneGradient)"
            className="pointer-events-none"
          />
        )}
        
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
            height={mToPixelsScaled(0.4)}
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
          className={cn(
            isCeiling ? 'cursor-move' : 'cursor-ew-resize', 
            dragging === 'radar' && 'opacity-70'
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
            r={isCeiling ? 20 : 16}
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
            // Ceiling: circular waves
            [28, 38].map((r, i) => (
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
            // Wall: directional waves
            [24, 32].map((r, i) => (
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
            y={radarScreenPos.y + (isCeiling ? 45 : 35)}
            textAnchor="middle"
            className="fill-red-600 text-xs font-bold pointer-events-none"
          >
            RADAR
          </text>
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y + (isCeiling ? 57 : 47)}
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
            <span>Radar ({isCeiling ? 'déplacer librement' : 'déplacer horizontalement'})</span>
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
 * Calculated Parameters Tab Component
 */
function CalculatedParamsTab({ config, radarHeight, mountConfig }) {
  return (
    <div className="space-y-4">
      {/* Main walabotConfig values */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Paramètres walabotConfig
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
        </CardContent>
      </Card>
      
      {/* Bed SubRegion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Sous-régions (trackerSubRegions)
          </CardTitle>
          <CardDescription className="text-xs">
            Zones de détection spécifiques comme le lit
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config?.walabotConfig?.trackerSubRegions?.length > 0 ? (
            <div className="space-y-3">
              {config.walabotConfig.trackerSubRegions.map((region, idx) => (
                <div 
                  key={idx}
                  className="p-3 border rounded bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                >
                  <p className="text-xs font-semibold mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <Bed className="h-3 w-3" />
                    trackerSubRegion[{idx}] - {region.name || 'Zone'}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Coordonnées X</p>
                      <p className="font-mono">
                        {region.xMin?.toFixed(2)} → {region.xMax?.toFixed(2)}m
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Coordonnées Y</p>
                      <p className="font-mono">
                        {region.yMin?.toFixed(2)} → {region.yMax?.toFixed(2)}m
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Coordonnées Z</p>
                      <p className="font-mono">
                        {region.zMin?.toFixed(2)} → {region.zMax?.toFixed(2)}m
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Durées</p>
                      <p className="font-mono text-[10px]">
                        Entrée: {region.enterDuration}s / Sortie: {region.exitDuration}s
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 pt-2 border-t">
                    <Badge variant={region.isFallingDetection ? "default" : "secondary"} className="text-[10px]">
                      Chute: {region.isFallingDetection ? 'Activée' : 'Désactivée'}
                    </Badge>
                    <Badge variant={region.isPresenceDetection ? "default" : "secondary"} className="text-[10px]">
                      Présence: {region.isPresenceDetection ? 'Activée' : 'Désactivée'}
                    </Badge>
                    <Badge variant={region.isHorizontal ? "outline" : "secondary"} className="text-[10px]">
                      {region.isHorizontal ? 'Horizontal' : 'Vertical'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune sous-région configurée. Placez le lit dans l'éditeur visuel pour créer une sous-région.
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
  
  // Radar position (X and Y for ceiling mounting)
  const [radarPositionX, setRadarPositionX] = useState(2.0);
  const [radarPositionY, setRadarPositionY] = useState(2.0); // Only used for ceiling
  
  // Bed position and size
  const [bedPosition, setBedPosition] = useState({ x: 0.3, y: 1.5 });
  const [bedSize, setBedSize] = useState({ width: 0.9, length: 2.0 });
  
  // Display options
  const [showGrid, setShowGrid] = useState(true);
  const [showDetectionZone, setShowDetectionZone] = useState(true);
  const [showDistances, setShowDistances] = useState(true);
  
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
    
    // Calculate room size from detection zone
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
    
    // Extract bed from subregions
    const bedRegion = wc.trackerSubRegions?.find(r => 
      r.name?.toLowerCase().includes('lit') || 
      r.name?.toLowerCase().includes('bed') ||
      r.isFallingDetection
    );
    
    if (bedRegion) {
      const absXMin = bedRegion.xMin + Math.abs(wc.xMin || 2);
      const absYMin = wc.sensorMounting === 'Ceiling' 
        ? bedRegion.yMin + Math.abs(wc.yMin || 2)
        : bedRegion.yMin;
      setBedPosition({
        x: Math.max(0, absXMin),
        y: Math.max(0, absYMin || 1.5)
      });
      setBedSize({
        width: Math.max(0.6, (bedRegion.xMax - bedRegion.xMin) || 0.9),
        length: Math.max(1.4, (bedRegion.yMax - bedRegion.yMin) || 2.0)
      });
    }
  }, []);
  
  // Handle mounting change - reset radar position
  useEffect(() => {
    if (isCeiling) {
      // Ceiling: center radar in both axes
      setRadarPositionX(roomWidth / 2);
      setRadarPositionY(roomDepth / 2);
    } else {
      // Wall: center radar on X axis, Y is always 0
      setRadarPositionX(roomWidth / 2);
      setRadarPositionY(0);
    }
  }, [radarMounting]);
  
  // Update config when positions change
  const updateConfig = useCallback(() => {
    if (!onConfigChange) return;
    
    // Detection zone relative to radar
    // xMin and yMin are always NEGATIVE
    let newXMin, newXMax, newYMin, newYMax;
    
    if (isCeiling) {
      // Ceiling: radar is at center, detection extends in all directions
      newXMin = -radarPositionX;
      newXMax = roomWidth - radarPositionX;
      newYMin = -radarPositionY;
      newYMax = roomDepth - radarPositionY;
    } else {
      // Wall: radar on top wall, Y is always positive from radar
      newXMin = -radarPositionX;
      newXMax = roomWidth - radarPositionX;
      newYMin = -0.3; // Small negative for near-wall detection
      newYMax = roomDepth - 0.3;
    }
    
    // Bed subregion relative to radar
    const bedXMin = bedPosition.x - radarPositionX;
    const bedXMax = bedXMin + bedSize.width;
    const bedYMin = isCeiling 
      ? bedPosition.y - radarPositionY
      : bedPosition.y;
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
  }, [config, onConfigChange, roomWidth, roomDepth, radarPositionX, radarPositionY, bedPosition, bedSize, isCeiling]);
  
  // Debounced update
  useEffect(() => {
    const timer = setTimeout(updateConfig, 200);
    return () => clearTimeout(timer);
  }, [radarPositionX, radarPositionY, bedPosition, bedSize, roomWidth, roomDepth]);
  
  // Check if room exceeds max dimensions
  const isRoomTooLarge = roomWidth > MAX_ROOM_SIZE || roomDepth > MAX_ROOM_SIZE;
  
  // Handle radar movement
  const handleRadarMove = (newX, newY) => {
    setRadarPositionX(newX);
    if (isCeiling) {
      setRadarPositionY(newY);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Warning for oversized room */}
      {isRoomTooLarge && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Dimensions dépassées</p>
            <p className="text-amber-600 dark:text-amber-500">
              La taille maximale recommandée est {MAX_ROOM_SIZE}m × {MAX_ROOM_SIZE}m
            </p>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
        
        <TabsContent value="visual" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4" style={{ minHeight: '600px' }}>
            {/* Settings Panel */}
            <Card className="xl:col-span-1 h-fit xl:h-[600px] overflow-auto">
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
                    Dimensions pièce (max {MAX_ROOM_SIZE}m)
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
                      max={MAX_ROOM_SIZE}
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
                      max={MAX_ROOM_SIZE}
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
                  </div>
                  {isCeiling && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Position Y</Label>
                        <span className="text-sm font-mono font-medium">{radarPositionY.toFixed(2)}m</span>
                      </div>
                      <Slider
                        value={[radarPositionY]}
                        onValueChange={([v]) => setRadarPositionY(v)}
                        min={0.3}
                        max={roomDepth - 0.3}
                        step={0.05}
                      />
                    </div>
                  )}
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
                      if (isCeiling) {
                        setRadarPositionX(roomWidth / 2);
                        setRadarPositionY(roomDepth / 2);
                      } else {
                        setRadarPositionX(roomWidth / 2);
                      }
                      setBedPosition({ x: (roomWidth - bedSize.width) / 2, y: isCeiling ? 1.0 : 1.5 });
                      setBedSize({ width: 0.9, length: 2.0 });
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-2" />
                    Réinitialiser
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Visual Canvas - Same height as config panel */}
            <div className="xl:col-span-3 h-[600px]">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Vue de dessus de la chambre</CardTitle>
                      <CardDescription className="text-xs">
                        {isCeiling 
                          ? 'Glissez le radar librement et le lit dans la zone de détection'
                          : 'Glissez le radar horizontalement et le lit dans la zone de détection'
                        }
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={isRoomTooLarge ? 'border-amber-500 text-amber-500' : ''}>
                      {roomWidth.toFixed(1)}m × {roomDepth.toFixed(1)}m
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center overflow-auto pb-4">
                  <RoomCanvas
                    roomWidth={roomWidth}
                    roomDepth={roomDepth}
                    radarPositionX={radarPositionX}
                    radarPositionY={radarPositionY}
                    radarMounting={radarMounting}
                    radarHeight={radarHeight}
                    bedPosition={bedPosition}
                    bedSize={bedSize}
                    xMin={isCeiling ? -radarPositionX : -radarPositionX}
                    xMax={isCeiling ? (roomWidth - radarPositionX) : (roomWidth - radarPositionX)}
                    yMin={isCeiling ? -radarPositionY : -0.3}
                    yMax={isCeiling ? (roomDepth - radarPositionY) : (roomDepth - 0.3)}
                    onRadarMove={handleRadarMove}
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
        </TabsContent>
        
        <TabsContent value="params" className="mt-4">
          <CalculatedParamsTab 
            config={config} 
            radarHeight={radarHeight} 
            mountConfig={mountConfig} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RoomVisualEditor;
