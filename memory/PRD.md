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

## Vayyar Event Type Mapping
| Vayyar Code | Event Type      | Severity | Description                    |
|-------------|-----------------|----------|--------------------------------|
| 4           | PRESENCE        | LOW      | Person detected in room        |
| 5           | FALL            | HIGH     | Standard fall detected         |
| 8           | SENSITIVE_FALL  | HIGH     | Suspected fall (confidence)    |
| 10          | BED_EXIT        | MED      | Person exiting bed             |

## Seedoo AI Camera Warning Types
| Warning Type     | Severity | Description                     |
|------------------|----------|---------------------------------|
| Fall_Detected    | HIGH     | Fall detected by AI camera      |
| Violence         | HIGH     | Violence detected               |
| Fire             | HIGH     | Fire detected                   |
| Smoke            | HIGH     | Smoke detected                  |
| Intrusion        | HIGH     | Intrusion detected              |
| Person_Detected  | MEDIUM   | Person detected                 |
| Loitering        | MEDIUM   | Loitering detected              |
| Normal_Activity  | LOW      | Normal activity                 |
| No_Activity      | LOW      | No activity detected            |

## MQTT Configuration
- **Broker**: 51.91.9.198:1883
- **Topics**:
  - Config: `/devices/{deviceId}/config`
  - Commands: `/devices/{deviceId}/commands`
  - State: `/devices/{deviceId}/state`
  - Events: `/devices/{deviceId}/events`
  - AI Cameras: `/seedoo/{channel}`

## Roadmap

### P0 - Critical
- [x] Last State Module implementation
- [x] Presence Sessions Architecture
- [x] Fall Events implementation with Vayyar payload
- [x] SENSITIVE_FALL (type 8) integration
- [x] Real-time Fall Alert UI (GlobalAlertBanner + AlertContext)
- [x] Workflow d'acquittement avancé
- [x] Banner d'alerte global (incrustation correcte)
- [x] Affichage localisation au lieu des IDs radar
- [x] Page utilisateurs intégrée dans Paramètres
- [ ] Test SENSITIVE_FALL and BED_EXIT events in production
- [ ] WebSocket rooms by building/floor for push updates

### P1 - High Priority
- [x] Cleanup false fall events
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

## Key Files Reference

### Backend
- `server.py` - Main FastAPI application
- `mqtt_service.py` - MQTT event handling (Vayyar radars)
- `seedoo_mqtt_service.py` - Seedoo AI camera MQTT handling
- `ai_sensor_service.py` - AI sensor CRUD and events
- `radar_event_models.py` - Event type definitions and normalization
- `presence_session_service.py` - Presence session lifecycle
- `last_state_service.py` - Redis state management
- `vayyar_config_service.py` - Radar configuration
- `email_service.py` - SMTP email notifications

### Frontend
- `SettingsPage.jsx` - Settings with integrated user management tab
- `DashboardPage.js` - Main dashboard
- `HistoryPage.js` - Event history with filters
- `EventDetailPage.js` - Event detail with fall timeline
- `LivePage.js` - Real-time monitoring with active alerts
- `GlobalAlertBanner.jsx` - Global alert banner
- `AlertContext.js` - Global alert state management
- `EventActionDialog.jsx` - Shared action dialog component

## Known Issues
1. **Mobile app** - Not starting (React Native/Expo issue)
