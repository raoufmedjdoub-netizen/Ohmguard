import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
  LogOut,
  Sun,
  Moon,
  Shield,
  ChevronLeft,
  ChevronRight,
  Globe,
  BarChart3,
  LayoutGrid,
  Radar,
  Building2
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/live', icon: Radio, labelKey: 'nav.live' },
  { path: '/history', icon: History, labelKey: 'nav.history' },
  { path: '/statistics', icon: BarChart3, labelKey: 'nav.statistics' },
  { path: '/radars', icon: Radar, labelKey: 'nav.radars' },
  { path: '/clients', icon: Building2, labelKey: 'nav.clients' },
  { path: '/rules', icon: Bell, labelKey: 'nav.rules', requireAdmin: true },
  { path: '/users', icon: Users, labelKey: 'nav.users', requireAdmin: true },
  { path: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
  { path: '/simulator', icon: Play, labelKey: 'nav.simulator', requireOperator: true },
  { path: '/simulator/presence', icon: Radio, labelKey: 'nav.presence_simulator', requireOperator: true },
  { path: '/widgets', icon: LayoutGrid, labelKey: 'nav.widgets' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' }
];

export function Sidebar({ collapsed, setCollapsed }) {
  const { t, i18n } = useTranslation();
  const { user, logout, canManageUsers, canManageRules, isOperator } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(newLang);
  };

  const filteredNavItems = navItems.filter(item => {
    if (item.requireAdmin && !canManageUsers) return false;
    if (item.requireOperator && !isOperator) return false;
    return true;
  });

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-border transition-all duration-300',
        'bg-[#1E3A5F] text-white',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-[#06B6D4]" />
            <span className="font-bold text-xl tracking-tight text-white">OhmGuard</span>
          </div>
        )}
        {collapsed && <Shield className="h-8 w-8 text-[#06B6D4] mx-auto" />}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-toggle"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto h-[calc(100vh-180px)]">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`nav-${item.path.replace('/', '')}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                'hover:bg-white/10',
                isActive
                  ? 'bg-[#06B6D4] text-white font-medium'
                  : 'text-white/70'
              )
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/10 bg-[#1E3A5F] space-y-2">
        <div className={cn('flex gap-2', collapsed ? 'flex-col items-center' : 'justify-between')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLanguage}
            className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
            data-testid="language-toggle"
          >
            <Globe className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-white/10"
            data-testid="logout-btn"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        {!collapsed && user && (
          <div className="text-xs text-white/50 truncate px-2">
            {user.email}
          </div>
        )}
      </div>
    </aside>
  );
}
