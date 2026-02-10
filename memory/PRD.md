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
2. **RadarConfigPage** - Large file, needs refactoring
