# OhmGuard - Product Requirements Document

## Original Problem Statement
Build OhmGuard - a SaaS platform for fall detection management using **Vayyar radar sensors exclusively**. The platform centralizes events from Vayyar radars installed in facilities (nursing homes, hospitals, airports).

## Technology Stack
- **Frontend:** React (JavaScript) + Tailwind CSS + shadcn/ui
- **Backend:** FastAPI (Python) + Motor (async MongoDB)
- **Database:** MongoDB + Redis (caching)
- **Real-time:** **Socket.IO** (`python-socketio` backend, `socket.io-client` frontend) + MQTT (aiomqtt)
- **Auth:** JWT + Refresh tokens
- **Push Notifications:** Expo Push API (mobile)
- **Theme:** Turquoise/Blue color scheme
- **Sensors:** Vayyar Radars only (MQTT integration)
- **Proxy:** Nginx (with WebSocket support)

## User Personas
1. **Super Admin** - Platform administrator with full access
2. **Tenant Admin** - Facility director managing their organization
3. **Supervisor** - Team lead overseeing operators
4. **Operator** - Staff handling alert acknowledgment/resolution
5. **Viewer** - Read-only access to dashboards

## What's Been Implemented (January 2026)

### Backend Features
- ✅ Complete REST API with 50+ endpoints
- ✅ JWT authentication with refresh tokens
- ✅ Multi-tenant data isolation
- ✅ WebSocket for real-time events (Socket.IO)
- ✅ Event deduplication logic (10s window)
- ✅ Alert rules engine with notifications
- ✅ Audit logging
- ✅ Device API (heartbeat, event ingestion)
- ✅ Seed script with demo data
- ✅ MQTT Service for Vayyar Radar integration
- ✅ Auto-registration of MQTT devices as sensors
- ✅ **Vayyar Config Service** - MQTT publish/subscribe for device configuration
- ✅ **Config versioning with rollback support**
- ✅ **ACK handling with timeout detection**
- ✅ **Radar Event Processing** (January 14, 2026)
  - POST /api/events/radar endpoint
  - RadarEventType enum (FALL, PRE_FALL, INACTIVITY, PRESENCE, UNKNOWN)
  - Payload normalization (presenceDetected, presenceRegionMap, trackerTargets)
  - Active regions extraction
  - Target count tracking
  - Epoch to ISO timestamp conversion
  - Raw payload storage for audit
- ✅ **Redis Cache** (January 30, 2026)
  - Event caching with automatic invalidation
  - Health check endpoints
  - Fail-graceful design (app works without Redis)
- ✅ **Push Notifications** (February 2026)
  - Expo Push API integration
  - Token management per user
  - Automatic fall alert notifications
- ✅ **Security Enhancements** (February 2026)
  - Multi-tenant access verification
  - RBAC permission checks on routes
  - Cascade delete for clients

### Frontend Features
- ✅ Login page with demo credentials
- ✅ Dashboard with real-time stats
- ✅ **Nouvelle structure de navigation (January 22, 2026)**
  - **Navbar principale** : Logo OhmGuard, indicateur WebSocket (Live/Offline), sélecteur langue (FR/EN), toggle thème, email utilisateur, déconnexion, bouton hamburger (mobile)
  - **SubNavbar contextuelle** : Fil d'Ariane dynamique, titre page avec icône, description page
  - **Sidebar responsive** : Navigation latérale collapsible (desktop), overlay avec fermeture auto (mobile)
- ✅ **Module Rapports (January 23, 2026)** - Page /reports avec:
  - Filtres : Période (dates), Client/Bâtiment/Étage/Capteur (cascade), Types d'événements, Criticité, Statuts
  - Génération de rapport avec statistiques : Total, répartition par type/statut, temps moyen d'acquittement, top 5 zones
  - Aperçu HTML print-friendly avec page de garde, résumé exécutif, détails événements, annexes
  - Export PDF via window.print() (react-to-print)
  - Export CSV client-side
- ✅ **Live Events page** (Enhanced January 14, 2026)
  - Event cards with presence/no presence display
  - Active regions and target count info
  - Stats cards (New, Acknowledged, Presence, Presence detected)
  - Grid layout for event cards
- ✅ **Event History** (Enhanced January 14, 2026)
  - New columns: Presence (Yes/No), Active Regions, Target Count
  - PRESENCE filter option
  - CSV export with new fields
