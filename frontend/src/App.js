import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import '@/lib/i18n';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Layout
import { MainLayout } from '@/components/layout/MainLayout';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LivePage } from '@/pages/LivePage';
import { HistoryPage } from '@/pages/HistoryPage';
import { RadarsPage } from '@/pages/RadarsPage';
import { SitesPage } from '@/pages/SitesPage';
import { RulesPage } from '@/pages/RulesPage';
import { UsersPage } from '@/pages/UsersPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { SimulatorPage } from '@/pages/SimulatorPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StatisticsPage } from '@/pages/StatisticsPage';
import { WidgetPage } from '@/components/widgets/DashboardWidget';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// App Routes
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <WebSocketProvider>
              <MainLayout />
            </WebSocketProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="sensors" element={<Navigate to="/radars" replace />} />
        <Route path="radars" element={<RadarsPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="widgets" element={<WidgetPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster 
            position="top-right" 
            richColors 
            closeButton
            toastOptions={{
              className: 'font-sans'
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
