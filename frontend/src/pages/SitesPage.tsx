import React, { useState } from 'react';
import { Site } from '../types';
import { apiClient } from '../lib/api';
import SiteList from '../components/sites/SiteList';
import SiteForm from '../components/sites/SiteForm';
import SiteDetails from '../components/sites/SiteDetails';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';

type ViewMode = 'list' | 'details';
type DialogMode = 'create' | 'edit' | 'delete' | null;

const SitesPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateSite = () => {
    setSelectedSite(null);
    setDialogMode('create');
  };

  const handleEditSite = (site: Site) => {
    setSelectedSite(site);
    setDialogMode('edit');
  };

  const handleDeleteSite = (site: Site) => {
    setSelectedSite(site);
    setDialogMode('delete');
  };

  const handleViewSiteDetails = (siteId: number) => {
    setSelectedSiteId(siteId);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedSiteId(null);
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedSite(null);
    setError(null);
  };

  const handleSubmitSite = async (data: { name: string; location?: string; description?: string }) => {
    try {
      setIsLoading(true);
      setError(null);

      if (dialogMode === 'create') {
        const response = await apiClient.createSite(data);
        if (!response.success) {
          throw new Error(response.error || 'Failed to create site');
        }
      } else if (dialogMode === 'edit' && selectedSite) {
        const response = await apiClient.updateSite(selectedSite.id, data);
        if (!response.success) {
          throw new Error(response.error || 'Failed to update site');
        }
      }

      setRefreshTrigger(prev => prev + 1);
      handleCloseDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedSite) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.deleteSite(selectedSite.id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete site');
      }

      setRefreshTrigger(prev => prev + 1);
      handleCloseDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {viewMode === 'list' ? (
        <SiteList
          onCreateSite={handleCreateSite}
          onEditSite={handleEditSite}
          onDeleteSite={handleDeleteSite}
          onViewDetails={handleViewSiteDetails}
          refreshTrigger={refreshTrigger}
        />
      ) : (
        selectedSiteId && (
          <SiteDetails
            siteId={selectedSiteId}
            onEdit={handleEditSite}
            onDelete={handleDeleteSite}
            onBack={handleBackToList}
          />
        )
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogMode === 'create' || dialogMode === 'edit'} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[425px]" onOpenChange={handleCloseDialog}>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Create New Site' : 'Edit Site'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create' 
                ? 'Add a new site for cable management.'
                : 'Update the site information.'
              }
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <SiteForm
            site={selectedSite || undefined}
            onSubmit={handleSubmitSite}
            onCancel={handleCloseDialog}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={dialogMode === 'delete'} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[425px]" onOpenChange={handleCloseDialog}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-destructive" />
              Delete Site
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to delete "{selectedSite?.name}"?</p>
              {selectedSite?.location && (
                <p className="text-sm">Location: {selectedSite.location}</p>
              )}
              <p className="font-medium text-destructive">This action cannot be undone.</p>
            </DialogDescription>
          </DialogHeader>

          {selectedSite && (
            <div className="py-4">
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="flex justify-between items-center text-sm">
                  <span>Associated Labels:</span>
                  <span className="font-medium">
                    {(selectedSite as any).label_count || 0}
                  </span>
                </div>
                {(selectedSite as any).label_count > 0 && (
                  <p className="text-xs text-destructive mt-2">
                    Cannot delete site with existing labels. Delete all labels first.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete} 
              disabled={isLoading || ((selectedSite as any)?.label_count > 0)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Site'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SitesPage;