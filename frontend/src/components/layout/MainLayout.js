import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/utils';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { Wifi, WifiOff } from 'lucide-react';

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { connected } = useWebSocket();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <main
        className={cn(
          'transition-all duration-300',
          collapsed ? 'ml-16' : 'ml-64'
        )}
      >
        {/* Connection status indicator */}
        <div className="fixed top-4 right-4 z-50">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              connected
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
            data-testid="connection-status"
          >
            {connected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span className="live-indicator">LIVE</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>
        
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
