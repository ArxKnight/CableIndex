import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const routeLabels: Record<string, string> = {
  '/sites': 'Sites',
  '/tools': 'Tools',
  '/port-labels': 'Port Labels',
  '/pdu-labels': 'PDU Labels',
  '/admin': 'Admin',
  '/profile': 'Profile',
};

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  const location = useLocation();
  
  // Generate breadcrumb items from current route if not provided
  const breadcrumbItems = items || generateBreadcrumbItems(location.pathname);

  if (breadcrumbItems.length === 0) {
    return null;
  }

  return (
    <nav className={cn('flex items-center space-x-1 text-sm text-muted-foreground', className)}>
      <Link
        to="/sites"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="w-4 h-4" />
      </Link>
      
      {breadcrumbItems.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="w-4 h-4" />
          {item.href && index < breadcrumbItems.length - 1 ? (
            <Link
              to={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

function generateBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];
  
  let currentPath = '';
  
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const label = routeLabels[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1);
    
    items.push({
      label,
      href: currentPath,
    });
  }
  
  return items;
}

export default Breadcrumb;