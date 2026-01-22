# OhmGuard Mobile - Application d'Alertes

## 📱 Application React Native / Expo

Application mobile simplifiée pour la réception et l'acquittement des alertes de chute.

## Fonctionnalités

- ✅ Authentification JWT
- ✅ Liste des alertes de chute
- ✅ Détail d'une alerte
- ✅ Acquittement des alertes
- ✅ Temps réel via WebSocket
- ✅ Notifications push

## Prérequis

- Node.js 18+
- Expo CLI
- Compte Expo (pour les builds)

## Installation

```bash
cd mobile
npm install
# ou
yarn install
```

## Développement

```bash
# Démarrer le serveur de développement
npx expo start

# Android
npx expo start --android

# iOS
npx expo start --ios
```

## Configuration

### 1. URL Backend

Modifier `src/api/client.ts` :
```typescript
const API_URL = 'https://app.ohmguard.fr/api';
```

### 2. Notifications Push

1. Créer un projet sur [Expo](https://expo.dev)
2. Remplacer `projectId` dans :
   - `app.json`
   - `src/services/notifications.ts`

### 3. Firebase (Android)

1. Créer un projet Firebase
2. Télécharger `google-services.json`
3. Le placer à la racine `/mobile/`

## Build Production

### Configuration EAS

```bash
# Installer EAS CLI
npm install -g eas-cli

# Se connecter
eas login

# Configurer le projet
eas build:configure
```

### Build Android

```bash
# APK de développement
eas build --platform android --profile preview

# AAB pour Google Play
eas build --platform android --profile production
```

### Build iOS

```bash
# Simulateur
eas build --platform ios --profile preview

# App Store
eas build --platform ios --profile production
```

## Structure

```
mobile/
├── app/                 # Écrans (Expo Router)
│   ├── _layout.tsx     # Layout principal
│   ├── index.tsx       # Login
│   ├── alerts.tsx      # Liste alertes
│   └── alert/[id].tsx  # Détail alerte
├── src/
│   ├── api/            # Client API
│   ├── hooks/          # Hooks React
│   ├── services/       # Notifications
│   └── types/          # TypeScript
└── assets/             # Images, sons
```

## API Backend Requises

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/auth/login` | POST | Authentification |
| `/api/auth/me` | GET | Utilisateur courant |
| `/api/events` | GET | Liste des événements |
| `/api/events/{id}` | GET | Détail événement |
| `/api/events/{id}/acknowledge` | POST | Acquitter |

## WebSocket

L'app se connecte au WebSocket pour recevoir les alertes en temps réel :
- Event: `new_event` / `new_radar_event`
- Filtre: `type === 'FALL'`

## Licence

Propriétaire - OhmGuard
