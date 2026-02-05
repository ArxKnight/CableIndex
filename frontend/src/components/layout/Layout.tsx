import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      
      <main className="flex-1">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default Layout;