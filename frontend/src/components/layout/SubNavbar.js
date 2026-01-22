/**
 * SubNavbar - Sous-barre de navigation contextuelle
 * 
 * Affiche dynamiquement selon la page:
 * - Titre de la page
 * - Fil d'Ariane (breadcrumb)
 * - Description/statut
 * - Actions spécifiques
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  ChevronRight, 
  Home,
  LayoutDashboard,
  Radio,
  History,
  BarChart3,
  Building2,
  Bell,
  Users,
  Settings,
  AlertTriangle,
  Play,
  Wifi,
  Grid3X3
} from 'lucide-react';

// Configuration des pages avec leurs métadonnées
const PAGE_CONFIG = {
  '/dashboard': {
    icon: LayoutDashboard,
    titleKey: 'nav.dashboard',
    descriptionKey: 'nav.dashboard_desc',
    breadcrumb: [{ labelKey: 'nav.dashboard', path: '/dashboard' }]
  },
  '/live': {
    icon: Wifi,
    titleKey: 'nav.live',
    descriptionKey: 'nav.live_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.live', path: '/live' }
    ]
  },
  '/history': {
    icon: History,
    titleKey: 'nav.history',
    descriptionKey: 'nav.history_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.history', path: '/history' }
    ]
  },
  '/statistics': {
    icon: BarChart3,
    titleKey: 'nav.statistics',
    descriptionKey: 'nav.statistics_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.statistics', path: '/statistics' }
    ]
  },
  '/radars': {
    icon: Radio,
    titleKey: 'nav.radars',
    descriptionKey: 'nav.radars_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.radars', path: '/radars' }
    ]
  },
  '/clients': {
    icon: Building2,
    titleKey: 'nav.clients',
    descriptionKey: 'nav.clients_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.clients', path: '/clients' }
    ]
  },
  '/alert-rules': {
    icon: AlertTriangle,
    titleKey: 'nav.alert_rules',
    descriptionKey: 'nav.alert_rules_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.alert_rules', path: '/alert-rules' }
    ]
  },
  '/users': {
    icon: Users,
    titleKey: 'nav.users',
    descriptionKey: 'nav.users_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.users', path: '/users' }
    ]
  },
  '/notifications': {
    icon: Bell,
    titleKey: 'nav.notifications',
    descriptionKey: 'nav.notifications_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.notifications', path: '/notifications' }
    ]
  },
  '/simulator': {
    icon: Play,
    titleKey: 'nav.simulator',
    descriptionKey: 'nav.simulator_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.simulator', path: '/simulator' }
    ]
  },
  '/presence-simulator': {
    icon: Radio,
    titleKey: 'nav.presence_simulator',
    descriptionKey: 'nav.presence_simulator_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.presence_simulator', path: '/presence-simulator' }
    ]
  },
  '/widgets': {
    icon: Grid3X3,
    titleKey: 'nav.widgets',
    descriptionKey: 'nav.widgets_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.widgets', path: '/widgets' }
    ]
  },
  '/settings': {
    icon: Settings,
    titleKey: 'nav.settings',
    descriptionKey: 'nav.settings_desc',
    breadcrumb: [
      { labelKey: 'nav.dashboard', path: '/dashboard' },
      { labelKey: 'nav.settings', path: '/settings' }
    ]
  },
};

// Descriptions par défaut si non traduites
const DEFAULT_DESCRIPTIONS = {
  '/dashboard': 'Vue d\'ensemble du système',
  '/live': 'Événements en temps réel',
  '/history': 'Historique des alertes',
  '/statistics': 'Statistiques et rapports',
  '/radars': 'Gestion des capteurs',
  '/clients': 'Clients et bâtiments',
  '/alert-rules': 'Configuration des alertes',
  '/users': 'Gestion des utilisateurs',
  '/notifications': 'Centre de notifications',
  '/simulator': 'Simulateur d\'événements',
  '/presence-simulator': 'Simulateur de présence',
  '/widgets': 'Widgets personnalisés',
  '/settings': 'Paramètres système',
};

export function SubNavbar({ actions }) {
  const { t } = useTranslation();
  const location = useLocation();
  
  // Trouver la config de la page courante
  const currentPath = location.pathname;
  const pageConfig = PAGE_CONFIG[currentPath] || {
    icon: Home,
    titleKey: 'nav.dashboard',
    descriptionKey: '',
    breadcrumb: []
  };

  const PageIcon = pageConfig.icon;
  const pageTitle = t(pageConfig.titleKey, pageConfig.titleKey.split('.').pop());
  const pageDescription = t(pageConfig.descriptionKey, DEFAULT_DESCRIPTIONS[currentPath] || '');

  return (
    <div 
      className="bg-white dark:bg-slate-900 border-b border-border shadow-sm"
      data-testid="sub-navbar"
    >
      <div className="px-6 py-3">
        {/* Fil d'Ariane */}
        <nav 
          className="flex items-center gap-1 text-xs text-muted-foreground mb-2"
          aria-label="Breadcrumb"
          data-testid="breadcrumb"
        >
          <Link 
            to="/dashboard" 
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Home className="h-3 w-3" />
            <span className="hidden sm:inline">{t('nav.home', 'Accueil')}</span>
          </Link>
          
          {pageConfig.breadcrumb.map((item, index) => (
            <React.Fragment key={item.path}>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              {index === pageConfig.breadcrumb.length - 1 ? (
                <span className="text-foreground font-medium">
                  {t(item.labelKey, item.labelKey.split('.').pop())}
                </span>
              ) : (
                <Link 
                  to={item.path}
                  className="hover:text-foreground transition-colors"
                >
                  {t(item.labelKey, item.labelKey.split('.').pop())}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Titre et description */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#06B6D4]/10">
              <PageIcon className="h-5 w-5 text-[#06B6D4]" />
            </div>
            <div>
              <h1 
                className="text-lg font-semibold text-[#1E3A5F] dark:text-white"
                data-testid="page-title"
              >
                {pageTitle}
              </h1>
              {pageDescription && (
                <p 
                  className="text-xs text-muted-foreground"
                  data-testid="page-description"
                >
                  {pageDescription}
                </p>
              )}
            </div>
          </div>

          {/* Actions spécifiques à la page */}
          {actions && (
            <div className="flex items-center gap-2" data-testid="page-actions">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubNavbar;
