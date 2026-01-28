import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { 
  Users, 
  Database, 
  MapPin, 
  Activity, 
  TrendingUp, 
  UserCheck
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

interface AdminStatsData {
  users: {
    total: number;
    active_this_month: number;
    new_this_month: number;
    by_role: {
      GLOBAL_ADMIN: number;
      ADMIN: number;
      USER: number;
    };
  };
  labels: {
    total: number;
    created_this_month: number;
    created_today: number;
    most_active_user: {
      full_name: string;
      count: number;
    } | null;
  };
  sites: {
    total: number;
    created_this_month: number;
    average_labels_per_site: number;
  };
  activity: {
    recent_registrations: Array<{
      id: number;
      full_name: string;
      email: string;
      role: string;
      created_at: string;
    }>;
    recent_labels: Array<{
      id: number;
      reference_number: string;
      user_name: string;
      site_name: string;
      created_at: string;
    }>;
  };
}

const AdminStats: React.FC = () => {
  const { data: sitesData } = useQuery({
    queryKey: ['admin', 'stats', 'sites'],
    queryFn: async () => {
      const response = await apiClient.getSites({ limit: 1000 });
      return response.data;
    },
  });

  const [selectedSiteId, setSelectedSiteId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!selectedSiteId && sitesData?.sites?.length) {
      setSelectedSiteId(sitesData.sites[0].id);
    }
  }, [selectedSiteId, sitesData]);

  const { data: statsData, isLoading, error } = useQuery({
    queryKey: ['admin', 'stats', selectedSiteId],
    enabled: Boolean(selectedSiteId),
    queryFn: async () => {
      const response = await apiClient.getAdminStats(selectedSiteId as number);
      return response.data as AdminStatsData;
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load statistics: {error.message}</p>
      </div>
    );
  }

  if (!selectedSiteId || !sitesData?.sites?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No sites available. Create a site first to view statistics.</p>
      </div>
    );
  }

  if (!statsData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No statistics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Site</label>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={selectedSiteId ?? ''}
          onChange={(event) => setSelectedSiteId(Number(event.target.value))}
        >
          {sitesData?.sites?.map((site: any) => (
            <option key={site.id} value={site.id}>
              {site.name} ({site.code})
            </option>
          ))}
        </select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.users.total}</div>
            <p className="text-xs text-muted-foreground">
              +{statsData.users.new_this_month} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.users.active_this_month}</div>
            <p className="text-xs text-muted-foreground">
              Active this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Labels</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.labels.total}</div>
            <p className="text-xs text-muted-foreground">
              +{statsData.labels.created_this_month} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.sites.total}</div>
            <p className="text-xs text-muted-foreground">
              +{statsData.sites.created_this_month} this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>User Role Distribution</CardTitle>
          <CardDescription>
            Breakdown of users by role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {statsData.users.by_role.GLOBAL_ADMIN}
              </div>
              <p className="text-sm text-muted-foreground">Global Admins</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {statsData.users.by_role.ADMIN}
              </div>
              <p className="text-sm text-muted-foreground">Admins</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {statsData.users.by_role.USER}
              </div>
              <p className="text-sm text-muted-foreground">Users</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Labels Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.labels.created_today}</div>
            <p className="text-xs text-muted-foreground">
              Labels created today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Labels/Site</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsData.sites.average_labels_per_site.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average labels per site
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Most Active User */}
      {statsData.labels.most_active_user && (
        <Card>
          <CardHeader>
            <CardTitle>Most Active User</CardTitle>
            <CardDescription>
              User with the most labels created
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <p className="font-medium">{statsData.labels.most_active_user.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {statsData.labels.most_active_user.count} labels created
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recent Registrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statsData.activity.recent_registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent registrations</p>
              ) : (
                statsData.activity.recent_registrations.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Recent Labels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statsData.activity.recent_labels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent labels</p>
              ) : (
                statsData.activity.recent_labels.map((label) => (
                  <div key={label.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{label.reference_number}</p>
                      <p className="text-xs text-muted-foreground">
                        by {label.user_name} at {label.site_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(label.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminStats;