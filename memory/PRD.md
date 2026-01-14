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

### Frontend Features
- ✅ Login page with demo credentials
- ✅ Dashboard with real-time stats
- ✅ Live Events page with filters
- ✅ Event History with pagination
- ✅ **Radars Management** (unified CRUD + MQTT)
- ✅ **Radar Configuration Page** (NEW)
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

## API Endpoints Summary
- `/api/auth/*` - Authentication
- `/api/tenants/*` - Tenant management
- `/api/sites/*` - Site management
- `/api/zones/*` - Zone management
- `/api/sensors/*` - Sensor CRUD + key rotation
- `/api/events/*` - Event list/update/count
- `/api/rules/*` - Alert rules
- `/api/users/*` - User management
- `/api/notifications/*` - Notification log
- `/api/device/*` - Device API (heartbeat, events)
- `/api/simulator/*` - Test event generation
- `/api/stats/*` - Dashboard statistics
- `/api/mqtt/*` - MQTT service management (NEW)
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

## Prioritized Backlog

### P0 - Critical (DONE)
- [x] Authentication system
- [x] Event ingestion and display
- [x] Real-time updates
- [x] Sensor management
- [x] MQTT Radar Integration

### P1 - High Priority (Next)
- [ ] Full RBAC with granular permissions
- [ ] Email integration (currently mocked)
- [ ] Webhook delivery with HMAC signature
- [ ] Escalation automation
- [ ] Data export (CSV/Excel)

### P2 - Medium Priority
- [ ] Event detail view with timeline
- [ ] Snapshot image viewing
- [ ] Advanced analytics/charts
- [ ] Mobile responsive improvements

### P3 - Nice to Have
- [ ] Push notifications
- [ ] Event grouping/correlation
- [ ] Sensor firmware OTA updates
- [ ] API rate limiting
- [ ] PDF report export

## Test Reports
- `/app/test_reports/iteration_1.json` - Initial MVP (95% frontend, 100% backend)
- `/app/test_reports/iteration_2.json` - MQTT Integration (100% all tests)

## Files Structure
```
/app/
├── backend/
│   ├── .env
│   ├── mqtt_service.py      # NEW - MQTT integration
│   ├── requirements.txt
│   ├── seed.py
│   ├── server.py
│   └── tests/
│       └── test_mqtt_integration.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── RadarsPage.js   # NEW - MQTT radars management
        │   └── ... (12 other pages)
        ├── components/
        ├── contexts/
        └── lib/
```
