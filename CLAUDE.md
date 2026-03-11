# CLAUDE.md — Ohmguard

## Vue d'ensemble du projet

**Ohmguard** est une plateforme IoT de santé pour la détection et la surveillance des chutes de patients dans les établissements médicaux (EHPAD, cliniques, maisons de retraite). Le système combine des capteurs radar/IA, une interface web temps réel et une application mobile.

**Stack technique :**
- Backend : FastAPI (Python 3.11) + MongoDB + Redis + Socket.IO + MQTT
- Frontend web : React 19 + Tailwind CSS + Shadcn/ui + Socket.IO
- Mobile : React Native (Expo 50) + Expo Router
- Infrastructure : Docker + Docker Compose

---

## Structure du projet

```
Ohmguard/
├── backend/          # API FastAPI (Python)
├── frontend/         # Application React
├── mobile/           # Application React Native (Expo)
├── docker-compose.yml
├── DEPLOY.md         # Guide de déploiement
├── mongo-init.js     # Initialisation MongoDB (index)
└── design_guidelines.json  # Charte graphique
```

---

## Commandes de développement

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
yarn install
yarn start        # Dev (localhost:3000)
yarn build        # Build production
yarn test         # Tests
```

### Mobile
```bash
cd mobile
yarn install
npx expo start    # Scanner le QR code avec Expo Go
```

### Docker (production)
```bash
docker-compose build
docker-compose up -d
```

### Tests
```bash
# Backend
cd backend && pytest

# API integration
python backend_test.py

# Frontend
cd frontend && yarn test
```

---

## Architecture technique

### Backend (`backend/server.py` — fichier principal, ~4 200 lignes)

L'application FastAPI expose des routes REST et WebSocket. Services clés :

| Fichier | Rôle |
|---------|------|
| `server.py` | Application principale + toutes les routes |
| `mqtt_service.py` | Ingestion des données capteurs via MQTT |
| `socketio_service.py` | WebSocket temps réel (Socket.IO) |
| `email_service.py` | Notifications e-mail |
| `push_notification_service.py` | Notifications push mobiles |
| `rbac_service.py` | Contrôle d'accès basé sur les rôles |
| `ai_sensor_service.py` | Traitement des événements IA |
| `vayyar_config_service.py` | Configuration des capteurs radar Vayyar |
| `cache_service.py` | Cache événements via Redis |
| `clients_buildings_service.py` | Gestion clients/bâtiments |
| `floor_plan_service.py` | Plans d'étage interactifs |
| `presence_session_service.py` | Suivi des sessions de présence |
| `sensor_import_service.py` | Import en masse de capteurs |

**Authentification :** JWT (access + refresh tokens)
**Base de données :** MongoDB async (Motor)
**Cache :** Redis (dégradation gracieuse si indisponible)

### Frontend (`frontend/src/`)

**65 composants React** organisés en pages :
- `Dashboard` — Vue d'ensemble des alertes et statistiques
- `Live` — Flux d'événements temps réel
- `LiveState` — État courant de présence et des capteurs
- `History` — Historique des événements
- `Organisations` — Gestion des clients/organisations
- `Sites` / `Buildings` / `Floors` / `Rooms` — Hiérarchie des lieux
- `Capteurs` / `Capteurs-IA` — Gestion des capteurs radar et IA
- `FloorPlan` — Carte interactive des installations
- `Reports` / `Statistics` — Analytique
- `Settings` — Configuration et gestion des utilisateurs

**Contextes React :** `AuthContext`, `ThemeContext`, `WebSocketContext`, `AlertContext`

Fichier client API : `frontend/src/lib/api.js`

### Mobile (`mobile/`)

Application Expo Router avec 4 écrans principaux :
- Login, Alerts, Alert Details, Notifications push

---

## Modèles de données (MongoDB)

Collections principales :
- `users` — Comptes utilisateurs avec rôles RBAC
- `events` — Événements de détection de chute
- `sensors` — Capteurs radar/IA
- `clients` — Organisations de santé
- `buildings` / `floors` / `rooms` — Hiérarchie des lieux
- `alert_rules` — Règles de notification
- `ai_sensors` / `ai_events` — Capteurs et événements IA
- `push_tokens` — Tokens de notification mobile
- `audit_logs` — Traçabilité des actions

---

## Variables d'environnement requises

```env
# MongoDB
MONGO_URL=mongodb://...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=<secret>

# MQTT
MQTT_ENABLED=true
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883

# Frontend
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## Conventions de code

### Python (Backend)
- Style : PEP 8
- Async/await avec `async def` pour toutes les routes FastAPI
- Driver MongoDB asynchrone : Motor (`AsyncIOMotorClient`)
- Validation des données : Pydantic models
- Gestion d'erreurs : `HTTPException` FastAPI
- Redis avec dégradation gracieuse (try/except sans crasher)

### JavaScript/React (Frontend)
- Import alias : `@/` → `src/`
- Composants UI : Shadcn/ui (basé sur Radix UI)
- Styles : Tailwind CSS (pas de CSS inline)
- Formulaires : React Hook Form + Zod
- i18n : i18next (support multilingue)

### Git
- Messages de commit descriptifs en français ou anglais
- Branche de développement : préfixe `claude/`

---

## Points d'attention

1. **`server.py` est très volumineux** (~4 200 lignes) — éviter d'y ajouter du code, préférer des services séparés
2. **Redis est optionnel** — le cache échoue silencieusement, ne pas bloquer dessus
3. **MQTT est configurable** — peut être désactivé via `MQTT_ENABLED=false`
4. **Multi-tenant** — chaque donnée est liée à un `client_id` ou `tenant_id`
5. **RBAC** — toujours vérifier les permissions avant de modifier les routes protégées
6. **Design system** — consulter `design_guidelines.json` pour les couleurs, typographie et composants

---

## Déploiement

Voir `DEPLOY.md` pour les instructions complètes.

Services Docker :
- **backend** : FastAPI sur le port 8001
- **frontend** : Nginx (React build) sur le port 80
- **mongodb** : MongoDB
- **redis** : Redis

```bash
docker-compose up -d
```