- ✅ **Event Detail Page** (NEW January 14, 2026)
  - Presence status display
  - Active regions visualization
  - Target count
  - Raw payload JSON viewer
- ✅ **Presence Simulator** (NEW January 14, 2026)
  - Form to configure event parameters
  - Toggle presence detection
  - Region selector (0-5)
  - Target count slider
  - JSON preview/editor mode
  - Direct POST to /api/events/radar
- ✅ **Radars Management** (unified CRUD + MQTT)
- ✅ **Radar Configuration Page**
  - Basic form with tabs (App, Walabot, RF, System, Regions)
  - Monaco JSON editor with validation
  - MQTT options (QoS, Retain)
  - Version history and rollback
- ✅ Sites & Zones hierarchy view
- ✅ Alert Rules configuration
- ✅ User Management with role editing
- ✅ Notification Log viewer
- ✅ Event Simulator for demos
- ✅ Statistics page with charts
- ✅ Widgets page (embeddable dashboards)
- ✅ Settings (theme, language)
- ✅ **Nouvelle structure de navigation (January 22, 2026)**
  - **Navbar principale** : Logo OhmGuard, indicateur WebSocket (Live/Offline), sélecteur langue (FR/EN), toggle thème, email utilisateur, déconnexion, bouton hamburger (mobile)
  - **SubNavbar contextuelle** : Fil d'Ariane dynamique, titre page avec icône, description page
  - **Sidebar responsive** : Navigation latérale collapsible (desktop), overlay avec fermeture auto (mobile)
- ✅ Bilingual (FR/EN) interface
- ✅ Dark/Light theme

### MQTT Integration (January 14, 2026)
- ✅ Connection to Vayyar MQTT broker (38.242.254.49:1883)
- ✅ Subscription to `/devices/+/state` and `/devices/+/event` topics
- ✅ Auto-registration of unknown devices as new sensors
- ✅ Real-time sensor status updates
- ✅ Fall event creation from radar payloads
- ✅ Deduplication of MQTT events
- ✅ WebSocket broadcast to frontend
- ✅ `/api/mqtt/status` endpoint
- ✅ `/api/mqtt/register-device` endpoint
- ✅ **NEW: RadarEvent normalization in MQTT handler**

## API Endpoints Summary
- `/api/auth/*` - Authentication
- `/api/tenants/*` - Tenant management
- `/api/sites/*` - Site management
- `/api/zones/*` - Zone management
- `/api/sensors/*` - Sensor CRUD + key rotation
- `/api/events/*` - Event list/update/count
- `/api/events/radar` - Radar event ingestion
- `/api/events/{id}/detail` - Event detail with enriched data
- `/api/rules/*` - Alert rules
- `/api/users/*` - User management
- `/api/notifications/*` - Notification log
- `/api/device/*` - Device API (heartbeat, events)
- `/api/simulator/*` - Test event generation
- `/api/stats/*` - Dashboard statistics
- `/api/mqtt/*` - MQTT service management
- `/api/health` - Health check
- `/api/health/redis` - Redis health check
- `/api/health/debug` - Debug diagnostics (includes Redis status)
- `/api/cache/stats` - Cache statistics
- `/api/cache/invalidate` - Manual cache invalidation
- `/api/cache/reset-stats` - Reset cache counters
- `/api/push-tokens` - **NEW: Push notification token management (February 2026)**
- `/api/test-notification` - **NEW: Send test push notification**
- `/api/create-fall-event` - **NEW: Create test fall event with push notification**
- `/api/clients/{id}` (DELETE) - **NEW: Delete client with cascade**

## Demo Credentials
- Super Admin: admin@ohmguard.io / admin123
- Tenant Admin: directeur@jardins-ehpad.fr / directeur123
- Supervisor: superviseur@jardins-ehpad.fr / super123
- Operator: operateur@jardins-ehpad.fr / oper123
- Viewer: viewer@jardins-ehpad.fr / view123

## MQTT Configuration
- **Broker:** 38.242.254.49:1883
- **Topics:**
  - `/devices/{deviceId}/state` - Device status updates
  - `/devices/{deviceId}/event` - Fall detection events
- **Auto-registered Radars:** 2 Vayyar radars detected

## Radar Event Model (NEW)
```json
{
  "payload": {
    "presenceDetected": false,
    "presenceRegionMap": {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
    "presenceTargetType": 0,
    "roomPresenceIndication": 0,
    "timestamp": 1768397944445,
    "trackerTargets": []
  },
  "type": 4
}
```

