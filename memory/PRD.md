# OhmGuard - Fall Detection Management Platform

## Product Overview
OhmGuard is a comprehensive fall detection and monitoring platform that integrates Vayyar radar sensors and Seedoo AI cameras for elderly care facilities (EHPAD). The platform provides real-time monitoring, alerts, and configuration management.

## Core Requirements
1. **Vayyar Radar Integration**: Complete MQTT-based communication with Vayyar Home sensors
2. **Fall Detection**: Real-time detection and alerting for fall events
3. **Configuration Management**: Remote configuration of radar parameters via MQTT
4. **Multi-tenant Architecture**: Support for multiple care facilities
5. **Real-time Dashboard**: Live monitoring of sensor status and events

## Technical Stack
- **Backend**: FastAPI + Python + Motor (async MongoDB)
- **Frontend**: React + Vite + Shadcn/UI + TailwindCSS
- **Database**: MongoDB
- **Real-time**: MQTT (aiomqtt) + WebSocket (python-socketio)
- **Mobile**: React Native / Expo (in progress)

## Vayyar Event Type Mapping (UPDATED 2026-02-09)
| Vayyar Code | Event Type      | Severity | Description                    |
|-------------|-----------------|----------|--------------------------------|
| 4           | PRESENCE        | LOW      | Person detected in room        |
| 5           | FALL            | HIGH     | Standard fall detected         |
| 8           | SENSITIVE_FALL  | HIGH     | Suspected fall (confidence)    |
| 10          | BED_EXIT        | MED      | Person exiting bed             |

## MQTT Topics
- Config: `/devices/{deviceId}/config`
- Commands: `/devices/{deviceId}/commands`
- State: `/devices/{deviceId}/state`
- Events: `/devices/{deviceId}/events`

## Command Payload Format
```json
{"type": "Reboot"}
{"type": "CancelAlarm"}
{"type": "UpdateBaseUrl"}
```

---

## Changelog

### 2026-02-09 - Vayyar Event Mapping Fix
- **Fixed**: Corrected event type mapping in `radar_event_models.py`
- **Added**: `SENSITIVE_FALL` and `BED_EXIT` event types
- **Added**: Push notification support for fall events in `mqtt_service.py`
- **Verified**: Command payload format `{"type": "CommandName"}` working

---

## Roadmap

### P0 - Critical
- [ ] Test configuration payload with real radar (numeric enums)
- [ ] Verify RadarConfigPage frontend crash fix

### P1 - High Priority
- [ ] Redis environment variables in production
- [ ] WebSocket upgrade from polling mode
- [ ] CSV import error reports (downloadable)

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

## Known Issues
1. **RadarConfigPage crash** - Possible `undefined` options in SelectField
2. **Redis production** - Environment variable configuration pending
3. **Mobile app** - Not starting (React Native/Expo issue)
