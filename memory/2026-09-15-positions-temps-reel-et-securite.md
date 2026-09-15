# Session du 15/09/2026 — Positions temps réel, alertes, sécurité Socket.IO

Branche de travail : `claude/analyze-project-create-md-t7xlY` (GitHub `raoufmedjdoub-netizen/Ohmguard`).
Aucun des changements ci-dessous n'a été exécuté ni testé sur le poste de développement
(ni Python ni Node installés) : tout a été relu, pas lancé. **La checklist de vérification en fin
de document est à dérouler sur un environnement de test avant toute fusion dans `Production`.**

## 1. État des branches (constaté en début de session)

| Branche | Dernier commit | Position |
|---|---|---|
| `Production` (branche par défaut, déployée) | 12/02/2026, agent Emergent | référence |
| `claude/analyze-project-create-md-t7xlY` | 18/06/2026 | 82 commits d'avance, 0 de retard |
| `claude/fix-radar-assignment` | 17/06/2026 | incluse dans la précédente |
| `claude/connect-to-repo-R4Lf7` | 07/05/2026 | incluse dans la précédente |
| `main`, `main-2`, `conflict_240126_0027` | janvier 2026 | anciennes branches Emergent, 700+ commits de retard |

Conclusion : **`Production` a 7 mois de retard** sur le travail réel (sécurité, isolation multi-tenant,
RBAC, mobile, historique…). `claude/analyze-project-create-md-t7xlY` contient tout et se fusionne en
fast-forward. Avant fusion : relire les endpoints de debug ajoutés en avril (`fix(debug)`,
« endpoint diagnostic »), retirer `email_preview.html` de la racine.

Remarque sur l'historique Emergent : 1 191 commits sur 1 198 sont des « auto-commit » sans message ;
le `.gitignore` avait le bloc `.env` recopié plus de 60 fois avec des lignes parasites `-e`.

## 2. Commits de la session

### `a22785c` — fix(alerts) : filtre IA, alertes ACK, .gitignore
- `frontend/src/contexts/AlertContext.js` : seules les alertes IA **critiques** entrent dans le fil
  (`Fall_Detected`, `fall`, `Violence_Detected`, `Violence`, `Fire`, `Smoke`, `Intrusion`), au chargement
  et en temps réel. `Person_Detected`, `Normal_Activity`, `Loitering`, `Incivilité` sont exclus.
  Les deux jeux de noms coexistent parce que `seedoo_mqtt_service.py` et `mqtt_service.py` ne
  nomment pas les types de la même façon.
- Les alertes acquittées (`ACK` / `ACKNOWLEDGED`) sont rechargées au démarrage et **restent dans le fil**
  (grisées) jusqu'à résolution ou fausse alerte, y compris en action groupée (`LivePage.js`).
- `.gitignore` réécrit proprement.

### `efd0d05` — feat(live) : positions temps réel + sécurisation Socket.IO
Voir sections 3 et 4.

### `24616e7` — feat(config) : positions en direct dans l'onglet Visuel de la page capteurs
Voir section 3.4.

## 3. Positions temps réel des personnes dans les chambres

### 3.1 Ce que le radar envoie (analyse du code)
- Topics MQTT écoutés (`backend/mqtt_service.py`) : `/devices/{id}/state`, `/devices/{id}/events`, `/seedoo/#`.
- Événements : `{ "type": <code>, "payload": {...} }` avec `4` = PRESENCE, `5` = FALL, `8` = SENSITIVE_FALL,
  `10` = BED_EXIT.
- Les chutes (5, 8) portent déjà `fallLocX_cm / fallLocY_cm / fallLocZ_cm` (repère radar, centimètres).
- Les messages de présence (4) portent `trackerTargets`, liste des personnes détectées. **Le backend
  n'en gardait que le nombre.** Le format d'une personne n'est décrit nulle part dans le code actuel ;
  deux sources concordantes (ancien code `_determine_event_type` et un simulateur supprimé,
  commits `baa80bf`/`fcaffb3`) donnent :
  ```json
  { "id": 1, "xPosCm": -40, "yPosCm": 180, "zPosCm": 95, "posture": 0, "amplitude": 72 }
  ```
  Postures supposées : 0 debout, 1 assis, 2 allongé, 3 en chute. **À confirmer sur un vrai radar**
  (voir checklist). Coordonnées en cm dans le repère radar (0,0), configuration de la pièce en mètres.

### 3.2 Backend
- **`backend/live_positions_service.py`** (nouveau)
  - `extract_targets()` : accepte `xPosCm | xPos_cm | xPos | posX | x` (idem y, z) ; unité cm si le nom
    finit par « cm » ou si une valeur dépasse 10, sinon mètres ; sortie en mètres avec `id`, `posture`,
    `posture_label`, `amplitude`.
  - `LivePositionsService.publish()` : garde la dernière position par radar en mémoire (pas de base de
    données, un seul processus uvicorn) et limite la diffusion à **1 message / 0,5 s par radar**, la
    dernière position partant toujours.
  - `log_raw_sample()` : **journal temporaire** `TRACKER TARGET sample from <device>` (1 fois / 10 min
    par radar) qui écrit une personne brute complète. À retirer une fois le format confirmé.