### Event Type Codes
- 1 = FALL
- 2 = PRE_FALL
- 3 = INACTIVITY
- 4 = PRESENCE
- default = UNKNOWN

## Prioritized Backlog

### P0 - Critical (DONE)
- [x] Authentication system
- [x] Event ingestion and display
- [x] Real-time updates
- [x] Sensor management
- [x] MQTT Radar Integration
- [x] Radar Event Processing (January 14, 2026)
- [x] Clients & Buildings Multi-tenant Module (January 14, 2026)
- [x] **Location integration in events (January 14, 2026)** - Live & History pages now show full location path
- [x] **LivePage redesign (January 14, 2026)** - New event cards with hierarchical location, real-time status, device status
- [x] **Bug fix: Filtrage des événements "absence" (January 15, 2026)** - Le backend ignore maintenant les messages MQTT avec `presenceDetected=false` pour éviter de polluer la page Live avec des événements non pertinents
- [x] **État de présence temps réel (January 15, 2026)** - Nouvel endpoint `/api/presence/sensors` pour obtenir l'état de présence actuel de tous les capteurs. Le badge de présence sur la page Live reflète maintenant l'état temps réel du radar, pas l'événement historique.
- [x] **Stabilisation de la page Live (January 15, 2026)** - Correction du clignotement des cartes causé par le polling. Déduplication des événements par capteur (un seul événement affiché par radar). Nettoyage de 951 événements en double dans la base de données.
- [x] **Implémentation Socket.IO (January 15, 2026)** - Remplacement du polling par Socket.IO pour les mises à jour temps réel. Backend: `python-socketio` intégré à FastAPI. Frontend: `socket.io-client`. Connexion stable avec fallback automatique vers long-polling HTTP.
- [x] **Correction des problèmes de déploiement production (January 16, 2026)**
  - Refonte de la logique de chargement des variables d'environnement pour éviter que le fichier `.env` local n'écrase les variables Kubernetes
  - Correction du conflit CORS double-header entre Socket.IO et FastAPI
  - Ajout d'un endpoint de diagnostic `/api/health/debug` pour le troubleshooting en production
  - Création d'un fichier `.dockerignore` pour exclure les fichiers `.env` de l'image Docker

### P1 - High Priority (Next)
- [x] **Module RBAC complet (January 16, 2026)** - Système d'administration des utilisateurs avec:
  - Gestion des rôles (CLIENT_ADMIN, SUPERVISOR, OPERATOR, VIEWER)
  - 36 permissions organisées par catégories (Pages, Events, Devices, Admin, System)
  - Permissions par défaut selon le rôle + surcharges par utilisateur (ALLOW/DENY)
  - Périmètres de localisation (Client > Building > Floor > Room > RoomSpace)
  - Héritage automatique des périmètres (Building → tous les étages/chambres enfants)
  - API complète: `/api/clients/{id}/users`, `/api/client-users/{id}/permissions`, `/api/client-users/{id}/scopes`
  - Page /users avec onglets Profil, Permissions, Périmètres, Aperçu
  - Journal d'audit pour les changements RBAC
- [x] **Correction bug connexion nouveaux utilisateurs (January 16, 2026)**
  - Diagnostiqué : utilisateurs créés via le module RBAC peuvent se connecter
  - Ajout d'un endpoint `POST /api/client-users/{id}/reset-password` pour réinitialiser les mots de passe
  - Ajout d'un bouton "Réinitialiser le mot de passe" dans l'interface UsersPage
  - Correction du champ `password_hash` → `hashed_password` dans le script de seed
- [x] **Correction accès pages Live/History pour utilisateurs RBAC (January 16, 2026)**
  - Modification de `/api/events` pour filtrer par `client_id` des capteurs assignés (pas seulement `tenant_id`)
  - Modification de `/api/clients` pour retourner les clients auxquels l'utilisateur a accès (via `client_users`)
  - Les utilisateurs avec rôle VIEWER peuvent maintenant voir les événements de leurs clients assignés
- [x] **Nouvelle structure de navigation (January 22, 2026)**
  - Navbar principale avec logo, indicateur WebSocket, sélecteur langue, toggle thème, email, déconnexion
  - SubNavbar contextuelle avec fil d'Ariane dynamique et titre/description de page
  - Sidebar responsive : collapsible sur desktop, overlay sur mobile avec fermeture automatique
  - Bouton hamburger pour menu mobile
  - Traductions FR/EN complètes pour toute la navigation
