/**
 * useTargetPositions - positions en temps réel des personnes suivies par un radar
 *
 * Charge la géométrie de la pièce + la dernière position connue, puis s'abonne
 * aux messages Socket.IO target_positions du radar tant que le composant est monté.
 */
import { useEffect, useId, useState } from 'react';
import api from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';

export function useTargetPositions(sensorId) {
  const { subscribe, watchSensor, connected } = useWebSocket();
  const [geometry, setGeometry] = useState(null);
  const [positions, setPositions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const listenerId = `target-positions-${useId()}`;

  useEffect(() => {
    if (!sensorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get(`/sensors/${sensorId}/live-positions`)
      .then((res) => {
        if (cancelled) return;
        setGeometry(res.data.geometry);
        // Ne pas écraser une position reçue en temps réel pendant le chargement
        setPositions((current) => current || res.data.positions);
      })
      .catch((e) => {
        if (!cancelled) setError(e.response?.data?.detail || 'Impossible de charger la vue en direct');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = subscribe(listenerId, (message) => {
      if (message.type === 'target_positions' && message.sensor_id === sensorId) {
        setPositions(message);
      }
    });
    const unwatch = watchSensor(sensorId);

    return () => {
      cancelled = true;
      unsubscribe();
      unwatch();
      setPositions(null);
    };
  }, [sensorId, listenerId, subscribe, watchSensor]);

  return { geometry, positions, loading, error, connected };
}
