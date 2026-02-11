# OhmGuard - Fall Detection Management Platform

## Product Overview
OhmGuard is a comprehensive fall detection and monitoring platform that integrates Vayyar radar sensors and Seedoo AI cameras for elderly care facilities (EHPAD). The platform provides real-time monitoring, alerts, and configuration management.

## Core Requirements
1. **Vayyar Radar Integration**: Complete MQTT-based communication with Vayyar Home sensors
2. **Fall Detection**: Real-time detection and alerting for fall events
3. **Configuration Management**: Remote configuration of radar parameters via MQTT
4. **Multi-tenant Architecture**: Support for multiple care facilities
5. **Real-time Dashboard**: Live monitoring of sensor status and events
6. **Last State Module**: Redis-based fast access to sensor states

## Technical Stack
- **Backend**: FastAPI + Python + Motor (async MongoDB)
- **Frontend**: React + Vite + Shadcn/UI + TailwindCSS
- **Database**: MongoDB
- **Cache**: Redis (Last State, sensors cache)
- **Real-time**: MQTT (aiomqtt) + WebSocket (python-socketio)
- **Mobile**: React Native / Expo (in progress)

## Vayyar Event Type Mapping (UPDATED 2026-02-09)
| Vayyar Code | Event Type      | Severity | Description                    |
|-------------|-----------------|----------|--------------------------------|
| 4           | PRESENCE        | LOW      | Person detected in room        |
| 5           | FALL            | HIGH     | Standard fall detected         |
| 8           | SENSITIVE_FALL  | HIGH     | Suspected fall (confidence)    |
| 10          | BED_EXIT        | MED      | Person exiting bed             |

## MQTT Configuration
- **Broker**: 185.249.227.251:1883
- **Topics**:
  - Config: `/devices/{deviceId}/config`
  - Commands: `/devices/{deviceId}/commands`
  - State: `/devices/{deviceId}/state`
  - Events: `/devices/{deviceId}/events`

## Redis Key Design (Last State Module)
- Sensor state: `ls:{tenant_id}:sensor:{sensor_id}`
- Building index: `ls:{tenant_id}:building:{building_id}:sensors`
- Floor index: `ls:{tenant_id}:floor:{floor_id}:sensors`
- TTL: 7 days (604800 seconds)
- OFFLINE_THRESHOLD: 120 seconds

---

## Changelog

### 2026-02-09 - Last State Module Implementation
- **Created**: `last_state_service.py` - Redis-based state management
- **Created**: `/api/last-state/*` endpoints with RBAC
- **Created**: `LiveStatePage.js` - Real-time monitoring UI
- **Created**: `useLastState.js` hook for React
- **Created**: `SensorStatusBadge.jsx` components
- **Added**: Pagination on RadarsPage (20 items/page)
- **Added**: WebSocket throttling for PRESENCE events (5s interval)
- **Added**: MongoDB indexes for performance
- **Added**: Redis cache on /api/sensors endpoint

### 2026-02-09 - Presence Sessions Architecture (MAJOR)
- **Created**: `presence_session_service.py` - Manages presence session lifecycle
- **Created**: `/api/presence-sessions/*` endpoints for session history and stats
- **Created**: `PresenceHistoryPage.js` - Frontend page for presence history
- **ARCHITECTURAL CHANGE**: PRESENCE events (type=4) are NO LONGER saved in the `events` collection
- **New collection**: `presence_sessions` stores aggregated sessions with start_at, end_at, duration_sec
- **Session tracking**: presence=true starts a session, presence=false ends it
- **SUPER_ADMIN**: Can see all sessions across all tenants
- **Real-time duration**: Active sessions show live-updating duration on frontend

### 2026-02-09 - Vayyar Event Mapping Fix
- **Fixed**: Corrected event type mapping in `radar_event_models.py`
- **Added**: `SENSITIVE_FALL` and `BED_EXIT` event types
- **Added**: Push notification support for fall events

### 2026-02-09 - Sensor Import Improvements
- **Added**: Excel template generation with formatting
- **Added**: Interactive table for data entry
- **Removed**: Model/Firmware columns (auto-retrieved from MQTT)

---

## Roadmap

### P0 - Critical
- [x] Last State Module implementation
- [x] Presence Sessions Architecture (stop saving raw PRESENCE events)
- [x] Presence History page (frontend)
- [x] Bulk UpdateBaseUrl MQTT command (fixed 2026-02-10)
- [x] Fall Events implementation with Vayyar payload (2026-02-11)
- [ ] Test SENSITIVE_FALL (type 8) and BED_EXIT (type 10) events
- [ ] WebSocket rooms by building/floor for push updates

