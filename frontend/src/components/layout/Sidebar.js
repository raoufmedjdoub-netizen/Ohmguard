/**
 * Sidebar - Navigation latérale
 * 
 * Positionnée sous la navbar principale (top: 56px / 3.5rem)
 * Contient uniquement les liens de navigation
 * Responsive: overlay sur mobile, fixe sur desktop
 */
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Radio,
  History,
  Bell,
  Users,
  Settings,
  Play,
  PanelLeftClose,
  PanelLeft,
  BarChart3,
  LayoutGrid,
  Radar,
  Building2,
  AlertTriangle,
  Wifi,
  X,
  FileText,
  Layers,
  Map,
  Camera,
  Activity
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/live', icon: Wifi, labelKey: 'nav.live' },
  { path: '/live-state', icon: Activity, labelKey: 'nav.live_state' },
  { path: '/history', icon: History, labelKey: 'nav.history' },
  { path: '/reports', icon: FileText, labelKey: 'nav.reports' },
  { path: '/statistics', icon: BarChart3, labelKey: 'nav.statistics' },
  { path: '/capteurs', icon: Radar, labelKey: 'nav.sensors' },
  { path: '/capteurs-ia', icon: Camera, labelKey: 'nav.ai_sensors' },
  { path: '/organisations', icon: Building2, labelKey: 'nav.organisations' },
  { path: '/sites-batiments', icon: Layers, labelKey: 'nav.sites_buildings' },
  { path: '/carte', icon: Map, labelKey: 'nav.floor_plan' },
  { path: '/alert-rules', icon: AlertTriangle, labelKey: 'nav.alert_rules', requireAdmin: true },
  { path: '/users', icon: Users, labelKey: 'nav.users', requireAdmin: true },
  { path: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
  { path: '/simulator', icon: Play, labelKey: 'nav.simulator', requireOperator: true },
  { path: '/presence-simulator', icon: Radio, labelKey: 'nav.presence_simulator', requireOperator: true },
  { path: '/widgets', icon: LayoutGrid, labelKey: 'nav.widgets' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' }
];

export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { t } = useTranslation();
  const { canManageUsers, isOperator } = useAuth();

  const filteredNavItems = navItems.filter(item => {
    if (item.requireAdmin && !canManageUsers) return false;
    if (item.requireOperator && !isOperator) return false;
    return true;
  });

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] border-r border-border transition-all duration-300 flex flex-col',
        'bg-[#1E3A5F]',
        // Desktop
        'hidden lg:flex',
        collapsed ? 'lg:w-16' : 'lg:w-64',
        // Mobile: slide-in depuis la gauche
        mobileOpen && 'flex w-64 shadow-2xl'
      )}
    >
      {/* Header mobile uniquement - bouton fermer */}
      <div className="flex items-center justify-end h-10 px-2 border-b border-white/10 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => setMobileOpen(false)}
          data-testid="sidebar-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto scrollbar-thin">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`nav-${item.path.replace('/', '').replace('/', '-')}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                'hover:bg-white/10',
                isActive
                  ? 'bg-[#06B6D4] text-white font-medium shadow-lg shadow-[#06B6D4]/20'
                  : 'text-white/70 hover:text-white'
              )
            }
            title={collapsed ? t(item.labelKey, item.labelKey.split('.').pop()) : undefined}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {(!collapsed || mobileOpen) && (
              <span className="truncate text-sm">
                {t(item.labelKey, item.labelKey.split('.').pop())}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bouton collapse en bas (desktop uniquement) */}
      <div className="hidden lg:block border-t border-white/10 p-2">
        <Button
          variant="ghost"
          className={cn(
            'w-full h-9 text-white/60 hover:text-white hover:bg-white/10 transition-all',
            collapsed ? 'justify-center px-0' : 'justify-start px-3'
          )}
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-toggle"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 mr-2" />
              <span className="text-xs">{t('nav.collapse_menu', 'Réduire le menu')}</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

export default Sidebar;
