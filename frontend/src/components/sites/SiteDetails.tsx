import React, { useState, useEffect } from 'react';
import { Site } from '../../types';
import { apiClient } from '../../lib/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { LabelDatabase, LabelForm } from '../labels';
import type { LabelWithSiteInfo, CreateLabelData } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
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
  const { canCreate } = usePermissions();
  const [site, setSite] = useState<SiteWithLabelCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelMode, setLabelMode] = useState<'list' | 'edit'>('list');
  const [editingLabel, setEditingLabel] = useState<LabelWithSiteInfo | null>(null);
  const [labelsRefreshToken, setLabelsRefreshToken] = useState(0);
  const [createLabelOpen, setCreateLabelOpen] = useState(false);

  const canCreateLabels = canCreate('labels');

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

  const handleCreateLabel = async (data: CreateLabelData) => {
    if (!site) return;
    await apiClient.createLabel({
      source: data.source,
      destination: data.destination,
      notes: data.notes,
      site_id: site.id,
    });
    setCreateLabelOpen(false);
    setEditingLabel(null);
    setLabelsRefreshToken((t) => t + 1);
    await loadSite();
  };

  const handleUpdateLabel = async (data: CreateLabelData) => {
    if (!site || !editingLabel) return;
    await apiClient.updateLabel(editingLabel.id, {
      site_id: site.id,
      source: data.source,
      destination: data.destination,
      notes: data.notes,
    });
    setLabelMode('list');
    setEditingLabel(null);
    setLabelsRefreshToken((t) => t + 1);
    await loadSite();
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Labels</CardTitle>
              <CardDescription>
                Create, search, edit, delete, and bulk download labels for this site.
              </CardDescription>
            </div>

            {canCreateLabels && labelMode === 'list' && (
              <Button aria-label="Open label creation dialog" onClick={() => setCreateLabelOpen(true)}>
                Create Label
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Dialog open={createLabelOpen} onOpenChange={setCreateLabelOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create Label</DialogTitle>
              </DialogHeader>
              <LabelForm
                onSubmit={handleCreateLabel}
                onCancel={() => setCreateLabelOpen(false)}
                isLoading={false}
                showPreview={true}
                lockedSiteId={site.id}
                lockedSiteName={site.name}
              />
            </DialogContent>
          </Dialog>

          {labelMode === 'edit' && editingLabel && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Label {editingLabel.reference_number}</h3>
                <Button variant="outline" onClick={() => { setLabelMode('list'); setEditingLabel(null); }}>Back to Labels</Button>
              </div>
              <LabelForm
                label={editingLabel}
                onSubmit={handleUpdateLabel}
                onCancel={() => { setLabelMode('list'); setEditingLabel(null); }}
                isLoading={false}
                showPreview={false}
                lockedSiteId={site.id}
                lockedSiteName={site.name}
              />
            </div>
          )}

          {labelMode === 'list' && (
            <LabelDatabase
              fixedSiteId={site.id}
              refreshToken={labelsRefreshToken}
              onCreateLabel={canCreateLabels ? () => setCreateLabelOpen(true) : undefined}
              onEditLabel={(label) => { setEditingLabel(label); setLabelMode('edit'); }}
              onLabelsChanged={() => { setLabelsRefreshToken((t) => t + 1); loadSite(); }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDetails;