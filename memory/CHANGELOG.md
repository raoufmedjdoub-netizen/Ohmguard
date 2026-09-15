# CHANGELOG - OhmGuard

## 2026-09-15

Détail complet : [2026-09-15-positions-temps-reel-et-securite.md](2026-09-15-positions-temps-reel-et-securite.md)

### Positions temps réel des personnes (trackerTargets)
- `live_positions_service.py` : extraction des coordonnées des messages de présence, dernière position par radar, diffusion limitée à 2/s
- Socket.IO `watch_sensor` / `unwatch_sensor`, canal `sensor_{id}`, message `target_positions`
- `GET /sensors/{id}/live-positions` (géométrie de la pièce + dernière position)
- `LiveRoomView` dans la fiche chambre (onglet « En direct ») et le détail d'événement ; personnes dessinées dans l'onglet Visuel de la page capteurs (interrupteur « Direct »)

### Sécurité Socket.IO
- `join_rooms` : tenant/rôle issus du jeton et de la base, session `jti` vérifiée, `tenant_id` client ignoré, plus de secret JWT par défaut

### Fil d'alertes
- Seules les alertes IA critiques entrent dans le fil ; les alertes acquittées restent visibles jusqu'à résolution
- `.gitignore` nettoyé

## 2026-02-11

### Seedoo Schema Alignment
- `warning_id` cast to integer per official JSON schema
- `seedoo_created_at` stored from Seedoo `created_at` field (separate from platform timestamp)
- `channel_name` used as fallback sensor identifier when `channel` from topic unavailable
- New `get_sensor_by_channel_name()` method in `ai_sensor_service.py`

### AI Alerts in GlobalAlertBanner + AlertContext
- AlertContext now loads critical AI events (Fall_Detected, Violence, Fire, Smoke, Intrusion) on mount
- GlobalAlertBanner displays AI alerts with violet badges, camera icon, confidence %, video link
- Per-user toggle in Settings to enable/disable the GlobalAlertBanner (`alert_banner_enabled`)
- Backend `GET/PUT /api/users/me/notifications` extended with `alert_banner_enabled`

### WebSocket AI Event Routing Fix (Critical Bug)
- **Root cause**: `socketio_broadcast` in `server.py` used `broadcast_new_event()` for AI events, which emitted Socket.IO event `'new_event'` instead of `'new_ai_event'`. Frontend treated AI events as radar events.
- **Fix**: Created `broadcast_ai_event()` in `socketio_service.py` that emits `'new_ai_event'`
- Added `socket.on('new_ai_event', ...)` listener in `WebSocketContext.js`

### LivePage "Fil d'alertes" Redesign
- Replaced card grid with vertical timeline feed ("au fil de l'eau")
- Combines radar + AI alerts chronologically with colored timeline dots
- Each item shows: type badge, location, coordinates, confidence, elapsed timer, inline actions
- Scrollable container (max-height: 420px) with count badges (radar/IA/en attente)
- AI-specific info: warning_type translated, confidence %, warning_text, video link button

### Cleanup
- Deleted obsolete `UsersPage.js` (replaced by SettingsPage tabs)
- Removed stale import in `App.js`
