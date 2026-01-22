/**
 * Navbar - Barre de navigation principale
 * 
 * Position fixe en haut, contient:
 * - Bouton menu (mobile)
 * - Logo à gauche
 * - Sélecteur de langue, mode nuit, déconnexion à droite
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { 
  Shield, 
  Sun, 
  Moon, 
  LogOut, 
  Globe, 
  ChevronDown,
  Wifi,
  WifiOff,
  Menu
} from 'lucide-react';

// Langues disponibles
const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function Navbar({ onMenuClick, showMenuButton }) {
  const { t, i18n } = useTranslation();
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { connected } = useWebSocket();

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('language', langCode);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <nav 
      className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1E3A5F] border-b border-white/10 shadow-lg"
      data-testid="main-navbar"
    >
      <div className="h-full px-4 flex items-center justify-between">
        {/* Gauche: Menu burger + Logo */}
        <div className="flex items-center gap-2">
          {/* Bouton menu hamburger (mobile uniquement) */}
          {showMenuButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 lg:hidden"
              data-testid="navbar-menu-btn"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          
          <Link 
            to="/dashboard" 
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
            data-testid="navbar-logo"
          >
            <Shield className="h-7 w-7 text-[#06B6D4]" />
            <span className="font-bold text-lg text-white tracking-tight">
              OhmGuard
            </span>
          </Link>
        </div>

        {/* Actions à droite */}
        <div className="flex items-center gap-2">
          {/* Indicateur de connexion */}
          <div
            className={cn(
              'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mr-2',
              connected
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            )}
            data-testid="navbar-connection-status"
          >
            {connected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Sélecteur de langue */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 px-2 text-white/80 hover:text-white hover:bg-white/10"
                data-testid="navbar-language-btn"
              >
                <Globe className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">{currentLang.flag} {currentLang.code.toUpperCase()}</span>
                <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'cursor-pointer',
                    i18n.language === lang.code && 'bg-accent'
                  )}
                  data-testid={`navbar-lang-${lang.code}`}
                >
                  <span className="mr-2">{lang.flag}</span>
                  {lang.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Toggle Mode Nuit/Clair */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            data-testid="navbar-theme-toggle"
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* Séparateur */}
          <div className="h-6 w-px bg-white/20 mx-1" />

          {/* Info utilisateur + Déconnexion */}
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden md:block text-xs text-white/60 max-w-[150px] truncate">
                {user.email}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-9 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              data-testid="navbar-logout-btn"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">{t('auth.logout')}</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
