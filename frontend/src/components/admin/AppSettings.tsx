import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Save,
  RefreshCw,
  Shield,
  Database,
  AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

const emptyToUndefined = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return value;
};

const settingsSchema = z.object({
  default_user_role: z.enum(['user', 'moderator']),
  max_labels_per_user: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10000).optional()),
  max_sites_per_user: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(1000).optional()),
  maintenance_mode: z.boolean(),
  maintenance_message: z.string().max(200).optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface AppSettingsData {
  default_user_role: 'user' | 'moderator';
  max_labels_per_user?: number;
  max_sites_per_user?: number;
  maintenance_mode: boolean;
  maintenance_message?: string;
  created_at: string;
  updated_at: string;
}

const AppSettings: React.FC = () => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      default_user_role: 'user',
      maintenance_mode: false,
    },
  });

  // Fetch current settings
  const { data: settingsData, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const response = await apiClient.get<{ settings: AppSettingsData }>('/admin/settings');
      return response.data;
    },
  });

  // Update form when data loads
  React.useEffect(() => {
    if (settingsData?.settings) {
      reset(settingsData.settings);
    }
  }, [settingsData, reset]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return apiClient.put('/admin/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Settings updated successfully');
      setHasUnsavedChanges(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const handleReset = () => {
    if (settingsData?.settings) {
      reset(settingsData.settings);
      setHasUnsavedChanges(false);
    }
  };

  // Watch for form changes
  React.useEffect(() => {
    const subscription = watch(() => {
      setHasUnsavedChanges(isDirty);
    });
    return () => subscription.unsubscribe();
  }, [watch, isDirty]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load settings: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasUnsavedChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Don't forget to save your settings.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* User Registration Settings */}
        {/* System Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              System Limits
            </CardTitle>
            <CardDescription>
              Set limits on user resources to manage system usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max_labels">Max Labels per User</Label>
                <Input
                  id="max_labels"
                  type="number"
                  min="0"
                  max="10000"
                  placeholder="Unlimited"
                  {...register('max_labels_per_user', {
                    setValueAs: (value) => (value === '' ? undefined : Number(value)),
                  })}
                />
                <p className="text-sm text-muted-foreground">
                  Leave empty for unlimited
                </p>
                {errors.max_labels_per_user && (
                  <p className="text-sm text-red-600">{errors.max_labels_per_user.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_sites">Max Sites per User</Label>
                <Input
                  id="max_sites"
                  type="number"
                  min="0"
                  max="1000"
                  placeholder="Unlimited"
                  {...register('max_sites_per_user', {
                    setValueAs: (value) => (value === '' ? undefined : Number(value)),
                  })}
                />
                <p className="text-sm text-muted-foreground">
                  Leave empty for unlimited
                </p>
                {errors.max_sites_per_user && (
                  <p className="text-sm text-red-600">{errors.max_sites_per_user.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Maintenance Mode
            </CardTitle>
            <CardDescription>
              Temporarily disable system access for maintenance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance_mode">Enable Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Prevent non-admin users from accessing the system
                </p>
              </div>
              <Switch
                id="maintenance_mode"
                checked={watch('maintenance_mode')}
                onCheckedChange={(checked) => setValue('maintenance_mode', checked)}
              />
            </div>

            {watch('maintenance_mode') && (
              <div className="space-y-2">
                <Label htmlFor="maintenance_message">Maintenance Message</Label>
                <Input
                  id="maintenance_message"
                  placeholder="System is under maintenance. Please try again later."
                  {...register('maintenance_message')}
                />
                <p className="text-sm text-muted-foreground">
                  Message shown to users during maintenance
                </p>
                {errors.maintenance_message && (
                  <p className="text-sm text-red-600">{errors.maintenance_message.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!hasUnsavedChanges || isLoading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!hasUnsavedChanges || updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AppSettings;