- [x] **Fil d'Ariane (Breadcrumb) complet (February 4, 2026)**
  - Composant réutilisable `LocationBreadcrumb.jsx` avec icônes et couleurs par niveau
  - Intégration sur toutes les pages de détail : Organisation, Bâtiment, Étage, Chambre
  - Affichage hiérarchique : Accueil → Organisation → Bâtiment → Étage → Chambre
  - Liens cliquables navigant vers les pages parentes
  - Noms réels des entités (pas de labels génériques)
  - API backend enrichie avec `client_name`, `building_name`, `floor_name`
- [x] **Carte Interactive des Bâtiments (February 4, 2026)**
  - **Phase 1 - Import et affichage des plans:**
    - Upload d'images (PNG, JPG, WEBP) et PDF (conversion automatique)
    - Stockage local des fichiers + métadonnées MongoDB
    - Visualisation avec zoom/pan (molette + drag)
    - Sélecteurs cascade Organisation → Bâtiment → Étage
  - **Phase 2 - Placement des marqueurs:**
    - Mode édition avec sidebar listant les capteurs
    - Drag-and-drop des capteurs sur le plan
    - Sauvegarde des positions (coordonnées %)
    - Déplacement et suppression des marqueurs
  - **Phase 3 - Affichage temps réel:**
    - Connexion WebSocket pour mises à jour live
    - Marqueurs colorés selon statut (vert=online, gris=offline, rouge=alerte)
    - Animations pulsantes et ripple pour les alertes
    - Flash visuel lors de nouveaux événements
    - Tooltip au survol avec détails capteur
    - Légende des statuts et bannière d'alerte
    - Toast notifications pour les chutes détectées
    - Statistiques temps réel (Total, En ligne, Hors ligne, Alertes)
- [x] **Configurateur Visuel de Radar (February 4, 2026)** - Multi-régions, Templates, Plein écran
  - Composant `RoomVisualEditor.jsx` intégré dans `RadarConfigPage.js`
- [x] **Module Configuration Complète Vayyar API v38.42 (February 6, 2026)**
  - **Schéma Backend enrichi (`vayyar_config_schema.py`)** :
    - `AppConfig` complet : silentMode, ledMode, ledPolicy, volume, logging, alertes, télémétrie, dry contacts, BLE, WiFi health, NTP
    - `WalabotConfig` complet : arena, sensorMounting, fallingSensitivity, bedExit, trackerSubRegions
    - `RfProfile` : régulation RF, bande passante
  - **Commandes MQTT (downstream)** :
    - Type 1: Upload App Logs
    - Type 2: Upload Dev Logs
    - Type 3: Reboot Device
    - Type 4: Cancel Alarm
    - Type 6: Reboot + Upload Log
    - Type 7: Cancel Fall
    - Type 8: Update Base URL
    - Type 10: Download Firmware
    - Type 16: Update WiFi (deprecated)
  - **Service Backend (`vayyar_config_service.py`)** :
    - Envoi de commandes via MQTT avec logging
    - Historique des commandes (`command_logs` collection)
    - Cache de l'état du radar
  - **Nouveaux Endpoints API** :
    - `POST /api/devices/{id}/command` - Envoyer une commande
    - `GET /api/devices/{id}/commands/history` - Historique des commandes
    - `GET /api/devices/{id}/state` - État du radar (cache)
    - `GET /api/devices/command-types` - Types de commandes disponibles
    - `GET /api/devices/config-enums` - Valeurs d'énumération pour la config
  - **Page Frontend (`RadarConfigPage.js`)** :
    - **7 onglets** : Commandes, Visuel, Détection, Alertes, Télémétrie, Réseau, Avancé
    - **Onglet Commandes** : 7 boutons d'action rapide (Redémarrer, Annuler Alarme, Logs, Firmware...)
    - **Onglet Détection** : Arena, Chute, Sortie de lit, Présence, Sous-régions
    - **Onglet Alertes** : Délais, Audio/LED, Rapports MQTT, Dry contacts
    - **Onglet Télémétrie** : Politique, Transport, 15+ événements configurables
    - **Onglet Réseau** : NTP, Santé WiFi, RSSI, BLE
    - **Onglet Avancé** : Produit, RF, Logging, Modes, DSP
    - Éditeur JSON Monaco avec validation en temps réel
    - Affichage de l'état du radar (température, firmware, last seen)
