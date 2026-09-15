/**
 * LiveRoomView - vue de dessus en temps réel des personnes détectées par un radar
 *
 * Repère Vayyar (mètres) : radar en (0,0), X = largeur, Y = profondeur (s'éloigne du radar).
 * Le SVG utilise ce repère via son viewBox, en centimètres : 1 unité = 1 cm.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTargetPositions } from '@/hooks/useTargetPositions';
import { Activity, AlertTriangle, Loader2, Wifi, WifiOff } from 'lucide-react';

const PADDING = 0.3;
const cm = (meters) => Math.round(meters * 100);

const POSTURES = {
  STANDING: { label: 'Debout', fill: '#16a34a' },
  SITTING: { label: 'Assis', fill: '#2563eb' },
  LYING: { label: 'Allongé', fill: '#ea580c' },
  FALLING: { label: 'Chute', fill: '#dc2626' },
};
const UNKNOWN_POSTURE = { label: 'Présence', fill: '#7c3aed' };

function useNow(intervalMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatAgo(timestamp, now) {
  if (!timestamp) return null;
  const sec = Math.max(0, Math.round((now - new Date(timestamp).getTime()) / 1000));
  if (sec < 5) return "à l'instant";
  if (sec < 60) return `il y a ${sec} s`;
  if (sec < 3600) return `il y a ${Math.floor(sec / 60)} min`;
  return `il y a ${Math.floor(sec / 3600)} h`;
}

function validSize(min, max, fallback) {
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? [min, max] : fallback;
}

/**
 * @param sensorId      radar à afficher
 * @param title         titre de la carte (défaut : nom du radar)
 * @param fallLocation  { x, y } en mètres, repère radar : marqueur du lieu de chute (optionnel)
 */
export function LiveRoomView({ sensorId, title, fallLocation, className }) {
  const { geometry, positions, loading, error, connected } = useTargetPositions(sensorId);
  const now = useNow(5000);

  if (loading && !geometry) {
    return (
      <Card className={className}>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {error}
        </CardContent>
      </Card>
    );
  }

  // Géométrie en mètres, dessin en centimètres (évite les textes SVG minuscules mal rendus)
  const [xMin, xMax] = validSize(geometry?.xMin, geometry?.xMax, [-2, 2]).map(cm);
  const [yMin, yMax] = validSize(geometry?.yMin, geometry?.yMax, [-2, 2]).map(cm);
  const width = xMax - xMin;
  const depth = yMax - yMin;
  const pad = cm(PADDING);
  const viewBox = `${xMin - pad} ${yMin - pad} ${width + pad * 2} ${depth + pad * 2}`;

  const targets = positions?.targets || [];
  const updatedAgo = formatAgo(positions?.timestamp, now);

  const gridX = [];
  for (let x = Math.ceil(xMin / 100) * 100; x <= xMax; x += 100) gridX.push(x);
  const gridY = [];
  for (let y = Math.ceil(yMin / 100) * 100; y <= yMax; y += 100) gridY.push(y);

  return (
    <Card className={className} data-testid={`live-room-view-${sensorId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Activity className="h-4 w-4" />
          {title || 'Vue en direct'}
          <Badge variant="outline" className={cn('ml-auto', targets.length > 0 ? 'border-green-500 text-green-600' : 'text-muted-foreground')}>
            {targets.length} personne{targets.length > 1 ? 's' : ''}
          </Badge>
          {connected
            ? <Wifi className="h-4 w-4 text-green-500" aria-label="Temps réel connecté" />
            : <WifiOff className="h-4 w-4 text-muted-foreground" aria-label="Temps réel déconnecté" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vue de dessus, radar en haut{updatedAgo ? ` · mis à jour ${updatedAgo}` : ' · en attente de données'}
        </p>
      </CardHeader>
      <CardContent>
        {geometry?.is_default && (
          <div className="mb-2 text-xs text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Aucune configuration radar enregistrée : dimensions de pièce par défaut.
          </div>
        )}

        <div className="w-full max-w-xl mx-auto">
          <svg viewBox={viewBox} className="w-full h-auto" role="img" aria-label="Positions en direct dans la pièce">
            {/* Pièce / zone de détection */}
            <rect x={xMin} y={yMin} width={width} height={depth} rx={5}
              className="fill-muted stroke-border" fillOpacity={0.5} strokeWidth={3} />

            {/* Grille 1 m */}
            {gridX.map((x) => (
              <line key={`gx${x}`} x1={x} y1={yMin} x2={x} y2={yMax} className="stroke-border" strokeWidth={1} strokeDasharray="5 5" />
            ))}
            {gridY.map((y) => (
              <line key={`gy${y}`} x1={xMin} y1={y} x2={xMax} y2={y} className="stroke-border" strokeWidth={1} strokeDasharray="5 5" />
            ))}

            {/* Zones configurées (lit, porte...) */}
            {(geometry?.subRegions || []).map((region, i) => {
              const [rx1, rx2] = validSize(region.xMin, region.xMax, [null, null]);
              const [ry1, ry2] = validSize(region.yMin, region.yMax, [null, null]);
              if (rx1 === null || ry1 === null) return null;
              return (
                <g key={`region${i}`}>
                  <rect x={cm(rx1)} y={cm(ry1)} width={cm(rx2 - rx1)} height={cm(ry2 - ry1)}
                    className={region.isDoor ? 'fill-amber-500 stroke-amber-500' : 'fill-sky-500 stroke-sky-500'}
                    fillOpacity={0.1} strokeWidth={2} strokeDasharray={region.isDoor ? '8 5' : undefined} />
                  {region.name && (
                    <text x={cm(rx1) + 5} y={cm(ry1) + 17} fontSize={13} className="fill-muted-foreground">{region.name}</text>
                  )}
                </g>
              );
            })}

            {/* Radar */}
            <rect x={-10} y={-6} width={20} height={12} rx={2} className="fill-foreground" />

            {/* Lieu de la chute */}
            {fallLocation && Number.isFinite(fallLocation.x) && Number.isFinite(fallLocation.y) && (
              <g transform={`translate(${cm(fallLocation.x)} ${cm(fallLocation.y)})`}>
                <circle r={22} fill="none" stroke="#dc2626" strokeWidth={3} strokeDasharray="6 4" />
                <path d="M -12 -12 L 12 12 M 12 -12 L -12 12" stroke="#dc2626" strokeWidth={4} />
              </g>
            )}

            {/* Personnes détectées */}
            {targets.map((target, i) => {
              const posture = POSTURES[target.posture_label] || UNKNOWN_POSTURE;
              return (
                <g
                  key={target.id ?? i}
                  style={{ transform: `translate(${cm(target.x)}px, ${cm(target.y)}px)`, transition: 'transform 0.45s ease-out' }}
                >
                  <circle r={26} fill={posture.fill} opacity={0.18} />
                  <circle r={14} fill={posture.fill} stroke="white" strokeWidth={3} />
                  <text y={-30} fontSize={14} textAnchor="middle" className="fill-foreground font-medium">
                    {posture.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {Object.values(POSTURES).map((p) => (
            <span key={p.label} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.fill }} />
              {p.label}
            </span>
          ))}
          {fallLocation && (
            <span className="flex items-center gap-1 text-red-600">✕ Lieu de la chute</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
