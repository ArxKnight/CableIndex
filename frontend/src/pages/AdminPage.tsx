import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, Settings, UserPlus, Bell } from 'lucide-react';
import UserManagement from '../components/admin/UserManagement';
import AppSettings from '../components/admin/AppSettings';
import UserInvitations from '../components/admin/UserInvitations';
import AdminOverview from '@/components/admin/AdminOverview';
import { usePermissions } from '../hooks/usePermissions';
import { Navigate, useSearchParams } from 'react-router-dom';

type AdminTab = 'overview' | 'users' | 'invitations' | 'settings';

const isAdminTab = (value: string): value is AdminTab =>
  value === 'overview' || value === 'users' || value === 'invitations' || value === 'settings';

const AdminPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') || '').toLowerCase();
  const [activeTab, setActiveTab] = useState<AdminTab>(
    initialTab === 'overview' || initialTab === 'users' || initialTab === 'invitations' || initialTab === 'settings'
      ? (initialTab as AdminTab)
      : 'overview'
  );

  // Redirect non-admin users
  if (!isAdmin) {
    return <Navigate to="/sites" replace />;
  }

  const handleTabChange = (tab: string) => {
    if (!isAdminTab(tab)) return;

    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage users, permissions, and application settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Invitations
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AdminOverview onNavigate={(tab: AdminTab) => handleTabChange(tab)} />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts, roles, and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Invitations</CardTitle>
              <CardDescription>
                Send invitations to new users and manage pending invites
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserInvitations />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
              <CardDescription>
                Configure system-wide settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;