- [x] **Correction des noms de pages dans la navigation (February 4, 2026)**
  - Mise à jour de `SubNavbar.js` pour utiliser les chemins corrects (`/capteurs`, `/organisations`, `/sites-batiments`, `/carte`)
  - Ajout des configurations manquantes pour Sites & Bâtiments et Carte Interactive
  - Fil d'Ariane cohérent sur toutes les pages de l'application
- [x] **Import Batch de Capteurs via CSV (February 4, 2026)**
  - Backend: Service `sensor_import_service.py` avec endpoints `/api/sensors/import/template`, `/preview`, `/execute`
  - Frontend: Composant `SensorImportModal.jsx` intégré dans RadarsPage
  - Téléchargement du template CSV
  - Prévisualisation avant import (nouveaux, mises à jour, erreurs)
  - Création automatique des emplacements manquants (Organisations, Bâtiments, Étages, Chambres, Espaces)
  - Identification des capteurs par numéro de série
  - Vue de dessus 2D interactive avec canvas SVG (Scale 100px/m)
  - **Système de coordonnées Vayyar (Radar = origine 0,0) :**
    - Pour une pièce 5m×5m avec radar centré : xMin=-2.5, xMax=+2.5, yMin=-2.5, yMax=+2.5
    - Coordonnées affichées dynamiquement sur le canvas
  - **Multi sous-régions (lit, porte, zone)** avec icônes et couleurs distinctes
  - **Système de Templates :**
    - 6 templates prédéfinis : Chambre Standard, Chambre Double, Grande Chambre, Plafond Carré, Plafond Grande Pièce, Couloir
    - Sauvegarde de templates personnalisés en localStorage
    - Menu dropdown avec catégories (Prédéfinis / Mes templates)
    - Suppression des templates personnalisés
  - **Mode Plein Écran** : Overlay z-50, panneau 380px, canvas maximisé, touche Escape pour quitter
  - **Interface optimisée** : Layout horizontal sans scroll, éléments agrandis, coordonnées colorées
- [ ] Email integration (currently mocked)
- [ ] Webhook delivery with HMAC signature
- [ ] Escalation automation
- [ ] Data export (CSV/Excel)
- [x] Config ACKs MQTT UI (History/Rollback modal) - **February 6, 2026**

### P2 - Medium Priority
- [ ] Device MQTT simulator (Node.js)
- [ ] Configuration templates
- [ ] Mobile responsive polish
- [ ] Offline mode (PWA)
- [ ] API rate limiting

### P3 - Low Priority / Future
- [ ] Multi-language admin panel
- [ ] Advanced analytics
- [ ] Audit log export
- [ ] Data retention policies
- [ ] SSO integration

