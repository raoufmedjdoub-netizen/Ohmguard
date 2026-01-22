# OhmGuard - Product Requirements Document

## Original Problem Statement
Build OhmGuard - a SaaS platform for fall detection management using **Vayyar radar sensors exclusively**. The platform centralizes events from Vayyar radars installed in facilities (nursing homes, hospitals, airports).

## Technology Stack
- **Frontend:** React (JavaScript) + Tailwind CSS + shadcn/ui
- **Backend:** FastAPI (Python) + Motor (async MongoDB)
- **Database:** MongoDB
- **Real-time:** **Socket.IO** (`python-socketio` backend, `socket.io-client` frontend) + MQTT (aiomqtt)
- **Auth:** JWT + Refresh tokens
- **Theme:** Turquoise/Blue color scheme
- **Sensors:** Vayyar Radars only (MQTT integration)

## User Personas
1. **Super Admin** - Platform administrator with full access
2. **Tenant Admin** - Facility director managing their organization
3. **Supervisor** - Team lead overseeing operators
4. **Operator** - Staff handling alert acknowledgment/resolution
5. **Viewer** - Read-only access to dashboards

## What's Been Implemented (January 2026)

### Backend Features
- ✅ Complete REST API with 40+ endpoints
- ✅ JWT authentication with refresh tokens
- ✅ Multi-tenant data isolation
- ✅ WebSocket for real-time events
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
- ✅ **NEW: Radar Event Processing** (January 14, 2026)
  - POST /api/events/radar endpoint
  - RadarEventType enum (FALL, PRE_FALL, INACTIVITY, PRESENCE, UNKNOWN)
  - Payload normalization (presenceDetected, presenceRegionMap, trackerTargets)
  - Active regions extraction
  - Target count tracking
  - Epoch to ISO timestamp conversion
  - Raw payload storage for audit

### Frontend Features
- ✅ Login page with demo credentials
- ✅ Dashboard with real-time stats
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
- `/api/events/radar` - **NEW: Radar event ingestion**
- `/api/events/{id}/detail` - **NEW: Event detail with enriched data**
- `/api/rules/*` - Alert rules
- `/api/users/*` - User management
- `/api/notifications/*` - Notification log
- `/api/device/*` - Device API (heartbeat, events)
- `/api/simulator/*` - Test event generation
- `/api/stats/*` - Dashboard statistics
- `/api/mqtt/*` - MQTT service management
- `/api/health` - Health check

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
- [ ] Email integration (currently mocked)
- [ ] Webhook delivery with HMAC signature
- [ ] Escalation automation
- [ ] Data export (CSV/Excel)
- [ ] Config ACKs MQTT UI (History/Rollback modal)

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
- `backend/mqtt_service.py` - MQTT integration with RadarEvent support
- `backend/radar_event_models.py` - RadarEvent enums and models
- `backend/vayyar_config_service.py` - Config publish/versioning
- `backend/clients_buildings_models.py` - Multi-tenant hierarchy models
- `backend/clients_buildings_service.py` - Multi-tenant business logic
- `backend/clients_buildings_routes.py` - Clients & Buildings API
- `backend/seed_clients_buildings.py` - Demo data seeder
- `frontend/src/components/layout/MainLayout.js` - **NEW: Layout with Navbar/SubNavbar/Sidebar**
- `frontend/src/components/layout/Navbar.js` - **NEW: Main navigation bar**
- `frontend/src/components/layout/SubNavbar.js` - **NEW: Contextual sub-navigation with breadcrumb**
- `frontend/src/components/layout/Sidebar.js` - **UPDATED: Responsive sidebar navigation**
- `frontend/src/pages/LivePage.js` - Live event wall with cards
- `frontend/src/pages/HistoryPage.js` - Event history table
- `frontend/src/pages/EventDetailPage.js` - Event detail view
- `frontend/src/pages/PresenceSimulatorPage.js` - Presence simulator
- `frontend/src/pages/ClientsPage.js` - Clients list & management
- `frontend/src/pages/ClientDetailPage.js` - Client detail with tree view
- `frontend/src/pages/BuildingDetailPage.js` - Building management
- `frontend/src/pages/FloorDetailPage.js` - Floor & rooms management
- `frontend/src/pages/RoomDetailPage.js` - Room & spaces with radar assignment
- `frontend/src/lib/api.js` - API client with all endpoints
- `frontend/src/lib/i18n.js` - **UPDATED: Complete FR/EN translations for navigation**

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
