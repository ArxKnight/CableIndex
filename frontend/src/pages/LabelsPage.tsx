import React, { useState } from 'react';
import { LabelForm, LabelDatabase } from '../components/labels';
import { LabelWithSiteInfo, CreateLabelData } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Plus, ArrowLeft } from 'lucide-react';
import apiClient from '../lib/api';

type ViewMode = 'database' | 'create' | 'edit';

const LabelsPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('database');
  const [editingLabel, setEditingLabel] = useState<LabelWithSiteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCreateLabel = async (data: CreateLabelData) => {
    try {
      setIsLoading(true);
      const response = await apiClient.createLabel(data);
      
      if (response.success) {
        setMessage({ type: 'success', text: 'Label created successfully!' });
        setViewMode('database');
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      throw error; // Let the form handle the error
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLabel = async (data: CreateLabelData) => {
    if (!editingLabel) return;
    
    try {
      setIsLoading(true);
      const response = await apiClient.updateLabel(editingLabel.id, {
        source: data.source,
        destination: data.destination,
        notes: data.notes,
        zpl_content: data.zpl_content,
      });
      
      if (response.success) {
        setMessage({ type: 'success', text: 'Label updated successfully!' });
        setViewMode('database');
        setEditingLabel(null);
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      throw error; // Let the form handle the error
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditLabel = (label: LabelWithSiteInfo) => {
    setEditingLabel(label);
    setViewMode('edit');
  };

  const handleCancel = () => {
    setViewMode('database');
    setEditingLabel(null);
  };

  const renderHeader = () => {
    switch (viewMode) {
      case 'create':
        return (
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Database
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Create Label</h1>
              <p className="text-muted-foreground">
                Generate a new cable label with automatic reference numbering
              </p>
            </div>
          </div>
        );
      
      case 'edit':
        return (
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Database
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Edit Label</h1>
              <p className="text-muted-foreground">
                Update label information for {editingLabel?.reference_number}
              </p>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold">Labels</h1>
              <p className="text-muted-foreground">
                Manage your cable labels and generate ZPL files for Brady printers
              </p>
            </div>
            <Button onClick={() => setViewMode('create')}>
              <Plus className="h-4 w-4 mr-1" />
              Create Label
            </Button>
          </div>
        );
    }
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'create':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Label Information</CardTitle>
            </CardHeader>
            <CardContent>
              <LabelForm
                onSubmit={handleCreateLabel}
                onCancel={handleCancel}
                isLoading={isLoading}
                showPreview={true}
              />
            </CardContent>
          </Card>
        );
      
      case 'edit':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Edit Label</CardTitle>
            </CardHeader>
            <CardContent>
              <LabelForm
                label={editingLabel!}
                onSubmit={handleUpdateLabel}
                onCancel={handleCancel}
                isLoading={isLoading}
                showPreview={false} // Don't show preview for editing since reference number is fixed
              />
            </CardContent>
          </Card>
        );
      
      default:
        return (
          <LabelDatabase
            onEditLabel={handleEditLabel}
            onCreateLabel={() => setViewMode('create')}
          />
        );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      
      {renderHeader()}
      {renderContent()}
    </div>
  );
};

export default LabelsPage;