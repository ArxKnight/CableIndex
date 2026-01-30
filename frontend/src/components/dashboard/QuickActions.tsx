import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { 
  Plus, 
  MapPin, 
  Database, 
  Search,
  Tag,
  Zap
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  variant?: 'default' | 'secondary' | 'outline';
}

const quickActions: QuickAction[] = [
  {
    title: 'Create Label',
    description: 'Generate a new cable label',
    href: '/labels/create',
    icon: Plus,
    permission: 'labels',
    variant: 'default',
  },
  {
    title: 'Manage Sites',
    description: 'Add or edit site locations',
    href: '/sites',
    icon: MapPin,
    permission: 'sites',
    variant: 'outline',
  },
  {
    title: 'View Labels',
    description: 'Browse all your labels',
    href: '/labels',
    icon: Database,
    permission: 'labels',
    variant: 'outline',
  },
  {
    title: 'Port Labels',
    description: 'Generate switch port labels',
    href: '/tools?tool=port',
    icon: Tag,
    permission: 'port_labels',
    variant: 'outline',
  },
  {
    title: 'PDU Labels',
    description: 'Generate PDU port labels',
    href: '/tools?tool=pdu',
    icon: Zap,
    permission: 'pdu_labels',
    variant: 'outline',
  },
];

const QuickActions: React.FC = () => {
  const { canAccess } = usePermissions();
  const { user } = useAuth();

  const isAdmin = user?.role === 'GLOBAL_ADMIN' || user?.role === 'ADMIN';
  const sitesActionTitle = isAdmin ? 'Manage Sites' : 'View Sites';

  const filteredActions = quickActions
    .map((action) => {
      if (action.href === '/sites') {
        return { ...action, title: sitesActionTitle };
      }
      return action;
    })
    .filter((action) => !action.permission || canAccess(action.permission));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Search className="w-5 h-5 mr-2" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} to={action.href}>
                <Button
                  variant={action.variant || 'outline'}
                  className={cn(
                    'h-auto p-4 flex flex-col items-start space-y-2 w-full',
                    action.variant === 'default' && 'bg-blue-600 hover:bg-blue-700'
                  )}
                >
                  <div className="flex items-center w-full">
                    <Icon className="w-5 h-5 mr-2" />
                    <span className="font-medium">{action.title}</span>
                  </div>
                  <p className="text-sm text-left opacity-80">
                    {action.description}
                  </p>
                </Button>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickActions;