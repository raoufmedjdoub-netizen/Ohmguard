/**
 * MainLayout - Layout principal de l'application
 * 
 * Structure:
 * - Navbar (fixe en haut)
 * - SubNavbar (contextuelle)
 * - Sidebar (navigation latérale - collapsée sur mobile)
 * - Contenu principal
 */
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { SubNavbar } from './SubNavbar';
import { Sidebar } from './Sidebar';
import { PageActionsProvider } from '@/contexts/PageActionsContext';
import { GlobalAlertBanner } from '@/components/GlobalAlertBanner';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Pour mobile
  const location = useLocation();

  // Fermer la sidebar mobile lors du changement de route
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Détecter la taille de l'écran et ajuster la sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <PageActionsProvider>
    <div className="min-h-screen bg-background">
      {/* Navbar principale - fixe en haut */}
      <Navbar 
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        showMenuButton={true}
      />
      
      {/* Bandeau d'alertes global */}
      <GlobalAlertBanner />
      
      {/* Overlay pour mobile quand sidebar ouverte */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}
      
      {/* Sidebar - navigation latérale */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        setCollapsed={setSidebarCollapsed}
        mobileOpen={sidebarOpen}
        setMobileOpen={setSidebarOpen}
      />
      
      {/* Contenu principal */}
      <main
        className={cn(
          'transition-all duration-300 pt-14', // pt-14 pour la navbar
          // Desktop: décalage selon état sidebar
          'lg:ml-64',
          sidebarCollapsed && 'lg:ml-16',
          // Mobile: pas de décalage
          'ml-0'
        )}
      >
        {/* Sous-navbar contextuelle */}
        <SubNavbar />
        
        {/* Contenu de la page */}
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
    </PageActionsProvider>
  );
}

export default MainLayout;
