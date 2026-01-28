import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { 
  Database, 
  MapPin, 
  Tag, 
  Calendar,
  TrendingUp
} from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import QuickActions from '../components/dashboard/QuickActions';
import RecentActivity from '../components/dashboard/RecentActivity';
import Breadcrumb from '../components/layout/Breadcrumb';
import { apiClient } from '../lib/api';

interface DashboardStats {
  total_labels: number;
  labels_this_month: number;
  labels_today: number;
  total_sites: number;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedSiteId, setSelectedSiteId] = React.useState<number | null>(null);

  // Fetch dashboard statistics  // Fetch sites
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const response = await apiClient.getSites();
      return response.data;
    },
  });
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedSiteId],
    enabled: selectedSiteId !== null,
    retry: false,
    queryFn: async () => {
      if (!selectedSiteId) return null;

      const [labelStatsResponse, sitesResponse] = await Promise.all([
        apiClient.getLabelStats(selectedSiteId),
        apiClient.getSites()
      ]);

      if (labelStatsResponse.success && sitesResponse.success) {
        const labelStats = labelStatsResponse.data?.stats || {};
        const sitesData = sitesResponse.data?.sites || [];
        
        return {
          total_labels: labelStats.total_labels || 0,
          labels_this_month: labelStats.labels_this_month || 0,
          labels_today: labelStats.labels_today || 0,
          total_sites: sitesData.length || 0,
        } as DashboardStats;
      }
      
      return null;
    },
  });

  // Load initial site
  React.useEffect(() => {
    const loadInitialSite = async () => {
      try {
        const response = await apiClient.getSites();
        if (response.success && response.data?.sites && response.data.sites.length > 0) {
          setSelectedSiteId(response.data.sites[0].id);
        }
      } catch (error) {
        console.error('Failed to load sites:', error);
      }
    };
    
    if (!selectedSiteId) {
      loadInitialSite();
    }
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Handle case where user has no sites yet
  if (!sitesLoading && (!sitesData?.sites || sitesData.sites.length === 0)) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <Breadcrumb />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {getGreeting()}, {user?.full_name?.split(' ')[0] || 'User'}!
            </h1>
            <p className="text-gray-600">Welcome to CableIndex</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold text-blue-900 mb-3">Get Started</h2>
          <p className="text-blue-700 mb-6 text-lg">
            You don't have any sites yet. Create your first site to start managing cable labels.
          </p>
          <a
            href="/sites"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Create Your First Site
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <Breadcrumb />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {getGreeting()}, {user?.full_name?.split(' ')[0] || 'User'}!
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your cable management today.
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Labels"
          value={statsLoading ? '...' : stats?.total_labels || 0}
          description="All time labels created"
          icon={Tag}
        />
        
        <StatCard
          title="This Month"
          value={statsLoading ? '...' : stats?.labels_this_month || 0}
          description="Labels created this month"
          icon={Calendar}
        />
        
        <StatCard
          title="Today"
          value={statsLoading ? '...' : stats?.labels_today || 0}
          description="Labels created today"
          icon={TrendingUp}
        />
        
        <StatCard
          title="Active Sites"
          value={statsLoading ? '...' : stats?.total_sites || 0}
          description="Configured locations"
          icon={MapPin}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions - Takes up 2 columns on large screens */}
        <div className="lg:col-span-2">
          <QuickActions />
        </div>
        
        {/* Recent Activity - Takes up 1 column on large screens */}
        <div className="lg:col-span-1">
          <RecentActivity />
        </div>
      </div>

      {/* Welcome Message for New Users */}
      {!statsLoading && stats && stats.total_labels === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center">
            <Database className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-blue-900">
                Welcome to Cable Manager!
              </h3>
              <p className="text-blue-700 mt-1">
                Get started by creating your first site and then generate your first cable label.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;