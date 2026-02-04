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
        home: 'Home',
        dashboard: 'Dashboard',
        dashboard_desc: 'System overview',
        live: 'Live',
        live_desc: 'Real-time events',
        history: 'History',
        history_desc: 'Alert history',
        reports: 'Reports',
        reports_desc: 'Event reports generation',
        statistics: 'Statistics',
        statistics_desc: 'Reports and analytics',
        sensors: 'Sensors',
        sensors_desc: 'Sensor management',
        radars: 'Sensors',
        radars_desc: 'Sensor management',
        organisations: 'Organisations',
        organisations_desc: 'Organisation management',
        clients: 'Organisations',
        clients_desc: 'Organisation management',
        sites_buildings: 'Sites & Buildings',
        sites_buildings_desc: 'Building and floor management',
        sites: 'Sites & Zones',
        alert_rules: 'Alert Rules',
        alert_rules_desc: 'Alert configuration',
        rules: 'Alert Rules',
        users: 'Users',
        users_desc: 'User management',
        notifications: 'Notifications',
        notifications_desc: 'Notification center',
        settings: 'Settings',
        settings_desc: 'System settings',
        simulator: 'Simulator',
        simulator_desc: 'Event simulator',
        presence_simulator: 'Presence Simulator',
        presence_simulator_desc: 'Presence simulation',
        widgets: 'Widgets',
        widgets_desc: 'Custom widgets',
        logout: 'Logout',
        collapse_menu: 'Collapse menu',
        expand_menu: 'Expand menu'
      },
      
      // Theme
      theme: {
        light: 'Light mode',
        dark: 'Dark mode'
      },
      
      // Radars page (now Sensors/Capteurs)
      radars: {
        title: 'Sensors',
        subtitle: 'Manage and monitor your fall detection sensors',
        mqttConnection: 'MQTT Connection',
        connected: 'Connected',
        disconnected: 'Disconnected',
        enabled: 'Enabled',
        disabled: 'Disabled',
        running: 'Running',
        stopped: 'Stopped',
        totalRadars: 'Total Sensors',
        autoDetected: 'auto-detected',
        onlineStatus: 'Online Status',
        online: 'Online',
        offline: 'Offline',
        maintenance: 'Maintenance',
        never: 'Never',
        justNow: 'Just now',
        linkDevice: 'Link Device',
        linkDeviceTitle: 'Link MQTT Device',
        linkDeviceDesc: 'Manually link an MQTT device ID to an existing sensor',
        deviceId: 'MQTT Device ID',
        targetRadar: 'Target Sensor',
        selectRadar: 'Select a radar',
        link: 'Link',
        addRadar: 'Add Radar',
        addRadarTitle: 'Add New Radar',
        addRadarDesc: 'Manually register a new Vayyar radar sensor',
        name: 'Name (optional)',
        serialProduct: 'Serial Number',
        serialProductHelp: 'The serialProduct from the radar (e.g., VPRD-XXXX-XXXX)',
        mqttDeviceId: 'MQTT Device ID (optional)',
        mqttDeviceIdHelp: 'The deviceId used for MQTT communications. If empty, serial number will be used.',
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
        configure: 'Configure',
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
        total_clients: 'Clients',
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
        location: 'Location',
        site: 'Site',
        zone: 'Zone',
        assigned_to: 'Assigned To',
        notes: 'Notes',
        snapshot: 'Snapshot',
        raw_data: 'Raw Data',
        timeline: 'Timeline',
        presence: 'Presence',
        active_regions: 'Active Regions',
        target_count: 'Target Count',
        details: 'Details',
        view_details: 'View Details',
        raw_payload: 'Raw Payload',
        occurred_at: 'Occurred At',
        no_active_regions: 'No active regions',
        no_targets: 'No targets detected',
        presence_detected: 'Presence detected',
        no_presence: 'No presence',
        
        // Types
        type_fall: 'Fall',
        type_pre_fall: 'Pre-Fall',
        type_presence: 'Presence',
        type_inactivity: 'Inactivity',
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
      
      // History page filters
      history: {
        client: 'Client',
        building: 'Building',
        all_clients: 'All clients',
        all_buildings: 'All buildings',
        select_client_first: 'Select a client first'
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
      
      // Reports
      reports: {
        title: 'Event Report',
        filters: 'Report Filters',
        generate: 'Generate Report',
        generating: 'Generating...',
        preview: 'Report Preview',
        print_pdf: 'Print / PDF',
        export_csv: 'Export CSV',
        start_date: 'Start Date',
        end_date: 'End Date',
        period: 'Period',
        location: 'Location',
        client: 'Client',
        building: 'Building',
        floor: 'Floor',
        device: 'Device',
        event_types: 'Event Types',
        severity: 'Severity',
        statuses: 'Statuses',
        generated_at: 'Generated on',
        generated_by: 'By',
        executive_summary: 'Executive Summary',
        total_events: 'Total Events',
        by_type: 'By Type',
        by_status: 'By Status',
        count: 'Count',
        avg_ack_time: 'Average Acknowledgment Time',
        seconds: 'seconds',
        minutes: 'minutes',
        top_zones: 'Top 5 Zones with Most Events',
        event_details: 'Event Details',
        no_events: 'No events for this period',
        and_more: 'and',
        more_events: 'more events',
        annexes: 'Annexes',
        complete_list: 'Complete Event List',
        meta_info: 'Technical Information',
        platform_version: 'Platform Version',
        report_id: 'Report ID',
        total_events_exported: 'Events Exported',
        gdpr_notice: 'GDPR Compliance',
        gdpr_text: 'This report may contain personal data. In accordance with GDPR, this data must be treated confidentially and not retained beyond the time necessary for processing.',
        acknowledged: 'Acknowledged',
        by: 'by',
        notes: 'Notes',
        generated_success: 'Report generated successfully',
        generation_error: 'Error generating report',
        feature: 'Feature',
        event_reports: 'Event Reports',
        period_selection: 'Period Selection',
        custom_range: 'Custom Range',
        export_formats: 'Export Formats',
        how_it_works: 'How does it work?',
        step1: 'Select the period and desired filters',
        step2: 'Click "Generate Report"',
        step3: 'Preview the report then export to PDF or CSV',
        print_tip: 'Tip: Use "Print / PDF" then choose "Save as PDF" in the print dialog'
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
        home: 'Accueil',
        dashboard: 'Tableau de bord',
        dashboard_desc: 'Vue d\'ensemble du système',
        live: 'En direct',
        live_desc: 'Événements en temps réel',
        history: 'Historique',
        history_desc: 'Historique des alertes',
        reports: 'Rapports',
        reports_desc: 'Génération de rapports d\'événements',
        statistics: 'Statistiques',
        statistics_desc: 'Rapports et analyses',
        radars: 'Radars',
        radars_desc: 'Gestion des capteurs',
        clients: 'Clients & Bâtiments',
        clients_desc: 'Gestion des clients et bâtiments',
        sites: 'Sites & Zones',
        alert_rules: 'Règles d\'alerte',
        alert_rules_desc: 'Configuration des alertes',
        rules: 'Règles d\'alerte',
        users: 'Utilisateurs',
        users_desc: 'Gestion des utilisateurs',
        notifications: 'Notifications',
        notifications_desc: 'Centre de notifications',
        settings: 'Paramètres',
        settings_desc: 'Paramètres système',
        simulator: 'Simulateur',
        simulator_desc: 'Simulateur d\'événements',
        presence_simulator: 'Simulateur Présence',
        presence_simulator_desc: 'Simulation de présence',
        widgets: 'Widgets',
        widgets_desc: 'Widgets personnalisés',
        logout: 'Déconnexion',
        collapse_menu: 'Réduire le menu',
        expand_menu: 'Agrandir le menu'
      },
      
      // Theme
      theme: {
        light: 'Mode clair',
        dark: 'Mode sombre'
      },
      
      // Radars page
      radars: {
        title: 'Radars Vayyar',
        subtitle: 'Gérez et surveillez vos capteurs radar Vayyar',
        mqttConnection: 'Connexion MQTT',
        connected: 'Connecté',
        disconnected: 'Déconnecté',
        enabled: 'Activé',
        disabled: 'Désactivé',
        running: 'En cours',
        stopped: 'Arrêté',
        totalRadars: 'Total Radars',
        autoDetected: 'auto-détectés',
        onlineStatus: 'Statut en ligne',
        online: 'En ligne',
        offline: 'Hors ligne',
        maintenance: 'Maintenance',
        never: 'Jamais',
        justNow: 'À l\'instant',
        linkDevice: 'Lier un appareil',
        linkDeviceTitle: 'Lier un appareil MQTT',
        linkDeviceDesc: 'Associez manuellement un device ID MQTT à un radar existant',
        deviceId: 'Device ID MQTT',
        targetRadar: 'Radar cible',
        selectRadar: 'Sélectionner un radar',
        link: 'Lier',
        addRadar: 'Ajouter un radar',
        addRadarTitle: 'Ajouter un nouveau radar',
        addRadarDesc: 'Enregistrez manuellement un nouveau capteur radar Vayyar',
        name: 'Nom (optionnel)',
        serialProduct: 'Numéro de série',
        serialProductHelp: 'Le serialProduct du radar (ex: VPRD-XXXX-XXXX)',
        mqttDeviceId: 'Device ID MQTT (optionnel)',
        mqttDeviceIdHelp: 'Le deviceId utilisé pour les communications MQTT. Si vide, le numéro de série sera utilisé.',
        model: 'Modèle',
        firmware: 'Firmware',
        site: 'Site',
        zone: 'Zone',
        location: 'Emplacement',
        status: 'Statut',
        lastSeen: 'Dernière activité',
        actions: 'Actions',
        selectSite: 'Sélectionner un site',
        selectZone: 'Sélectionner une zone',
        add: 'Ajouter',
        noRadars: 'Aucun radar trouvé',
        searchPlaceholder: 'Rechercher des radars...',
        allStatuses: 'Tous les statuts',
        copyKey: 'Copier la clé API',
        rotateKey: 'Renouveler la clé API',
        configure: 'Configurer',
        delete: 'Supprimer',
        deleteTitle: 'Supprimer le radar',
        deleteDesc: 'Êtes-vous sûr de vouloir supprimer {{name}} ? Cette action est irréversible.',
        howItWorks: 'Comment ça marche',
        info1: 'Les radars Vayyar envoient leurs données via le protocole MQTT',
        info2: 'Les nouveaux appareils sont automatiquement détectés et enregistrés',
        info3: 'Les événements de chute sont créés en temps réel et diffusés via WebSocket',
        info4: 'Vous pouvez ajouter des radars manuellement ou lier des appareils MQTT',
        fetchError: 'Erreur lors du chargement des radars',
        fillRequired: 'Veuillez remplir tous les champs obligatoires',
        fillFields: 'Veuillez remplir tous les champs',
        radarAdded: 'Radar ajouté avec succès',
        addError: 'Erreur lors de l\'ajout du radar',
        deviceLinked: 'Appareil lié avec succès',
        linkError: 'Erreur lors de la liaison',
        radarDeleted: 'Radar supprimé avec succès',
        deleteError: 'Erreur lors de la suppression',
        keyRotated: 'Clé API renouvelée avec succès',
        keyCopied: 'Clé API copiée dans le presse-papiers',
        rotateError: 'Erreur lors du renouvellement de la clé'
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
        total_clients: 'Clients',
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
        location: 'Emplacement',
        site: 'Site',
        zone: 'Zone',
        assigned_to: 'Assigné à',
        notes: 'Notes',
        snapshot: 'Capture',
        raw_data: 'Données brutes',
        timeline: 'Chronologie',
        presence: 'Présence',
        active_regions: 'Zones actives',
        target_count: 'Nombre de cibles',
        details: 'Détails',
        view_details: 'Voir détails',
        raw_payload: 'Payload brut',
        occurred_at: 'Survenu à',
        no_active_regions: 'Aucune zone active',
        no_targets: 'Aucune cible détectée',
        presence_detected: 'Présence détectée',
        no_presence: 'Aucune présence',
        
        // Types
        type_fall: 'Chute',
        type_pre_fall: 'Pré-Chute',
        type_presence: 'Présence',
        type_inactivity: 'Inactivité',
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
      
      // History page filters
      history: {
        client: 'Client',
        building: 'Bâtiment',
        all_clients: 'Tous les clients',
        all_buildings: 'Tous les bâtiments',
        select_client_first: 'Sélectionnez un client'
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
      
      // Reports
      reports: {
        title: 'Rapport d\'événements',
        filters: 'Filtres du rapport',
        generate: 'Générer le rapport',
        generating: 'Génération en cours...',
        preview: 'Aperçu du rapport',
        print_pdf: 'Imprimer / PDF',
        export_csv: 'Exporter CSV',
        start_date: 'Date de début',
        end_date: 'Date de fin',
        period: 'Période',
        location: 'Localisation',
        client: 'Client',
        building: 'Bâtiment',
        floor: 'Étage',
        device: 'Capteur',
        event_types: 'Types d\'événements',
        severity: 'Criticité',
        statuses: 'Statuts',
        generated_at: 'Généré le',
        generated_by: 'Par',
        executive_summary: 'Résumé Exécutif',
        total_events: 'Total événements',
        by_type: 'Par type',
        by_status: 'Par statut',
        count: 'Nombre',
        avg_ack_time: 'Temps moyen d\'acquittement',
        seconds: 'secondes',
        minutes: 'minutes',
        top_zones: 'Top 5 zones avec le plus d\'événements',
        event_details: 'Détails des événements',
        no_events: 'Aucun événement sur cette période',
        and_more: 'et',
        more_events: 'événements supplémentaires',
        annexes: 'Annexes',
        complete_list: 'Liste complète des événements',
        meta_info: 'Informations techniques',
        platform_version: 'Version plateforme',
        report_id: 'Identifiant rapport',
        total_events_exported: 'Événements exportés',
        gdpr_notice: 'Conformité RGPD',
        gdpr_text: 'Ce rapport peut contenir des données personnelles. Conformément au RGPD, ces données doivent être traitées de manière confidentielle et ne doivent pas être conservées au-delà de la durée nécessaire à leur traitement.',
        acknowledged: 'Acquitté',
        by: 'par',
        notes: 'Notes',
        generated_success: 'Rapport généré avec succès',
        generation_error: 'Erreur lors de la génération du rapport',
        feature: 'Fonctionnalité',
        event_reports: 'Rapports d\'événements',
        period_selection: 'Sélection période',
        custom_range: 'Plage personnalisée',
        export_formats: 'Formats d\'export',
        how_it_works: 'Comment ça marche ?',
        step1: 'Sélectionnez la période et les filtres souhaités',
        step2: 'Cliquez sur "Générer le rapport"',
        step3: 'Prévisualisez le rapport puis exportez en PDF ou CSV',
        print_tip: 'Conseil : Utilisez "Imprimer / PDF" puis choisissez "Enregistrer au format PDF" dans la boîte de dialogue d\'impression'
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
