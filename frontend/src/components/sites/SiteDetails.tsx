import React, { useState, useEffect } from 'react';
import { Site } from '../../types';
import { apiClient } from '../../lib/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  MapPin, 
  Calendar, 
  FileText, 
  Edit, 
  Trash2, 
  Loader2,
  ArrowLeft,
  Tag
} from 'lucide-react';

interface SiteWithLabelCount extends Site {
  label_count: number;
}

interface SiteDetailsProps {
  siteId: number;
  onEdit: (site: Site) => void;
  onDelete: (site: Site) => void;
  onBack: () => void;
}

const SiteDetails: React.FC<SiteDetailsProps> = ({ 
  siteId, 
  onEdit, 
  onDelete, 
  onBack 
}) => {
  const [site, setSite] = useState<SiteWithLabelCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSite();
  }, [siteId]);

  const loadSite = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getSite(siteId);

      if (response.success && response.data) {
        setSite(response.data.site);
      } else {
        throw new Error(response.error || 'Failed to load site');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site');
    } finally {
      setLoading(false);
    }
  };



  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading site details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sites
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sites
        </Button>
        <Alert>
          <AlertDescription>Site not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sites
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{site.name}</h1>
            <p className="text-muted-foreground">Site Details</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => onEdit(site)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => onDelete(site)}
            disabled={site.label_count > 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Site Information */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              Site Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="text-sm">{site.name}</p>
            </div>
            
            {site.location && (
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <MapPin className="mr-1 h-3 w-3" />
                  Location
                </label>
                <p className="text-sm">{site.location}</p>
              </div>
            )}
            
            {site.description && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm whitespace-pre-wrap">{site.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Tag className="mr-2 h-5 w-5" />
              Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Total Labels</label>
              <p className="text-2xl font-bold">{site.label_count}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center">
                <Calendar className="mr-1 h-3 w-3" />
                Created
              </label>
              <p className="text-sm">{formatDateTime(site.created_at)}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
              <p className="text-sm">{formatDateTime(site.updated_at)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Labels Section */}
      <Card>
        <CardHeader>
          <CardTitle>Associated Labels</CardTitle>
          <CardDescription>
            Labels created for this site
          </CardDescription>
        </CardHeader>
        <CardContent>
          {site.label_count === 0 ? (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No labels yet</h3>
              <p className="text-muted-foreground mb-4">
                Labels created for this site will appear here.
              </p>
              <Button variant="outline" size="sm">
                Create First Label
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-primary">{site.label_count}</div>
                  <p className="text-sm text-muted-foreground">
                    Total Label{site.label_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                  <p className="text-sm text-muted-foreground">
                    This Month
                  </p>
                </div>
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                  <p className="text-sm text-muted-foreground">
                    Last Used
                  </p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground text-center">
                  Detailed label management will be available in the next update.
                </p>
                <div className="flex justify-center mt-3 space-x-2">
                  <Button variant="outline" size="sm">
                    View All Labels
                  </Button>
                  <Button size="sm">
                    Create New Label
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Warning */}
      {site.label_count > 0 && (
        <Alert>
          <AlertDescription>
            This site cannot be deleted because it has {site.label_count} associated label{site.label_count !== 1 ? 's' : ''}. 
            Delete all labels first to remove this site.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SiteDetails;