### P1 - High Priority
- [x] Cleanup false fall events (verified clean - 0 found 2026-02-10)
- [ ] CSV import error reports (downloadable)
- [ ] Redis production environment configuration

### P2 - Medium Priority
- [ ] Mobile app startup issue
- [ ] Live page AI event details (video links)
- [ ] Sensor assignment history

### P3 - Low Priority / Future
- [ ] Filter persistence on Events/Sensors pages
- [ ] Statistics by zone/camera/alert type
- [ ] Sensor maintenance mode
- [ ] Audit logging
- [ ] Outbound webhooks for events
- [ ] Refactor RoomVisualEditor.jsx
- [ ] Refactor RadarConfigPage.js (split into components)

---

## Key Files Reference

### Backend
- `server.py` - Main FastAPI application
- `mqtt_service.py` - MQTT event handling (PRESENCE events → sessions, not events)
- `presence_session_service.py` - Presence session lifecycle management
- `last_state_service.py` - Redis state management
- `radar_event_models.py` - Event type definitions
- `vayyar_config_service.py` - Radar configuration
- `sensor_import_service.py` - CSV/Excel import

### Frontend
- `PresenceHistoryPage.js` - Presence session history and statistics
- `LiveStatePage.js` - Real-time sensor monitoring
- `RadarsPage.js` - Sensor management with pagination
- `SensorImportModal.jsx` - Import with table interface
- `useLastState.js` - Last state React hook
- `SensorStatusBadge.jsx` - Status indicator components

---

## Known Issues
1. **Mobile app** - Not starting (React Native/Expo issue)
2. ~~**RadarConfigPage** - Large file, needs refactoring~~ (DONE - now functional)

### 2026-02-10 - Bulk UpdateBaseUrl Fix
- **Fixed**: Frontend was sending MQTT `device_id` but backend looked up by platform `id` → "Sensor not found" for 19/20 radars
- **Fixed**: Each command opened a separate MQTT connection → connection instability
- **Solution**: Frontend now sends platform sensor IDs; new `send_bulk_commands()` method uses a single MQTT connection for all commands
- **Files modified**: `vayyar_config_service.py`, `server.py`, `RadarsPage.js`
- **Verified**: 20/20 radars updated successfully via curl test

### 2026-02-10 - Pagination Size Selector
- **Added**: Page size selector on RadarsPage (20, 50, 100, 500, 1000 per page)
- **Added**: "Tous les filtrés" quick select button to select all filtered radars across all pages
- **Files modified**: `RadarsPage.js`

