"""
Live Positions Service - affichage temps réel des personnes dans les chambres.

Extrait les coordonnées des trackerTargets des messages de présence Vayyar (type 4),
garde en mémoire la dernière position connue par radar et limite le débit des
diffusions Socket.IO (une diffusion au plus toutes les MIN_INTERVAL_SEC par radar,
la dernière position étant toujours envoyée).

Repère : celui du radar (0,0), en mètres, comme walabotConfig (xMin/xMax/yMin/yMax).
"""
import asyncio
import json
import logging
import math
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

MIN_INTERVAL_SEC = 0.5
SAMPLE_LOG_INTERVAL_SEC = 600

# Posture codes from trackerTargets
POSTURE_MAP = {
    0: "STANDING",
    1: "SITTING",
    2: "LYING",
    3: "FALLING",
}

# Noms de champs acceptés par axe (le premier trouvé est utilisé)
COORD_KEYS = {
    "x": ("xPosCm", "xPos_cm", "xPos", "posX", "x"),
    "y": ("yPosCm", "yPos_cm", "yPos", "posY", "y"),
    "z": ("zPosCm", "zPos_cm", "zPos", "posZ", "z"),
}

# Une arène Vayyar ne dépasse pas 5 m : une valeur > 10 ne peut pas être en mètres
MAX_METERS_VALUE = 10

BroadcastFn = Callable[[str, Dict[str, Any]], Awaitable[Any]]


def _read_coord(target: Dict[str, Any], axis: str):
    """Return (value, is_cm_named) for the first known key of this axis, or (None, False)."""
    for key in COORD_KEYS[axis]:
        if target.get(key) is None:
            continue
        try:
            value = float(target[key])
        except (TypeError, ValueError):
            return None, False
        if not math.isfinite(value):
            return None, False
        return value, key.lower().endswith("cm")
    return None, False


def extract_targets(tracker_targets: Any) -> List[Dict[str, Any]]:
    """
    Normalise trackerTargets en [{id, x, y, z, posture, posture_label, amplitude}] (mètres).

    Unité : centimètres si un nom de champ se termine par "cm" ou si une valeur dépasse
    MAX_METERS_VALUE, sinon mètres.
    """
    if not isinstance(tracker_targets, list):
        return []

    parsed = []
    for index, target in enumerate(tracker_targets):
        if not isinstance(target, dict):
            continue
        coords = {}
        cm_named = False
        for axis in ("x", "y", "z"):
            value, is_cm = _read_coord(target, axis)
            if value is not None:
                coords[axis] = value
                cm_named = cm_named or is_cm
        if "x" not in coords or "y" not in coords:
            continue
        parsed.append((index, target, coords, cm_named))

    if not parsed:
        return []

    in_cm = any(cm_named for _, _, _, cm_named in parsed) or any(
        abs(v) > MAX_METERS_VALUE for _, _, coords, _ in parsed for v in coords.values()
    )
    scale = 0.01 if in_cm else 1.0

    targets = []
    for index, target, coords, _ in parsed:
        posture = target.get("posture")
        targets.append({
            "id": target.get("id", index),
            "x": round(coords["x"] * scale, 3),
            "y": round(coords["y"] * scale, 3),
            "z": round(coords["z"] * scale, 3) if "z" in coords else None,
            "posture": posture,
            "posture_label": POSTURE_MAP.get(posture),
            "amplitude": target.get("amplitude"),
        })
    return targets


class LivePositionsService:
    """Dernières positions par radar + diffusion à débit limité."""

    def __init__(self, min_interval_sec: float = MIN_INTERVAL_SEC):
        self.min_interval_sec = min_interval_sec
        self._latest: Dict[str, Dict[str, Any]] = {}
        self._last_sent: Dict[str, float] = {}
        self._pending: Dict[str, asyncio.Task] = {}
        self._sample_logged_at: Dict[str, float] = {}

    def get_latest(self, sensor_id: str) -> Optional[Dict[str, Any]]:
        return self._latest.get(sensor_id)

    def log_raw_sample(self, device_id: str, tracker_targets: Any):
        """
        TEMPORAIRE : journalise un trackerTarget brut complet (1 fois / 10 min par radar)
        pour valider les noms de champs et unités réels du firmware.
        """
        if not isinstance(tracker_targets, list) or not tracker_targets:
            return
        now = time.monotonic()
        last = self._sample_logged_at.get(device_id)
        if last is not None and now - last < SAMPLE_LOG_INTERVAL_SEC:
            return
        self._sample_logged_at[device_id] = now
        logger.info(
            f"TRACKER TARGET sample from {device_id} ({len(tracker_targets)} target(s)): "
            f"{json.dumps(tracker_targets[0])}"
        )

    async def publish(self, sensor: Dict[str, Any], tracker_targets: Any,
                      presence_detected: bool, broadcast: Optional[BroadcastFn]):
        """Met à jour la dernière position du radar et la diffuse (débit limité)."""
        sensor_id = sensor["id"]
        self._latest[sensor_id] = {
            "type": "target_positions",
            "sensor_id": sensor_id,
            "client_id": sensor.get("client_id"),
            "building_id": sensor.get("building_id"),
            "floor_id": sensor.get("floor_id"),
            "room_id": sensor.get("room_id"),
            "presence_detected": presence_detected,
            "targets": extract_targets(tracker_targets) if presence_detected else [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if broadcast is None or sensor_id in self._pending:
            # Un envoi différé est déjà prévu : il partira avec cette dernière position
            return

        last = self._last_sent.get(sensor_id)
        wait = 0 if last is None else self.min_interval_sec - (time.monotonic() - last)
        if wait <= 0:
            await self._send(sensor_id, sensor["tenant_id"], broadcast)
        else:
            self._pending[sensor_id] = asyncio.create_task(
                self._send_later(sensor_id, sensor["tenant_id"], broadcast, wait)
            )

    async def _send_later(self, sensor_id: str, tenant_id: str, broadcast: BroadcastFn, wait: float):
        await asyncio.sleep(wait)
        self._pending.pop(sensor_id, None)
        await self._send(sensor_id, tenant_id, broadcast)

    async def _send(self, sensor_id: str, tenant_id: str, broadcast: BroadcastFn):
        self._last_sent[sensor_id] = time.monotonic()
        try:
            await broadcast(tenant_id, self._latest[sensor_id])
        except Exception as e:
            logger.warning(f"Failed to broadcast target positions for {sensor_id}: {e}")


_live_positions_service: Optional[LivePositionsService] = None


def get_live_positions_service() -> LivePositionsService:
    global _live_positions_service
    if _live_positions_service is None:
        _live_positions_service = LivePositionsService()
    return _live_positions_service
