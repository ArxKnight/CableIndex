import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  MapPin, 
  Menu,
  Moon,
  Sun,
  Wrench,
  Settings, 
  ChevronDown,
  User,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  adminOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
  {
    name: 'Sites',
    href: '/sites',
    icon: MapPin,
    permission: 'sites',
  },
  {
    name: 'Tools',
    href: '/tools',
    icon: Wrench,
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: Settings,
    adminOnly: true,
  },
];

const Navigation: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canAccess, isAdmin } = usePermissions();
  const { theme, setTheme } = useTheme();
  const logoIconUrl = `${import.meta.env.BASE_URL}infradb-icon.png`;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const filteredNavItems = navigationItems.filter(item => {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    if (item.permission && !canAccess(item.permission)) {
      return false;
    }
    return true;
  });

  return (
    <nav className="bg-background shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and main navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/sites" className="flex items-center space-x-2">
                <img 
                  src={logoIconUrl} 
                  alt="InfraDB" 
                  className="h-8 w-8"
                />
                <span className="text-xl font-bold text-foreground">InfraDB</span>
              </Link>
            </div>
            
            {/* Desktop navigation */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen(open => !open)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
            <div className="flex items-center gap-2" title="Toggle theme">
              <span className="sr-only">Toggle theme</span>
              {theme === 'dark' ? (
                <Moon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              <Switch
                aria-label="Toggle theme"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:block">{user?.username}</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      Role: {user?.role}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="sm:hidden" id="mobile-navigation">
          {mobileMenuOpen && (
            <div className="pt-2 pb-3 space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'block pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors',
                      isActive
                        ? 'bg-muted border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-muted hover:border-muted hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center">
                      <Icon className="w-4 h-4 mr-3" />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;