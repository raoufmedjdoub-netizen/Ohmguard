import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      // Common
      app_name: 'OhmGuard',
      app_tagline: 'Fall Detection Management Platform',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      refresh: 'Refresh',
      actions: 'Actions',
      status: 'Status',
      created: 'Created',
      updated: 'Updated',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      all: 'All',
      none: 'None',
      yes: 'Yes',
      no: 'No',
      
      // Navigation
      nav: {
        dashboard: 'Dashboard',
        live: 'Live',
        history: 'History',
        statistics: 'Statistics',
        radars: 'Radars',
        sites: 'Sites & Zones',
        rules: 'Alert Rules',
        users: 'Users',
        notifications: 'Notifications',
        settings: 'Settings',
        simulator: 'Simulator',
        widgets: 'Widgets',
        logout: 'Logout'
      },
      
      // Radars page
      radars: {
        title: 'Vayyar Radars',
        subtitle: 'Manage and monitor your Vayyar radar sensors',
        mqttConnection: 'MQTT Connection',
        connected: 'Connected',
        disconnected: 'Disconnected',
        enabled: 'Enabled',
        disabled: 'Disabled',
        running: 'Running',
        stopped: 'Stopped',
        totalRadars: 'Total Radars',
        autoDetected: 'auto-detected',
        onlineStatus: 'Online Status',
        online: 'Online',
        offline: 'Offline',
        maintenance: 'Maintenance',
        never: 'Never',
        justNow: 'Just now',
        linkDevice: 'Link Device',
        linkDeviceTitle: 'Link MQTT Device',
        linkDeviceDesc: 'Manually link an MQTT device ID to an existing radar',
        deviceId: 'MQTT Device ID',
        targetRadar: 'Target Radar',
        selectRadar: 'Select a radar',
        link: 'Link',
        addRadar: 'Add Radar',
        addRadarTitle: 'Add New Radar',
        addRadarDesc: 'Manually register a new Vayyar radar sensor',
        name: 'Name',
        model: 'Model',
        firmware: 'Firmware',
        site: 'Site',
        zone: 'Zone',
        location: 'Location',
        status: 'Status',
        lastSeen: 'Last Seen',
        actions: 'Actions',
        selectSite: 'Select a site',
        selectZone: 'Select a zone',
        add: 'Add',
        noRadars: 'No radars found',
        searchPlaceholder: 'Search radars...',
        allStatuses: 'All statuses',
        copyKey: 'Copy API Key',
        rotateKey: 'Rotate API Key',
        delete: 'Delete',
        deleteTitle: 'Delete Radar',
        deleteDesc: 'Are you sure you want to delete {{name}}? This action cannot be undone.',
        howItWorks: 'How it works',
        info1: 'Vayyar radars send their data via MQTT protocol',
        info2: 'New devices are automatically detected and registered',
        info3: 'Fall events are created in real-time and broadcast via WebSocket',
        info4: 'You can manually add radars or link MQTT devices',
        fetchError: 'Error loading radars',
        fillRequired: 'Please fill in all required fields',
        fillFields: 'Please fill in all fields',
        radarAdded: 'Radar added successfully',
        addError: 'Error adding radar',
        deviceLinked: 'Device linked successfully',
        linkError: 'Error linking device',
        radarDeleted: 'Radar deleted successfully',
        deleteError: 'Error deleting radar',
        keyRotated: 'API key rotated successfully',
        keyCopied: 'API key copied to clipboard',
        rotateError: 'Error rotating API key'
      },
      
      // Auth
      auth: {
        login: 'Sign In',
        logout: 'Sign Out',
        email: 'Email',
        password: 'Password',
        remember_me: 'Remember me',
        forgot_password: 'Forgot password?',
        login_error: 'Invalid email or password',
        login_success: 'Welcome back!',
        session_expired: 'Session expired. Please login again.'
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashboard',
        overview: 'Overview',
        total_events: 'Total Events',
        new_events: 'New Alerts',
        acknowledged: 'Acknowledged',
        resolved: 'Resolved',
        false_alarms: 'False Alarms',
        total_sensors: 'Total Sensors',
        online_sensors: 'Online',
        total_sites: 'Sites',
        recent_events: 'Recent Events',
        system_health: 'System Health'
      },
      
      // Events
      events: {
        title: 'Events',
        live_title: 'Live Events',
        history_title: 'Event History',
        event_type: 'Type',
        severity: 'Severity',
        confidence: 'Confidence',
        timestamp: 'Timestamp',
        sensor: 'Sensor',
        site: 'Site',
        zone: 'Zone',
        assigned_to: 'Assigned To',
        notes: 'Notes',
        snapshot: 'Snapshot',
        raw_data: 'Raw Data',
        timeline: 'Timeline',
        
        // Types
        type_fall: 'Fall',
        type_pre_fall: 'Pre-Fall',
        type_unknown: 'Unknown',
        
        // Severities
        severity_high: 'High',
        severity_med: 'Medium',
        severity_low: 'Low',
        
        // Statuses
        status_new: 'New',
        status_ack: 'Acknowledged',
        status_resolved: 'Resolved',
        status_false_alarm: 'False Alarm',
        
        // Actions
        acknowledge: 'Acknowledge',
        resolve: 'Resolve',
        mark_false_alarm: 'Mark as False Alarm',
        assign: 'Assign',
        add_note: 'Add Note',
        
        // Messages
        no_events: 'No events found',
        event_updated: 'Event updated successfully',
        event_created: 'New event detected'
      },
      
      // Sensors
      sensors: {
        title: 'Sensors',
        name: 'Name',
        type: 'Type',
        model: 'Model',
        firmware: 'Firmware',
        api_key: 'API Key',
        last_seen: 'Last Seen',
        
        // Types
        type_radar: 'Radar',
        type_camera: 'Camera',
        type_iot: 'IoT',
        
        // Statuses
        status_online: 'Online',
        status_offline: 'Offline',
        status_maintenance: 'Maintenance',
        
        // Actions
        rotate_key: 'Rotate API Key',
        view_events: 'View Events',
        
        // Messages
        no_sensors: 'No sensors configured',
        key_rotated: 'API key rotated successfully',
        sensor_created: 'Sensor created successfully',
        sensor_updated: 'Sensor updated successfully'
      },
      
      // Sites & Zones
      sites: {
        title: 'Sites',
        zones_title: 'Zones',
        name: 'Name',
        address: 'Address',
        floor: 'Floor',
        description: 'Description',
        sensors_count: 'Sensors',
        zones_count: 'Zones',
        
        no_sites: 'No sites configured',
        no_zones: 'No zones configured',
        site_created: 'Site created successfully',
        zone_created: 'Zone created successfully'
      },
      
      // Alert Rules
      rules: {
        title: 'Alert Rules',
        name: 'Rule Name',
        event_types: 'Event Types',
        min_severity: 'Minimum Severity',
        channels: 'Notification Channels',
        webhook_url: 'Webhook URL',
        escalation_minutes: 'Escalation After (min)',
        escalation_group: 'Escalation Group',
        is_active: 'Active',
        
        channel_in_app: 'In-App',
        channel_email: 'Email',
        channel_webhook: 'Webhook',
        
        no_rules: 'No alert rules configured',
        rule_created: 'Rule created successfully',
        rule_deleted: 'Rule deleted successfully'
      },
      
      // Users
      users: {
        title: 'Users',
        full_name: 'Full Name',
        email: 'Email',
        role: 'Role',
        language: 'Language',
        is_active: 'Active',
        
        // Roles
        role_super_admin: 'Super Admin',
        role_tenant_admin: 'Admin',
        role_supervisor: 'Supervisor',
        role_operator: 'Operator',
        role_viewer: 'Viewer',
        
        no_users: 'No users found',
        user_created: 'User created successfully',
        user_updated: 'User updated successfully'
      },
      
      // Notifications
      notifications: {
        title: 'Notification Log',
        channel: 'Channel',
        recipient: 'Recipient',
        message: 'Message',
        no_notifications: 'No notifications'
      },
      
      // Simulator
      simulator: {
        title: 'Event Simulator',
        description: 'Generate test fall events for demonstration purposes',
        select_sensor: 'Select Sensor',
        select_type: 'Event Type',
        select_severity: 'Severity',
        confidence_level: 'Confidence Level',
        generate: 'Generate Event',
        event_generated: 'Test event generated successfully'
      },
      
      // Settings
      settings: {
        title: 'Settings',
        profile: 'Profile',
        appearance: 'Appearance',
        language: 'Language',
        theme: 'Theme',
        theme_light: 'Light',
        theme_dark: 'Dark',
        theme_system: 'System',
        notifications_settings: 'Notification Settings',
        save_success: 'Settings saved successfully'
      },
      
      // Errors
      errors: {
        generic: 'An error occurred',
        network: 'Network error. Please check your connection.',
        unauthorized: 'Unauthorized access',
        forbidden: 'Access denied',
        not_found: 'Resource not found',
        validation: 'Validation error'
      },
      
      // Time
      time: {
        just_now: 'Just now',
        minutes_ago: '{{count}} min ago',
        hours_ago: '{{count}} hours ago',
        days_ago: '{{count}} days ago',
        never: 'Never'
      }
    }
  },
  fr: {
    translation: {
      // Common
      app_name: 'OhmGuard',
      app_tagline: 'Plateforme de Gestion de Détection de Chutes',
      loading: 'Chargement...',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      add: 'Ajouter',
      search: 'Rechercher',
      filter: 'Filtrer',
      export: 'Exporter',
      refresh: 'Actualiser',
      actions: 'Actions',
      status: 'Statut',
      created: 'Créé',
      updated: 'Mis à jour',
      confirm: 'Confirmer',
      back: 'Retour',
      next: 'Suivant',
      all: 'Tous',
      none: 'Aucun',
      yes: 'Oui',
      no: 'Non',
      
      // Navigation
      nav: {
        dashboard: 'Tableau de bord',
        live: 'En direct',
        history: 'Historique',
        statistics: 'Statistiques',
        sensors: 'Capteurs',
        radars: 'Radars Vayyar',
        sites: 'Sites & Zones',
        rules: 'Règles d\'alerte',
        users: 'Utilisateurs',
        notifications: 'Notifications',
        settings: 'Paramètres',
        simulator: 'Simulateur',
        widgets: 'Widgets',
        logout: 'Déconnexion'
      },
      
      // Radars page
      radars: {
        title: 'Radars Vayyar',
        subtitle: 'Gestion des capteurs radar connectés via MQTT',
        mqttConnection: 'Connexion MQTT',
        connected: 'Connecté',
        disconnected: 'Déconnecté',
        enabled: 'Activé',
        disabled: 'Désactivé',
        running: 'En cours',
        stopped: 'Arrêté',
        radarCount: 'Radars',
        online: 'En ligne',
        offline: 'Hors ligne',
        maintenance: 'Maintenance',
        never: 'Jamais',
        justNow: 'À l\'instant',
        minutesAgo: '{{min}} min',
        hoursAgo: '{{hours}}h',
        registerDevice: 'Associer un appareil',
        registerDeviceTitle: 'Associer un appareil MQTT',
        registerDeviceDesc: 'Associez manuellement un device ID MQTT à un capteur existant',
        deviceId: 'Device ID MQTT',
        sensor: 'Capteur cible',
        selectSensor: 'Sélectionner un capteur',
        register: 'Associer',
        configure: 'Configurer',
        noRadars: 'Aucun radar détecté',
        noRadarsDesc: 'Les radars Vayyar seront automatiquement détectés lorsqu\'ils enverront des données via MQTT',
        howItWorks: 'Comment ça marche',
        info1: 'Les radars Vayyar envoient leurs données via le protocole MQTT',
        info2: 'Les nouveaux appareils sont automatiquement détectés et enregistrés',
        info3: 'Les événements de chute sont créés en temps réel et diffusés via WebSocket',
        info4: 'Vous pouvez associer manuellement un device ID à un capteur existant',
        fetchError: 'Erreur lors du chargement des radars',
        fillFields: 'Veuillez remplir tous les champs',
        deviceRegistered: 'Appareil enregistré avec succès',
        registerError: 'Erreur lors de l\'enregistrement'
      },
      
      // Auth
      auth: {
        login: 'Connexion',
        logout: 'Déconnexion',
        email: 'Email',
        password: 'Mot de passe',
        remember_me: 'Se souvenir de moi',
        forgot_password: 'Mot de passe oublié ?',
        login_error: 'Email ou mot de passe invalide',
        login_success: 'Bienvenue !',
        session_expired: 'Session expirée. Veuillez vous reconnecter.'
      },
      
      // Dashboard
      dashboard: {
        title: 'Tableau de bord',
        overview: 'Vue d\'ensemble',
        total_events: 'Total Événements',
        new_events: 'Nouvelles Alertes',
        acknowledged: 'Acquittés',
        resolved: 'Résolus',
        false_alarms: 'Fausses Alarmes',
        total_sensors: 'Total Capteurs',
        online_sensors: 'En ligne',
        total_sites: 'Sites',
        recent_events: 'Événements Récents',
        system_health: 'État du Système'
      },
      
      // Events
      events: {
        title: 'Événements',
        live_title: 'Événements en Direct',
        history_title: 'Historique des Événements',
        event_type: 'Type',
        severity: 'Gravité',
        confidence: 'Confiance',
        timestamp: 'Horodatage',
        sensor: 'Capteur',
        site: 'Site',
        zone: 'Zone',
        assigned_to: 'Assigné à',
        notes: 'Notes',
        snapshot: 'Capture',
        raw_data: 'Données brutes',
        timeline: 'Chronologie',
        
        // Types
        type_fall: 'Chute',
        type_pre_fall: 'Pré-Chute',
        type_unknown: 'Inconnu',
        
        // Severities
        severity_high: 'Élevée',
        severity_med: 'Moyenne',
        severity_low: 'Faible',
        
        // Statuses
        status_new: 'Nouveau',
        status_ack: 'Acquitté',
        status_resolved: 'Résolu',
        status_false_alarm: 'Fausse Alarme',
        
        // Actions
        acknowledge: 'Acquitter',
        resolve: 'Résoudre',
        mark_false_alarm: 'Marquer Fausse Alarme',
        assign: 'Assigner',
        add_note: 'Ajouter une Note',
        
        // Messages
        no_events: 'Aucun événement trouvé',
        event_updated: 'Événement mis à jour',
        event_created: 'Nouvel événement détecté'
      },
      
      // Sensors
      sensors: {
        title: 'Capteurs',
        name: 'Nom',
        type: 'Type',
        model: 'Modèle',
        firmware: 'Firmware',
        api_key: 'Clé API',
        last_seen: 'Dernière vue',
        
        // Types
        type_radar: 'Radar',
        type_camera: 'Caméra',
        type_iot: 'IoT',
        
        // Statuses
        status_online: 'En ligne',
        status_offline: 'Hors ligne',
        status_maintenance: 'Maintenance',
        
        // Actions
        rotate_key: 'Rotation Clé API',
        view_events: 'Voir Événements',
        
        // Messages
        no_sensors: 'Aucun capteur configuré',
        key_rotated: 'Clé API renouvelée',
        sensor_created: 'Capteur créé',
        sensor_updated: 'Capteur mis à jour'
      },
      
      // Sites & Zones
      sites: {
        title: 'Sites',
        zones_title: 'Zones',
        name: 'Nom',
        address: 'Adresse',
        floor: 'Étage',
        description: 'Description',
        sensors_count: 'Capteurs',
        zones_count: 'Zones',
        
        no_sites: 'Aucun site configuré',
        no_zones: 'Aucune zone configurée',
        site_created: 'Site créé',
        zone_created: 'Zone créée'
      },
      
      // Alert Rules
      rules: {
        title: 'Règles d\'Alerte',
        name: 'Nom de la règle',
        event_types: 'Types d\'événements',
        min_severity: 'Gravité minimum',
        channels: 'Canaux de notification',
        webhook_url: 'URL Webhook',
        escalation_minutes: 'Escalade après (min)',
        escalation_group: 'Groupe d\'escalade',
        is_active: 'Active',
        
        channel_in_app: 'In-App',
        channel_email: 'Email',
        channel_webhook: 'Webhook',
        
        no_rules: 'Aucune règle configurée',
        rule_created: 'Règle créée',
        rule_deleted: 'Règle supprimée'
      },
      
      // Users
      users: {
        title: 'Utilisateurs',
        full_name: 'Nom complet',
        email: 'Email',
        role: 'Rôle',
        language: 'Langue',
        is_active: 'Actif',
        
        // Roles
        role_super_admin: 'Super Admin',
        role_tenant_admin: 'Administrateur',
        role_supervisor: 'Superviseur',
        role_operator: 'Opérateur',
        role_viewer: 'Lecteur',
        
        no_users: 'Aucun utilisateur',
        user_created: 'Utilisateur créé',
        user_updated: 'Utilisateur mis à jour'
      },
      
      // Notifications
      notifications: {
        title: 'Journal des Notifications',
        channel: 'Canal',
        recipient: 'Destinataire',
        message: 'Message',
        no_notifications: 'Aucune notification'
      },
      
      // Simulator
      simulator: {
        title: 'Simulateur d\'Événements',
        description: 'Générez des événements de chute de test pour la démonstration',
        select_sensor: 'Sélectionner un capteur',
        select_type: 'Type d\'événement',
        select_severity: 'Gravité',
        confidence_level: 'Niveau de confiance',
        generate: 'Générer l\'événement',
        event_generated: 'Événement de test généré'
      },
      
      // Settings
      settings: {
        title: 'Paramètres',
        profile: 'Profil',
        appearance: 'Apparence',
        language: 'Langue',
        theme: 'Thème',
        theme_light: 'Clair',
        theme_dark: 'Sombre',
        theme_system: 'Système',
        notifications_settings: 'Paramètres de notification',
        save_success: 'Paramètres enregistrés'
      },
      
      // Errors
      errors: {
        generic: 'Une erreur s\'est produite',
        network: 'Erreur réseau. Vérifiez votre connexion.',
        unauthorized: 'Accès non autorisé',
        forbidden: 'Accès refusé',
        not_found: 'Ressource non trouvée',
        validation: 'Erreur de validation'
      },
      
      // Time
      time: {
        just_now: 'À l\'instant',
        minutes_ago: 'Il y a {{count}} min',
        hours_ago: 'Il y a {{count}} heures',
        days_ago: 'Il y a {{count}} jours',
        never: 'Jamais'
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
