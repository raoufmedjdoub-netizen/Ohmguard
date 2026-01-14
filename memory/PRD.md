# OhmGuard - Product Requirements Document

## Original Problem Statement
Build OhmGuard - a SaaS platform for fall detection management using **Vayyar radar sensors exclusively**. The platform centralizes events from Vayyar radars installed in facilities (nursing homes, hospitals, airports).

## Technology Stack
- **Frontend:** React (JavaScript) + Tailwind CSS + shadcn/ui
- **Backend:** FastAPI (Python) + Motor (async MongoDB)
- **Database:** MongoDB
- **Real-time:** WebSocket (native FastAPI) + MQTT (aiomqtt)
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
- ✅ Responsive sidebar navigation
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
- [x] **Radar Event Processing (January 14, 2026)**

### P1 - High Priority (Next)
- [ ] Full RBAC with granular permissions
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
- `backend/radar_event_models.py` - **NEW: RadarEvent enums and models**
- `backend/vayyar_config_service.py` - Config publish/versioning
- `frontend/src/pages/LivePage.js` - Live event wall with cards
- `frontend/src/pages/HistoryPage.js` - Event history table
- `frontend/src/pages/EventDetailPage.js` - **NEW: Event detail view**
- `frontend/src/pages/PresenceSimulatorPage.js` - **NEW: Presence simulator**
- `frontend/src/lib/api.js` - API client with new endpoints
- `frontend/src/lib/i18n.js` - Translations (FR/EN)
