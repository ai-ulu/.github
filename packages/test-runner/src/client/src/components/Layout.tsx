import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Play, 
  Settings, 
  Target, 
  FileText, 
  Activity,
  Wifi,
  WifiOff 
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { cn } from '../utils/cn';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { connected } = useSocket();

  const navigation = [
    {
      name: 'Test Runner',
      href: '/',
      icon: Play,
      current: location.pathname === '/',
    },
    {
      name: 'Selector Playground',
      href: '/selector-playground',
      icon: Target,
      current: location.pathname === '/selector-playground',
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      current: location.pathname === '/settings',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">AutoQA Test Runner</h1>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              {connected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Connected
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Disconnected
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="ml-auto flex space-x-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    item.current
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
};