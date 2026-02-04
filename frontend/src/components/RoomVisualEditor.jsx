/**
 * RoomVisualEditor - Éditeur visuel de configuration de chambre pour radars
 * Permet de positionner le radar et le lit de manière interactive
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
  EyeOff,
  Move,
  Maximize2,
  RotateCcw,
  Info
} from 'lucide-react';

// Constants
const GRID_SIZE = 20; // pixels per 10cm
const ROOM_PADDING = 50;
const MIN_ROOM_SIZE = 2;
const MAX_ROOM_WIDTH = 8;
const MAX_ROOM_DEPTH = 10;

// Mounting options
const MOUNTING_OPTIONS = [
  { value: 'Wall', label: 'Mural', description: 'Fixé sur le mur' },
  { value: 'Ceiling', label: 'Plafond', description: 'Fixé au plafond' },
  { value: 'Corner', label: 'Coin', description: 'Fixé dans un coin' }
];

/**
 * SVG Room Canvas Component
 */
function RoomCanvas({
  roomWidth,
  roomDepth,
  radarPosition,
  radarMounting,
  radarHeight,
  bedPosition,
  bedSize,
  detectionZone,
  onRadarMove,
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
  const mToPixels = (m) => m * GRID_SIZE * 10;
  const pixelsToM = (px) => px / (GRID_SIZE * 10);
  
  // Canvas dimensions
  const canvasWidth = mToPixels(roomWidth) + ROOM_PADDING * 2;
  const canvasHeight = mToPixels(roomDepth) + ROOM_PADDING * 2;
  
  // Room rectangle
  const roomRect = {
    x: ROOM_PADDING,
    y: ROOM_PADDING,
    width: mToPixels(roomWidth),
    height: mToPixels(roomDepth)
  };
  
  // Radar screen position
  const getRadarScreenPos = () => {
    if (radarMounting === 'Ceiling') {
      return {
        x: roomRect.x + mToPixels(radarPosition.x),
        y: roomRect.y + mToPixels(radarPosition.y)
      };
    }
    // Wall mount - on top wall
    return {
      x: roomRect.x + mToPixels(radarPosition.x),
      y: roomRect.y
    };
  };
  
  const radarScreenPos = getRadarScreenPos();
  
  // Bed screen position
  const bedScreenPos = {
    x: roomRect.x + mToPixels(bedPosition.x),
    y: roomRect.y + mToPixels(bedPosition.y),
    width: mToPixels(bedSize.width),
    height: mToPixels(bedSize.length)
  };
  
  // Detection zone rectangle (relative to radar)
  const getDetectionZoneRect = () => {
    if (!showDetectionZone || !detectionZone) return null;
    
    const { xMin, xMax, yMin, yMax } = detectionZone;
    return {
      x: radarScreenPos.x + mToPixels(xMin),
      y: radarScreenPos.y + mToPixels(yMin),
      width: mToPixels(xMax - xMin),
      height: mToPixels(yMax - yMin)
    };
  };
  
  const detectionRect = getDetectionZoneRect();
  
  // Calculate distance from radar to bed center
  const calculateDistance = () => {
    const bedCenterX = bedPosition.x + bedSize.width / 2;
    const bedCenterY = bedPosition.y + bedSize.length / 2;
    const radarX = radarPosition.x;
    const radarY = radarMounting === 'Ceiling' ? radarPosition.y : 0;
    
    const dx = bedCenterX - radarX;
    const dy = bedCenterY - radarY;
    return Math.sqrt(dx * dx + dy * dy);
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
      let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
      let newY = pixelsToM(svgP.y - dragOffset.y - roomRect.y);
      
      // Constrain
      newX = Math.max(0.1, Math.min(roomWidth - 0.1, newX));
      if (radarMounting === 'Wall') {
        newY = 0;
      } else {
        newY = Math.max(0.1, Math.min(roomDepth - 0.1, newY));
      }
      
      onRadarMove?.({ x: newX, y: newY });
    } else if (dragging === 'bed') {
      let newX = pixelsToM(svgP.x - dragOffset.x - roomRect.x);
      let newY = pixelsToM(svgP.y - dragOffset.y - roomRect.y);
      
      newX = Math.max(0, Math.min(roomWidth - bedSize.width, newX));
      newY = Math.max(0, Math.min(roomDepth - bedSize.length, newY));
      
      onBedMove?.({ x: newX, y: newY });
    } else if (dragging === 'bed-resize') {
      const newWidth = pixelsToM(svgP.x - bedScreenPos.x);
      const newLength = pixelsToM(svgP.y - bedScreenPos.y);
      
      onBedResize?.({
        width: Math.max(0.6, Math.min(2.5, newWidth)),
        length: Math.max(1.0, Math.min(2.5, newLength))
      });
    }
  };
  
  const handleMouseUp = () => {
    setDragging(null);
  };
  
  const distance = calculateDistance();

  return (
    <div className="relative inline-block">
      <svg
        ref={svgRef}
        width={canvasWidth}
        height={canvasHeight}
        className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-slate-200 dark:border-slate-700"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid */}
        {showGrid && (
          <g className="opacity-20">
            {/* Vertical lines every 10cm */}
            {Array.from({ length: Math.ceil(roomWidth * 10) + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={roomRect.x + i * GRID_SIZE}
                y1={roomRect.y}
                x2={roomRect.x + i * GRID_SIZE}
                y2={roomRect.y + roomRect.height}
                stroke="currentColor"
                strokeWidth={i % 10 === 0 ? 1.5 : 0.5}
              />
            ))}
            {/* Horizontal lines every 10cm */}
            {Array.from({ length: Math.ceil(roomDepth * 10) + 1 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1={roomRect.x}
                y1={roomRect.y + i * GRID_SIZE}
                x2={roomRect.x + roomRect.width}
                y2={roomRect.y + i * GRID_SIZE}
                stroke="currentColor"
                strokeWidth={i % 10 === 0 ? 1.5 : 0.5}
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
          stroke="#475569"
          strokeWidth={4}
        />
        
        {/* Room dimension labels */}
        <text
          x={roomRect.x + roomRect.width / 2}
          y={roomRect.y - 15}
          textAnchor="middle"
          className="fill-slate-600 dark:fill-slate-400 text-sm font-semibold"
        >
          {roomWidth.toFixed(1)} m
        </text>
        <text
          x={roomRect.x - 15}
          y={roomRect.y + roomRect.height / 2}
          textAnchor="middle"
          transform={`rotate(-90, ${roomRect.x - 15}, ${roomRect.y + roomRect.height / 2})`}
          className="fill-slate-600 dark:fill-slate-400 text-sm font-semibold"
        >
          {roomDepth.toFixed(1)} m
        </text>
        
        {/* Detection zone */}
        {detectionRect && (
          <g>
            <rect
              x={detectionRect.x}
              y={detectionRect.y}
              width={detectionRect.width}
              height={detectionRect.height}
              fill="rgba(34, 197, 94, 0.1)"
              stroke="rgba(34, 197, 94, 0.6)"
              strokeWidth={2}
              strokeDasharray="8,4"
              className="pointer-events-none"
            />
            <text
              x={detectionRect.x + detectionRect.width / 2}
              y={detectionRect.y + detectionRect.height - 10}
              textAnchor="middle"
              className="fill-green-600 text-xs font-medium pointer-events-none"
            >
              Zone de détection
            </text>
          </g>
        )}
        
        {/* Bed */}
        <g
          className={cn('cursor-move', dragging === 'bed' && 'opacity-70')}
          onMouseDown={(e) => handleMouseDown(e, 'bed')}
        >
          {/* Bed shadow */}
          <rect
            x={bedScreenPos.x + 3}
            y={bedScreenPos.y + 3}
            width={bedScreenPos.width}
            height={bedScreenPos.height}
            rx={8}
            fill="rgba(0,0,0,0.1)"
          />
          {/* Bed body */}
          <rect
            x={bedScreenPos.x}
            y={bedScreenPos.y}
            width={bedScreenPos.width}
            height={bedScreenPos.height}
            rx={8}
            fill="#3b82f6"
            fillOpacity={0.25}
            stroke="#3b82f6"
            strokeWidth={3}
          />
          {/* Pillow */}
          <rect
            x={bedScreenPos.x + 8}
            y={bedScreenPos.y + 8}
            width={bedScreenPos.width - 16}
            height={35}
            rx={6}
            fill="#3b82f6"
            fillOpacity={0.4}
          />
          {/* Bed icon */}
          <g transform={`translate(${bedScreenPos.x + bedScreenPos.width / 2 - 12}, ${bedScreenPos.y + bedScreenPos.height / 2 - 5})`}>
            <Bed className="w-6 h-6 text-blue-600" />
          </g>
          {/* Bed label */}
          <text
            x={bedScreenPos.x + bedScreenPos.width / 2}
            y={bedScreenPos.y + bedScreenPos.height / 2 + 25}
            textAnchor="middle"
            className="fill-blue-700 dark:fill-blue-400 text-sm font-bold pointer-events-none"
          >
            LIT
          </text>
          {/* Bed dimensions */}
          <text
            x={bedScreenPos.x + bedScreenPos.width / 2}
            y={bedScreenPos.y + bedScreenPos.height + 18}
            textAnchor="middle"
            className="fill-blue-600 text-xs font-medium pointer-events-none"
          >
            {bedSize.width.toFixed(2)} × {bedSize.length.toFixed(2)} m
          </text>
          {/* Resize handle */}
          <circle
            cx={bedScreenPos.x + bedScreenPos.width}
            cy={bedScreenPos.y + bedScreenPos.height}
            r={10}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            className="cursor-se-resize"
            onMouseDown={(e) => handleMouseDown(e, 'bed-resize')}
          />
        </g>
        
        {/* Radar */}
        <g
          className={cn('cursor-move', dragging === 'radar' && 'opacity-70')}
          onMouseDown={(e) => handleMouseDown(e, 'radar')}
        >
          {/* Detection cone (for wall mount) */}
          {radarMounting === 'Wall' && (
            <path
              d={`M ${radarScreenPos.x} ${radarScreenPos.y}
                  L ${radarScreenPos.x - mToPixels(detectionZone?.xMin ? Math.abs(detectionZone.xMin) : 1.5)} ${radarScreenPos.y + mToPixels(detectionZone?.yMax || 3)}
                  L ${radarScreenPos.x + mToPixels(detectionZone?.xMax || 1.5)} ${radarScreenPos.y + mToPixels(detectionZone?.yMax || 3)}
                  Z`}
              fill="rgba(239, 68, 68, 0.08)"
              stroke="rgba(239, 68, 68, 0.3)"
              strokeWidth={1}
              className="pointer-events-none"
            />
          )}
          {/* Radar circle */}
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={18}
            fill="#ef4444"
            stroke="white"
            strokeWidth={3}
          />
          {/* Radar inner */}
          <circle
            cx={radarScreenPos.x}
            cy={radarScreenPos.y}
            r={7}
            fill="white"
          />
          {/* Radar waves */}
          {[24, 32, 40].map((r, i) => (
            <circle
              key={i}
              cx={radarScreenPos.x}
              cy={radarScreenPos.y}
              r={r}
              fill="none"
              stroke="rgba(239, 68, 68, 0.3)"
              strokeWidth={1}
              strokeDasharray="4,4"
              className="pointer-events-none"
            />
          ))}
          {/* Radar label */}
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y - 30}
            textAnchor="middle"
            className="fill-red-600 text-xs font-bold pointer-events-none"
          >
            RADAR ({radarMounting})
          </text>
          <text
            x={radarScreenPos.x}
            y={radarScreenPos.y - 18}
            textAnchor="middle"
            className="fill-red-500 text-[10px] pointer-events-none"
          >
            H: {radarHeight?.toFixed(2) || '1.50'} m
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
            {/* Distance label background */}
            <rect
              x={(radarScreenPos.x + bedScreenPos.x + bedScreenPos.width / 2) / 2 - 35}
              y={(radarScreenPos.y + bedScreenPos.y + bedScreenPos.height / 2) / 2 - 12}
              width={70}
              height={24}
              rx={4}
              fill="white"
              className="dark:fill-slate-800"
              stroke="#f59e0b"
              strokeWidth={1}
            />
            <text
              x={(radarScreenPos.x + bedScreenPos.x + bedScreenPos.width / 2) / 2}
              y={(radarScreenPos.y + bedScreenPos.y + bedScreenPos.height / 2) / 2 + 5}
              textAnchor="middle"
              className="fill-amber-600 text-sm font-bold"
            >
              {distance.toFixed(2)} m
            </text>
          </g>
        )}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-3 rounded-lg border shadow-sm">
        <p className="text-xs font-semibold mb-2 text-muted-foreground">Légende</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span>Radar (glissez pour déplacer)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/40 border-2 border-blue-500" />
            <span>Lit (glissez + redimensionnez)</span>
          </div>
          {showDetectionZone && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500/20 border border-dashed border-green-500" />
              <span>Zone de détection</span>
            </div>
          )}
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
  const [roomDepth, setRoomDepth] = useState(5.0);
  
  // Radar position (in meters from room origin)
  const [radarPosition, setRadarPosition] = useState({ x: 2.0, y: 0 });
  
  // Bed position and size
  const [bedPosition, setBedPosition] = useState({ x: 0.5, y: 1.5 });
  const [bedSize, setBedSize] = useState({ width: 1.0, length: 2.0 });
  
  // Display options
  const [showGrid, setShowGrid] = useState(true);
  const [showDetectionZone, setShowDetectionZone] = useState(true);
  const [showDistances, setShowDistances] = useState(true);
  
  // Initialize from config
  useEffect(() => {
    if (!config?.walabotConfig) return;
    
    const wc = config.walabotConfig;
    
    // Calculate room size from detection zone
    if (wc.xMax !== undefined && wc.xMin !== undefined) {
      const width = Math.abs(wc.xMin) + Math.abs(wc.xMax);
      setRoomWidth(Math.max(MIN_ROOM_SIZE, Math.min(MAX_ROOM_WIDTH, width)));
      setRadarPosition(prev => ({ ...prev, x: Math.abs(wc.xMin) }));
    }
    if (wc.yMax !== undefined) {
      setRoomDepth(Math.max(MIN_ROOM_SIZE, Math.min(MAX_ROOM_DEPTH, wc.yMax)));
    }
    
    // Extract bed from subregions
    const bedRegion = wc.trackerSubRegions?.find(r => 
      r.name?.toLowerCase().includes('lit') || 
      r.name?.toLowerCase().includes('bed') ||
      r.isFallingDetection
    );
    
    if (bedRegion) {
      const bedX = bedRegion.xMin + Math.abs(wc.xMin || 0);
      setBedPosition({
        x: Math.max(0, bedX),
        y: Math.max(0, bedRegion.yMin || 1)
      });
      setBedSize({
        width: Math.max(0.6, bedRegion.xMax - bedRegion.xMin),
        length: Math.max(1.0, bedRegion.yMax - bedRegion.yMin)
      });
    }
  }, []);
  
  // Update config when positions change
  const updateConfig = useCallback(() => {
    if (!onConfigChange) return;
    
    // Calculate detection zone (relative to radar)
    const xMin = -radarPosition.x;
    const xMax = roomWidth - radarPosition.x;
    const yMin = 0.3;
    const yMax = roomDepth;
    
    // Create bed subregion (relative to radar)
    const bedXMin = bedPosition.x - radarPosition.x;
    const bedXMax = bedXMin + bedSize.width;
    const bedYMin = bedPosition.y;
    const bedYMax = bedYMin + bedSize.length;
    
    const bedSubRegion = {
      xMin: parseFloat(bedXMin.toFixed(2)),
      xMax: parseFloat(bedXMax.toFixed(2)),
      yMin: parseFloat(bedYMin.toFixed(2)),
      yMax: parseFloat(bedYMax.toFixed(2)),
      zMin: 0,
      zMax: config?.walabotConfig?.zMax || 1.8,
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
        xMin: parseFloat(xMin.toFixed(2)),
        xMax: parseFloat(xMax.toFixed(2)),
        yMin: parseFloat(yMin.toFixed(2)),
        yMax: parseFloat(yMax.toFixed(2)),
        trackerSubRegions: [bedSubRegion]
      }
    });
  }, [config, onConfigChange, roomWidth, roomDepth, radarPosition, bedPosition, bedSize]);
  
  // Debounced update
  useEffect(() => {
    const timer = setTimeout(updateConfig, 200);
    return () => clearTimeout(timer);
  }, [radarPosition, bedPosition, bedSize, roomWidth, roomDepth]);
  
  // Current detection zone for display
  const detectionZone = {
    xMin: config?.walabotConfig?.xMin ?? -radarPosition.x,
    xMax: config?.walabotConfig?.xMax ?? (roomWidth - radarPosition.x),
    yMin: config?.walabotConfig?.yMin ?? 0.3,
    yMax: config?.walabotConfig?.yMax ?? roomDepth
  };
  
  const radarMounting = config?.walabotConfig?.sensorMounting || 'Wall';
  const radarHeight = config?.walabotConfig?.sensorHeight || 1.5;
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Room Dimensions */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dimensions chambre
              </Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Largeur</Label>
                  <span className="text-sm font-mono font-medium">{roomWidth.toFixed(1)} m</span>
                </div>
                <Slider
                  value={[roomWidth]}
                  onValueChange={([v]) => setRoomWidth(v)}
                  min={MIN_ROOM_SIZE}
                  max={MAX_ROOM_WIDTH}
                  step={0.1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Profondeur</Label>
                  <span className="text-sm font-mono font-medium">{roomDepth.toFixed(1)} m</span>
                </div>
                <Slider
                  value={[roomDepth]}
                  onValueChange={([v]) => setRoomDepth(v)}
                  min={MIN_ROOM_SIZE}
                  max={MAX_ROOM_DEPTH}
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
                    walabotConfig: { ...config?.walabotConfig, sensorMounting: v }
                  })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOUNTING_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Hauteur</Label>
                  <span className="text-sm font-mono font-medium">{radarHeight.toFixed(2)} m</span>
                </div>
                <Slider
                  value={[radarHeight]}
                  onValueChange={([v]) => onConfigChange?.({
                    ...config,
                    walabotConfig: { ...config?.walabotConfig, sensorHeight: v }
                  })}
                  min={0.5}
                  max={3.0}
                  step={0.05}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Position X</Label>
                  <span className="text-sm font-mono font-medium">{radarPosition.x.toFixed(2)} m</span>
                </div>
                <Slider
                  value={[radarPosition.x]}
                  onValueChange={([v]) => setRadarPosition(p => ({ ...p, x: v }))}
                  min={0.1}
                  max={roomWidth - 0.1}
                  step={0.05}
                />
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
                    <Grid3X3 className="h-4 w-4" />
                    Grille
                  </Label>
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Zone détection
                  </Label>
                  <Switch checked={showDetectionZone} onCheckedChange={setShowDetectionZone} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Move className="h-4 w-4" />
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
                Lit (redimensionnable)
              </Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-muted rounded">
                  <span className="text-muted-foreground">Position:</span>
                  <p className="font-mono">{bedPosition.x.toFixed(2)}, {bedPosition.y.toFixed(2)} m</p>
                </div>
                <div className="p-2 bg-muted rounded">
                  <span className="text-muted-foreground">Taille:</span>
                  <p className="font-mono">{bedSize.width.toFixed(2)} × {bedSize.length.toFixed(2)} m</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Visual Canvas */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Plan de la chambre</CardTitle>
                <CardDescription>
                  Glissez les éléments pour ajuster les positions. Utilisez la poignée du lit pour redimensionner.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRadarPosition({ x: roomWidth / 2, y: 0 });
                  setBedPosition({ x: 0.5, y: 1.5 });
                  setBedSize({ width: 1.0, length: 2.0 });
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center overflow-auto py-4">
            <RoomCanvas
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              radarPosition={radarPosition}
              radarMounting={radarMounting}
              radarHeight={radarHeight}
              bedPosition={bedPosition}
              bedSize={bedSize}
              detectionZone={detectionZone}
              onRadarMove={setRadarPosition}
              onBedMove={setBedPosition}
              onBedResize={setBedSize}
              showGrid={showGrid}
              showDetectionZone={showDetectionZone}
              showDistances={showDistances}
            />
          </CardContent>
        </Card>
      </div>
      
      {/* Calculated Values Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Valeurs calculées (envoyées au radar)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">xMin</p>
              <p className="text-lg font-mono font-bold">{(config?.walabotConfig?.xMin ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">xMax</p>
              <p className="text-lg font-mono font-bold">{(config?.walabotConfig?.xMax ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">yMin</p>
              <p className="text-lg font-mono font-bold">{(config?.walabotConfig?.yMin ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">yMax</p>
              <p className="text-lg font-mono font-bold">{(config?.walabotConfig?.yMax ?? 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">Hauteur</p>
              <p className="text-lg font-mono font-bold">{radarHeight.toFixed(2)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-muted-foreground">Montage</p>
              <p className="text-lg font-bold">{radarMounting}</p>
            </div>
          </div>
          
          {/* Bed Region Info */}
          {config?.walabotConfig?.trackerSubRegions?.[0] && (
            <div className="mt-4 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Bed className="h-4 w-4" />
                Zone du lit (trackerSubRegion)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">X: </span>
                  <span className="font-mono font-medium">
                    {config.walabotConfig.trackerSubRegions[0].xMin?.toFixed(2)} → {config.walabotConfig.trackerSubRegions[0].xMax?.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Y: </span>
                  <span className="font-mono font-medium">
                    {config.walabotConfig.trackerSubRegions[0].yMin?.toFixed(2)} → {config.walabotConfig.trackerSubRegions[0].yMax?.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Chute: </span>
                  <Badge variant={config.walabotConfig.trackerSubRegions[0].isFallingDetection ? 'default' : 'secondary'} className="text-xs">
                    {config.walabotConfig.trackerSubRegions[0].isFallingDetection ? 'Activée' : 'Désactivée'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Présence: </span>
                  <Badge variant={config.walabotConfig.trackerSubRegions[0].isPresenceDetection ? 'default' : 'secondary'} className="text-xs">
                    {config.walabotConfig.trackerSubRegions[0].isPresenceDetection ? 'Activée' : 'Désactivée'}
                  </Badge>
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
