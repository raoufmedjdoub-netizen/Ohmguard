# OhmGuard Mobile - Application d'Alertes

Application mobile React Native (Expo) pour la réception et l'acquittement des alertes de chute OhmGuard.

## 🎯 Fonctionnalités

- **Connexion sécurisée** avec les identifiants OhmGuard
- **Liste des alertes** en temps réel (chutes détectées)
- **Acquittement des alertes** avec confirmation
- **Notifications push** pour les nouvelles alertes
- **WebSocket** pour les mises à jour en temps réel
- **Mode hors ligne** avec synchronisation au retour

## 📱 Écrans

1. **Login** - Connexion avec email/mot de passe
2. **Alertes** - Liste des alertes actives et acquittées
3. **Détail Alerte** - Informations détaillées + bouton acquitter

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Application Expo Go sur votre téléphone (pour le développement)

### Installation

```bash
cd /app/mobile
yarn install
```

### Développement

```bash
# Démarrer le serveur de développement Expo
npx expo start

# Scanner le QR code avec Expo Go (Android) ou Camera (iOS)
```

### Test avec identifiants

```
Email: admin@ohmguard.io
Password: admin123
```

## 🔧 Configuration

### URL de l'API

L'URL de l'API est configurée dans `app.json` :

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://sensor-hierarchy.preview.emergentagent.com/api"
    }
  }
}
```

Pour la production, modifier cette URL vers le serveur déployé.

### Notifications Push

1. Créer un projet sur [Expo EAS](https://expo.dev)
2. Configurer `projectId` dans `app.json` et `eas.json`
3. Les notifications locales fonctionnent sans configuration

## 📦 Build pour distribution

### Android (APK/AAB)

```bash
# Installation EAS CLI
npm install -g eas-cli

# Login Expo
eas login

# Build APK pour test interne
eas build --platform android --profile preview

# Build AAB pour Play Store
eas build --platform android --profile production
```

### iOS (IPA)

```bash
# Nécessite un compte Apple Developer
eas build --platform ios --profile production
```

## 🏗️ Architecture

```
/app/mobile/
├── app/                    # Écrans (Expo Router)
│   ├── _layout.tsx        # Layout racine
│   ├── index.tsx          # Écran Login
│   ├── alerts.tsx         # Liste des alertes
│   └── alert/
│       └── [id].tsx       # Détail alerte
├── src/
│   ├── api/
│   │   └── client.ts      # Client API
│   ├── hooks/
│   │   ├── useAuth.ts     # Hook authentification
│   │   ├── useAlerts.ts   # Hook gestion alertes
│   │   └── useWebSocket.ts # Hook WebSocket
│   ├── services/
│   │   └── notifications.ts # Service notifications
│   └── types/
│       └── index.ts       # Types TypeScript
├── app.json               # Configuration Expo
├── eas.json               # Configuration EAS Build
└── package.json           # Dépendances
```

## 🔌 API Endpoints utilisés

- `POST /api/auth/login` - Connexion
- `GET /api/auth/me` - Utilisateur courant
- `GET /api/events?event_type=FALL` - Liste des alertes
- `GET /api/events/:id` - Détail alerte
- `POST /api/events/:id/acknowledge` - Acquitter une alerte

## 🎨 Design

- **Thème sombre** pour usage 24/7
- **Rouge #DC2626** pour les alertes actives
- **Animations** pour l'état de connexion
- **Pull-to-refresh** pour actualiser

## 📝 Notes

- L'application nécessite une connexion Internet
- Les notifications push nécessitent un appareil physique
- Le WebSocket se reconnecte automatiquement en cas de déconnexion
- Les alertes sont triées par date (plus récentes en premier)
