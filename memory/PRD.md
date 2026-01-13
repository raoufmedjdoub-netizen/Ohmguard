# FallGuard - Product Requirements Document

## Original Problem Statement
Build FallGuard - a SaaS platform for fall detection management centralizing events from sensors (radar/camera/IoT) installed in facilities (nursing homes, hospitals, airports).

## User Personas
1. **Super Admin** - Platform administrator with full access
2. **Tenant Admin** - Facility director managing their organization
3. **Supervisor** - Team lead overseeing operators
4. **Operator** - Staff handling alert acknowledgment/resolution
5. **Viewer** - Read-only access to dashboards

## Core Requirements
- Multi-tenant architecture with data isolation
- Real-time event streaming via WebSocket
- RBAC (Role-Based Access Control)
- JWT authentication with refresh tokens
- Bilingual interface (FR/EN)
- Dark/Light theme toggle
- Event deduplication (10s window)

## What's Been Implemented (January 2026)

### Backend (FastAPI + MongoDB)
- ✅ Complete REST API with 25+ endpoints
- ✅ JWT authentication with refresh tokens
- ✅ Multi-tenant data isolation
- ✅ WebSocket for real-time events
- ✅ Event deduplication logic
- ✅ Alert rules engine
- ✅ Audit logging
- ✅ Device API (heartbeat, event ingestion)
- ✅ Seed script with demo data

### Frontend (React + Tailwind + shadcn/ui)
- ✅ Login page with demo credentials
- ✅ Dashboard with real-time stats
- ✅ Live Events page with filters
- ✅ Event History with pagination
- ✅ Sensors Management (CRUD)
- ✅ Sites & Zones hierarchy view
- ✅ Alert Rules configuration
- ✅ User Management with role editing
- ✅ Notification Log viewer
- ✅ Event Simulator for demos
- ✅ Settings (theme, language)
- ✅ Responsive sidebar navigation

### Data Seeded
- 1 Tenant (EHPAD Les Jardins)
- 2 Sites
- 5 Zones
- 10 Sensors (Radar, Camera, IoT)
- 50+ Events
- 5 Users (all roles)
- 2 Alert Rules

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
- `/api/health` - Health check

## Demo Credentials
- Super Admin: admin@fallguard.io / admin123
- Tenant Admin: directeur@jardins-ehpad.fr / directeur123
- Supervisor: superviseur@jardins-ehpad.fr / super123
- Operator: operateur@jardins-ehpad.fr / oper123
- Viewer: viewer@jardins-ehpad.fr / view123

## Prioritized Backlog

### P0 - Critical (Done)
- [x] Authentication system
- [x] Event ingestion and display
- [x] Real-time updates
- [x] Sensor management

### P1 - High Priority (Future)
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

## Next Tasks
1. Implement real email integration (SendGrid/Resend)
2. Add webhook delivery with retry logic
3. Build event detail modal with timeline
4. Add data export functionality
5. Implement escalation automation