## Key Files Reference
- `backend/server.py` - Main FastAPI app with all endpoints
- `backend/config/redis.py` - Redis configuration module
- `backend/config/event_cache.py` - Event cache service
- `backend/push_notification_service.py` - Expo Push notification service (February 2026)
- `backend/floor_plan_service.py` - Floor plan upload, markers management (February 2026)
- `backend/sensor_import_service.py` - **NEW: Batch CSV import service for sensors (February 2026)**
- `backend/mqtt_service.py` - MQTT integration with RadarEvent support
- `backend/radar_event_models.py` - RadarEvent enums and models
- `backend/vayyar_config_service.py` - Config publish/versioning
- `backend/clients_buildings_models.py` - Multi-tenant hierarchy models
- `backend/clients_buildings_service.py` - Multi-tenant business logic (includes delete_client cascade, breadcrumb data)
- `backend/clients_buildings_routes.py` - Clients & Buildings API (RBAC permissions, floor plan endpoints)
- `backend/rbac_routes.py` - RBAC user management routes
- `backend/seed_clients_buildings.py` - Demo data seeder
- `frontend/src/components/LocationBreadcrumb.jsx` - Reusable breadcrumb component (February 2026)
- `frontend/src/components/SensorImportModal.jsx` - **NEW: CSV import modal component (February 2026)**
- `frontend/src/pages/FloorPlanPage.js` - Interactive map with real-time markers (February 2026)
- `frontend/src/components/RoomVisualEditor.jsx` - Visual radar configurator component (February 2026)
- `frontend/src/lib/vayyarConfigSchema.js` - Vayyar config validation schema
- `frontend/src/components/layout/MainLayout.js` - Layout with Navbar/SubNavbar/Sidebar
- `frontend/src/components/layout/Navbar.js` - Main navigation bar
- `frontend/src/components/layout/SubNavbar.js` - Contextual sub-navigation with breadcrumb
- `frontend/src/components/layout/Sidebar.js` - Responsive sidebar navigation
- `frontend/src/pages/LivePage.js` - Live event wall with cards
- `frontend/src/pages/HistoryPage.js` - Event history table
- `frontend/src/pages/EventDetailPage.js` - Event detail view
- `frontend/src/pages/PresenceSimulatorPage.js` - Presence simulator
- `frontend/src/pages/ClientsPage.js` - Clients list & management
- `frontend/src/pages/ClientDetailPage.js` - Client detail with tree view
- `frontend/src/pages/BuildingDetailPage.js` - Building management (with breadcrumb)
- `frontend/src/pages/FloorDetailPage.js` - Floor & rooms management (with breadcrumb)
- `frontend/src/pages/RoomDetailPage.js` - Room & spaces management (with breadcrumb)
- `frontend/src/pages/RoomDetailPage.js` - Room & spaces with radar assignment
- `frontend/src/lib/api.js` - API client with all endpoints
- `frontend/src/lib/i18n.js` - Complete FR/EN translations for navigation
- `frontend/nginx.conf` - **UPDATED: WebSocket support for Socket.IO**

## Clients & Buildings Module (January 14, 2026 - COMPLETE)

### Hierarchy Structure
Client → Buildings → Floors/Zones → Rooms → Spaces

### API Endpoints
- `GET /api/clients` - List all clients (tenants)
- `POST /api/clients` - Create new client
- `GET /api/clients/:id` - Get client details
- `GET /api/clients/:id/tree` - Get hierarchical tree view
- `GET /api/clients/:id/buildings` - List client buildings
- `POST /api/clients/:id/buildings` - Create building
- `GET /api/buildings/:id` - Building details
- `GET /api/buildings/:id/floors` - List floors
- `POST /api/buildings/:id/floors` - Create floor
- `GET /api/buildings/:id/zones` - List zones
- `POST /api/buildings/:id/zones` - Create zone
- `GET /api/floors/:id` - Floor details
- `GET /api/floors/:id/rooms` - List rooms
- `POST /api/floors/:id/rooms` - Create room
- `GET /api/rooms/:id` - Room details with spaces
- `POST /api/rooms/:id/spaces` - Add space to room
- `POST /api/radars/:id/assign` - Assign radar to location
- `POST /api/radars/:id/unassign` - Unassign radar

### UI Features
- ✅ Clients list with search, stats, and creation modal
- ✅ Client detail page with hierarchical tree view
- ✅ Building management (floors, zones, contact info)
- ✅ Floor management (rooms list with type/capacity)
- ✅ Room management (spaces with radar assignment wizard)
- ✅ Auto-create spaces on room creation (bedroom, bathroom, kitchenette)
- ✅ Visual radar status in space cards

### Demo Data
- 2 clients: "EHPAD Les Jardins du Parc", "Résidence Seniors Les Cèdres"
- 3 buildings with floors, rooms, and zones
- 2 radars assigned to Chambre 101 spaces

### Mobile App (January 23, 2026)
- ✅ **Structure React Native (Expo)** avec Expo Router
- ✅ **Écran Login** - Connexion avec email/password via API `/api/auth/login`
- ✅ **Écran Alertes** - Liste des événements FALL avec statut (NEW/ACK/RESOLVED)
- ✅ **Écran Détail Alerte** - Informations complètes + bouton acquittement
- ✅ **Client API** - Connexion au backend OhmGuard avec gestion des tokens
- ✅ **Hook useAuth** - Gestion de l'authentification et redirection
- ✅ **Hook useAlerts** - Récupération et gestion des alertes
- ✅ **Hook useWebSocket** - Connexion temps réel pour nouvelles alertes
- ✅ **Service Notifications** - Configuration Expo Notifications pour push
- ✅ **Types TypeScript** - Typage complet (Alert, User, etc.)
- ⚠️ **Notifications Push** - Configuré mais nécessite EAS Build sur appareil physique

