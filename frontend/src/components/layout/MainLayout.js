/**
 * MainLayout - Layout principal de l'application
 * 
 * Structure:
 * - Navbar (fixe en haut)
 * - SubNavbar (contextuelle)
 * - Sidebar (navigation latérale)
 * - Contenu principal
 */
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { SubNavbar } from './SubNavbar';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar principale - fixe en haut */}
      <Navbar />
      
      {/* Sidebar - navigation latérale */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        setCollapsed={setSidebarCollapsed} 
      />
      
      {/* Contenu principal */}
      <main
        className={cn(
          'transition-all duration-300 pt-14', // pt-14 pour la navbar
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        )}
      >
        {/* Sous-navbar contextuelle */}
        <SubNavbar />
        
        {/* Contenu de la page */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