- `backend/mqtt_service.py` : appel dans le traitement du type 4, **pour tout radar connu, affecté ou
  non** (la page de configuration sert à régler un radar neuf).
- `backend/socketio_service.py` : événements `watch_sensor` / `unwatch_sensor`, canal `sensor_{id}`,
  message `target_positions` émis uniquement dans ce canal. Droits : mêmes canaux que `presence_update` ;
  un radar sans bâtiment est visible par son organisation.
- `backend/server.py` : `GET /sensors/{id}/live-positions` → géométrie de la pièce (dernière config
  `ACKED`, sinon dernière envoyée, sinon défauts `WalabotConfig`) + dernière position connue. Accès via
  `check_building_access`.

### 3.3 Frontend
- `frontend/src/contexts/WebSocketContext.js` : `watchSensor(sensorId)` (compteur d'abonnés par radar,
  réabonnement automatique après reconnexion), écoute de `target_positions`.
- `frontend/src/hooks/useTargetPositions.js` : chargement initial + mises à jour temps réel.
- `frontend/src/components/live/LiveRoomView.jsx` : vue de dessus SVG (pièce, grille 1 m, zones
  lit/porte, radar, personnes colorées par posture, marqueur ✕ du lieu de chute).
  Utilisé dans :
  - `RoomDetailPage.js` : onglet **« En direct »** (un panneau par radar affecté à la chambre) ;
  - `EventDetailPage.js` : carte **« Chambre en direct »** avec le lieu de la chute.

### 3.4 Page capteurs, onglet Visuel (`/capteurs/:id/config`)
- `RadarConfigPage.js` passe `sensorId={deviceId}` (le paramètre de route est l'id du capteur).
- `RoomVisualEditor.jsx` : interrupteur **« Direct »** (vue normale et plein écran), badge
  « N personne(s) » avec état de connexion et heure de mise à jour.
- `RoomCanvas` : prop `liveTargets`, personnes dessinées à `radarScreenPos + (x, y) × 100 px`,
  coordonnées `x, y, z` affichées sous chaque point quand « Coords » est actif. Comme les positions
  sont relatives au radar, elles restent justes si l'utilisateur déplace le radar dans l'éditeur.

## 4. Sécurité Socket.IO (`join_rooms`) — faille corrigée
- **Avant** : le serveur prenait le `tenant_id` **envoyé par le navigateur** pour choisir les canaux.
  Tout utilisateur connecté pouvait écouter alertes, présences et statuts d'une autre organisation.
  Le jeton n'était vérifié que par sa signature (sessions révoquées acceptées) et un **secret JWT par
  défaut** existait dans `socketio_service.py`.
- **Après** : `_authenticate()` applique les règles de `get_current_user` (signature + session `jti`
  active + utilisateur en base) ; rôle et tenant viennent de la base ; le `tenant_id` client est
  ignoré et journalisé s'il diffère ; plus de secret par défaut ; base réutilisée au lieu d'une
  connexion Mongo par `join` ; anciens canaux quittés lors d'un re-join.
- Client web : n'envoie plus que `{ token }`. Client mobile : envoyait déjà `{ token }` seul, ce que
  l'ancien serveur **refusait** — le temps réel mobile devrait donc refonctionner.

## 5. Configuration du poste
- Identité Git configurée globalement (`user.name` Raouf Medjdoub, `user.email` raouf.medjdoub@gmail.com).
- Le push depuis la session Claude fonctionne ; les commits créés par VS Code fonctionnent aussi.

## 6. Checklist de vérification (environnement de test)
1. Le backend démarre (`JWT_SECRET` défini, imports `live_positions_service`).
2. Journal `TRACKER TARGET sample` : noms de champs, unités, code de posture réels.
3. Page capteurs → onglet Visuel : le point suit une personne qui marche.
   - Gauche/droite inversés ou Y dans le mauvais sens → une ligne dans `RoomCanvas`
     (`radarScreenPos.x + mToPixels(target.x)`).
   - Points hors de la pièce (×100) → détection cm/m dans `live_positions_service.py`.
4. Fiche chambre → onglet « En direct », et détail d'une alerte chute (marqueur ✕).
5. Fil d'alertes Live : une alerte acquittée reste visible grisée ; `Person_Detected` n'apparaît plus.
6. App mobile : réception des alertes temps réel après connexion.
7. Un utilisateur d'une organisation A ne reçoit aucun événement de l'organisation B.

## 7. Points ouverts / suite
- **Ajuster la vue pour les coordonnées** (demande en cours) : panneau latéral avec X/Y/Z par personne,
  vérification de l'orientation, représentation de Z (vue de dessus).
- Retirer `log_raw_sample()` une fois le format confirmé ; figer les noms de champs.
- RGPD : tous les rôles voyant une chambre voient les positions (y compris `VIEWER`) ; décider si
  l'affichage doit être restreint. Rien n'est enregistré en base.
- `FloorPlanPage.js` ouvre sa propre connexion Socket.IO sans rejoindre de canal : la page ne reçoit
  aucun événement. À faire passer par `WebSocketContext`.
- Unifier `LiveRoomView` et `RoomCanvas` (un seul dessin) après validation sur radar réel.
- Fusionner la branche dans `Production` après revue des endpoints de debug.