### Redis Integration (January 30, 2026)
- ✅ **Module de configuration centralisé** (`backend/config/redis.py`)
  - `get_redis_client()` - Client singleton avec pool de connexions
  - `close_redis_client()` - Fermeture propre des connexions
  - `check_redis_health()` - Diagnostic complet (statut, latence, version)
- ✅ **Variables d'environnement Redis**
  - `REDIS_HOST` (default: localhost)
  - `REDIS_PORT` (default: 6379)
  - `REDIS_PASSWORD` (optional)
  - `REDIS_DB` (default: 0)
  - `REDIS_SSL` (default: false)
  - `REDIS_MAX_CONNECTIONS` (default: 10)
  - `REDIS_SOCKET_TIMEOUT` (default: 5s)
- ✅ **Endpoint `/api/health/redis`** - Health check dédié Redis
- ✅ **Intégration dans `/api/health/debug`** - Statut Redis dans le diagnostic système

### Cache des Événements Redis (January 30, 2026)
- ✅ **Service de cache** (`backend/config/event_cache.py`)
  - Cache-aside pattern avec invalidation automatique
  - TTL configurable (default: 5 minutes)
  - Max 100 événements par clé de cache
  - Clés de cache basées sur tenant_id, client_id et filtres
- ✅ **Endpoint `/api/events` optimisé**
  - Cache automatique des requêtes sans pagination (skip=0, limit≤100)
  - Paramètre `no_cache=true` pour forcer le contournement du cache
  - Enrichissement des données avant mise en cache
- ✅ **Invalidation automatique**
  - Lors de la création d'un nouvel événement radar
  - Lors de la mise à jour d'un événement (status, notes, etc.)
- ✅ **Endpoints de gestion du cache**
  - `GET /api/cache/stats` - Statistiques (hits, misses, hit_rate)
  - `POST /api/cache/invalidate` - Invalidation manuelle (tenant, client, all)
  - `POST /api/cache/reset-stats` - Réinitialisation des compteurs
- ✅ **Performance mesurée** : ~40% amélioration du temps de réponse sur les requêtes répétées

### Push Notifications Mobile (February 2026)
- ✅ **Service de notifications push** (`backend/push_notification_service.py`)
  - Intégration avec Expo Push API
  - Gestion des tokens push par utilisateur
  - Envoi d'alertes de chute aux appareils mobiles
- ✅ **Endpoints push notifications**
  - `POST /api/push-tokens` - Enregistrer un token push (appelé au login mobile)
  - `DELETE /api/push-tokens` - Supprimer un token push (appelé au logout)
  - `POST /api/test-notification` - Envoyer une notification de test
  - `POST /api/create-fall-event` - Créer un événement de chute test + notification
- ✅ **Collection MongoDB `push_tokens`**
  - Stockage des tokens Expo Push par utilisateur
  - Gestion multi-appareils (un utilisateur peut avoir plusieurs tokens)
- ✅ **Intégration avec le flux d'événements**
  - Notification automatique lors d'un événement FALL
  - Payload inclut: event_id, location, severity

### Sécurité Multi-tenant Renforcée (February 2026)
- ✅ **Fonction `check_event_access()`** dans server.py
  - Vérifie l'accès aux événements selon tenant_id ET client_id
  - Support du modèle ancien (tenant_id) et nouveau (client_id via sensors)
  - Vérification via `client_users` pour les utilisateurs RBAC
- ✅ **Vérifications RBAC dans les routes**
  - `check_rbac_permission()` dans clients_buildings_routes.py
  - Permissions granulaires: BUILDING_MANAGE, etc.
  - Repli sur le rôle système pour TENANT_ADMIN
- ✅ **Suppression de client en cascade**
  - `DELETE /api/clients/{id}` (SUPER_ADMIN uniquement)
  - Supprime: bâtiments, étages, chambres, espaces, zones
  - Désassigne les capteurs (non supprimés)
  - Supprime: utilisateurs client, données RBAC, règles d'alerte, journaux d'audit

### Configuration Nginx WebSocket (February 2026)
- ✅ **Support WebSocket pour Socket.IO**
  - Route `/api/socket.io/` configurée AVANT `/api/`
  - Headers WebSocket: `Upgrade`, `Connection`
  - `proxy_buffering off` et `proxy_cache off`
  - Timeout de 86400s pour connexions longues
- ✅ **Upgrade automatique** de polling HTTP vers WebSocket