### 2026-02-10 - Fix Imported vs Auto-Registered Sensor Duplicates
- **Root cause**: Imported sensors had `device_id` = serial number, MQTT auto-registration created duplicates with real MQTT device_id
- **Code fix**: `_handle_device_state` and `_handle_device_event` now check `serialProduct` from MQTT payload to link existing imported sensors before auto-registering
- **Data cleanup**: Merged 24 duplicate pairs (updated imported sensor's device_id, deleted auto-registered duplicates)
- **Files modified**: `mqtt_service.py`

### 2026-02-10 - SubNavbar Actions Integration (UI Refactoring)
- **Removed duplicate page headers**: Created `PageActionsContext` to allow pages to inject their action buttons into the SubNavbar
- **Pages updated**: RadarsPage, LiveStatePage, PresenceHistoryPage, UsersPage, ClientsPage, StatisticsPage, AISensorsPage, SettingsPage, SitesBatimentsPage, FloorPlanPage, SensorsPage
- **Architecture**: Ref-based context (no re-render cascade) with subscriber pattern for SubNavbar only
- **Files created**: `contexts/PageActionsContext.js`
- **Files modified**: `MainLayout.js`, `SubNavbar.js`, all pages above

### 2026-02-10 - WebSocket Room-Based Routing
- **Architecture**: Room-based broadcasting filtered by role and location scopes
  - `admin_all`: SUPER_ADMIN receives ALL events
  - `tenant_{id}`: TENANT_ADMIN receives all events for their tenant
  - `building_{id}`: Scoped users receive events only for their assigned buildings
  - `floor_{id}`: Fine-grained filtering by floor
  - Fallback: Users without location_scopes see all events in their tenant
- **Backend**: Complete rewrite of `socketio_service.py` with JWT-based room assignment
- **Backend**: All MQTT broadcasts now include `building_id` and `floor_id` for routing
- **Endpoint**: `GET /api/health/websocket` for admin to monitor connected clients and rooms
- **Frontend**: `WebSocketContext.js` updated to expose `rooms` state
- **Files modified**: `socketio_service.py`, `mqtt_service.py`, `server.py`, `WebSocketContext.js`

### 2026-02-10 - Email Notifications for FALL Events
- **Backend**: `email_service.py` - SMTP email service with configurable settings stored in MongoDB
- **Endpoints**: `GET/PUT /api/settings/smtp`, `POST /api/settings/smtp/test`, `GET/PUT /api/users/me/notifications`
- **Flow**: MQTT FALL event → check SMTP enabled → query users with email_notifications=true → send HTML alert email
- **Frontend**: SettingsPage updated with SMTP config form (admin only) + test button + per-user notification toggle
- **Fix**: Added proper EHLO domain, Date header, Message-ID for Outlook compatibility. Fixed SSL (port 465 = SMTP_SSL)
- **Files created**: `email_service.py`
- **Files modified**: `server.py`, `mqtt_service.py`, `SettingsPage.js`

### 2026-02-11 - RadarConfigPage Refactoring
- **Schema updated**: `vayyarConfigSchema.js` rewritten to match exact Vayyar JSON structure with string enums, new fields (BLE, WiFi health, MQTT, NTP, telemetry triggers, RF profile, etc.)
- **New fields added**: sensitivityLevel, suspendDuration, MQTT advanced, multiPresenceAlpha, RF profile, bed exit wall side, all walabot telemetry flags
- **Removed deprecated fields**: bleServerType, logLevel
- **Files modified**: `vayyarConfigSchema.js`, `RadarConfigPage.js`

### 2026-02-11 - RadarConfigPage Zod Validation Fix (CRITICAL)
- **Problem**: Form submission failed with "invalid_type" Zod validation errors because HTML inputs send values as strings, not numbers/booleans
- **Frontend fix**: Replaced all strict Zod types (`z.number()`, `z.boolean()`, `z.string()`) in `walabotConfig`, `rfProfile`, and `mqttOptionsSchema` with flexible coercing types (`flexNum()`, `flexBool()`, `flexStr()`) that handle string-to-type conversion
- **Backend fix**: `ConfigVersionStatus` class was inheriting only from `str`, causing `'str' object has no attribute 'value'` error. Fixed by making it inherit from `str, Enum`
- **Result**: Configuration can now be saved successfully (toast: "Configuration envoyée (v1)")
- **Files modified**: `frontend/src/lib/vayyarConfigSchema.js`, `backend/vayyar_config_schema.py`

### 2026-02-11 - Bulk Config Send & Template Management
- **Bulk Config Send**: New feature to send configuration to multiple selected radars at once
  - Button "Envoyer Config" appears when radars are selected on RadarsPage
  - Select a template, then send to all selected radars
  - Progress reporting: success/failure count per radar
- **Template Management**: Full CRUD for configuration templates
  - Create templates with name, description, and full config (using DEFAULT_CONFIG)
  - System templates (shared) vs User templates (per tenant)
  - Edit and delete templates
  - Templates stored in MongoDB `config_templates` collection
- **Backend Endpoints**:
  - `POST /api/devices/bulk-config` - Send config to multiple devices
  - `POST /api/config/templates/create` - Create template with proper body
  - `PUT /api/config/templates/{id}` - Update template
  - `DELETE /api/config/templates/{id}` - Delete template
- **Frontend Components**: 
  - Bulk Config Dialog with template selection
  - Template Management Dialog with create/edit/delete
- **Files modified**: `backend/server.py`, `backend/vayyar_config_service.py`, `frontend/src/pages/RadarsPage.js`

### 2026-02-11 - MQTT Broker Change
- Changed MQTT broker from `185.249.227.251` to `51.91.9.198` port 1883
- Both Vayyar config service and Seedoo service now use the new broker
- **File modified**: `backend/.env`

### 2026-02-11 - Schema Fixes for Radar Compatibility
- **bedExitWallSide**: Changed from number (0/1) to string ("Left"/"Right") - radar expects string
- **ledPolicy**: Updated enum values to match radar expectations
- **flexNum()**: Fixed to handle NaN values by returning default instead of failing
- **Files modified**: `frontend/src/lib/vayyarConfigSchema.js`

