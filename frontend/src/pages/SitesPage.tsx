import React, { useState } from 'react';
import { apiClient } from '../lib/api';
import SiteList from '../components/sites/SiteList';
import SiteForm from '../components/sites/SiteForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
type DialogMode = 'create' | null;

const SitesPage: React.FC = () => {
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateSite = () => {
    setDialogMode('create');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setError(null);
  };

  const handleSubmitSite = async (data: { name: string; code: string; location?: string; description?: string }) => {
    try {
      setIsLoading(true);
      setError(null);

      if (dialogMode === 'create') {
        const response = await apiClient.createSite(data);
        if (!response.success) {
          throw new Error(response.error || 'Failed to create site');
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

  return (
    <div className="container mx-auto px-4 py-6">
      <SiteList onCreateSite={handleCreateSite} refreshTrigger={refreshTrigger} />

      {/* Create Dialog */}
      <Dialog open={dialogMode === 'create'} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[425px]" onOpenChange={handleCloseDialog}>
          <DialogHeader>
            <DialogTitle>Create New Site</DialogTitle>
            <DialogDescription>
              Add a new site for cable management.
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <SiteForm
            onSubmit={handleSubmitSite}
            onCancel={handleCloseDialog}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SitesPage;