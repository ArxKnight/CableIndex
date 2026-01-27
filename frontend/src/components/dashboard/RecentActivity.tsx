import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { 
  Clock, 
  ExternalLink,
  Tag,
  MapPin,
  ArrowRight
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { LabelWithSiteInfo } from '../../types';


const RecentActivity: React.FC = () => {
  const { data: recentLabels, isLoading, error } = useQuery({
    queryKey: ['recent-labels'],
    queryFn: async () => {
      const response = await apiClient.getRecentLabels(5);
      if (response.success) {
        return response.data?.labels || [];
      }
      throw new Error(response.error || 'Failed to fetch recent labels');
    },
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <Clock className="w-5 h-5 mr-2" />
          Recent Activity
        </CardTitle>
        <Link to="/labels">
          <Button variant="ghost" size="sm" className="flex items-center">
            View All
            <ExternalLink className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-6 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Unable to load recent activity</p>
          </div>
        ) : !recentLabels || recentLabels.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent labels created</p>
            <Link to="/labels/create">
              <Button variant="outline" size="sm" className="mt-2">
                Create your first label
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentLabels.map((label: LabelWithSiteInfo) => (
              <div
                key={label.id}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {label.reference_number}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span className="truncate">
                      {label.source} → {label.destination}
                    </span>
                  </div>
                  
                  {label.site_name && (
                    <div className="flex items-center space-x-1 text-xs text-gray-400 mt-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{label.site_name}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex-shrink-0 text-xs text-gray-400">
                  {formatTimeAgo(label.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivity;