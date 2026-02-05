import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { User, Mail, Shield, Calendar, Settings, Lock } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import ProfileForm from '../components/profile/ProfileForm';
import PasswordChangeForm from '../components/profile/PasswordChangeForm';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  if (!user) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
      case 'admin':
        return 'text-destructive bg-destructive/10';
      case 'MODERATOR':
      case 'moderator':
        return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
      default:
        return 'text-primary bg-primary/10';
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Breadcrumb />
        <h1 className="text-3xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground">Manage your account information and settings.</p>
      </div>

      <div className="max-w-4xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center">
              <User className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex items-center">
              <Settings className="w-4 h-4 mr-2" />
              Edit Profile
            </TabsTrigger>
            <TabsTrigger value="password" className="flex items-center">
              <Lock className="w-4 h-4 mr-2" />
              Change Password
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Full Name
                    </label>
                    <p className="text-foreground font-medium">{user.full_name}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground flex items-center">
                      <Mail className="w-4 h-4 mr-2" />
                      Email Address
                    </label>
                    <p className="text-foreground">{user.email}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground flex items-center">
                      <Shield className="w-4 h-4 mr-2" />
                      Role
                    </label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getRoleColor(user.role)}`}>
                      {user.role}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Member Since
                    </label>
                    <p className="text-foreground">{formatDate(user.created_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="space-y-6">
            <ProfileForm 
              user={user} 
              onSuccess={() => {
                // Optionally switch back to overview tab after successful update
                // setActiveTab('overview');
              }}
            />
          </TabsContent>

          <TabsContent value="password" className="space-y-6">
            <PasswordChangeForm 
              onSuccess={() => {
                // Optionally switch back to overview tab after successful password change
                // setActiveTab('overview');
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ProfilePage;