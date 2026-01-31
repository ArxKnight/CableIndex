import React from 'react';
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
  Mail,
  Send,
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
  maintenance_mode: z.boolean(),
  maintenance_message: z.string().max(200).optional(),
  smtp_host: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  smtp_port: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  smtp_username: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  smtp_password: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  smtp_from: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  smtp_secure: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface AppSettingsData {
  default_user_role: 'user' | 'moderator';
  maintenance_mode: boolean;
  maintenance_message?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_password_set?: boolean;
  smtp_from?: string;
  smtp_secure?: boolean;
  created_at: string;
  updated_at: string;
}

const AppSettings: React.FC = () => {
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
      smtp_secure: false,
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
      reset({
        ...settingsData.settings,
        // Ensure required boolean is always present even if the API omits it
        smtp_secure: settingsData.settings.smtp_secure ?? false,
        // Never hydrate SMTP password into the form; keep it as an empty string for stable dirty-state
        smtp_password: '',
      });
    }
  }, [settingsData, reset, setValue]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return apiClient.put('/admin/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Settings updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/admin/settings/test-email', {});
    },
    onSuccess: () => {
      toast.success('Test email sent successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send test email');
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const handleReset = () => {
    if (settingsData?.settings) {
      reset({
        ...settingsData.settings,
        smtp_secure: settingsData.settings.smtp_secure ?? false,
        smtp_password: '',
      }, {
        keepDirty: false,
        keepTouched: false,
        keepErrors: true,
      });
    }
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load settings: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isDirty && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Don't forget to save your settings.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Email (SMTP) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email (SMTP)
            </CardTitle>
            <CardDescription>
              Configure SMTP for invitation emails. Invites still work without SMTP; users can copy the direct invite link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Input id="smtp_host" placeholder="smtp.example.com" {...register('smtp_host')} />
                {errors.smtp_host && (
                  <p className="text-sm text-red-600">{errors.smtp_host.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input id="smtp_port" type="number" min="1" max="65535" placeholder="587" {...register('smtp_port')} />
                {errors.smtp_port && (
                  <p className="text-sm text-red-600">{errors.smtp_port.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_username">SMTP Username</Label>
                <Input id="smtp_username" placeholder="user@example.com" {...register('smtp_username')} />
                {errors.smtp_username && (
                  <p className="text-sm text-red-600">{errors.smtp_username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_password">SMTP Password</Label>
                <Input
                  id="smtp_password"
                  type="password"
                  placeholder={settingsData?.settings?.smtp_password_set ? '••••••' : ''}
                  autoComplete="new-password"
                  {...register('smtp_password')}
                />
                <p className="text-sm text-muted-foreground">
                  {settingsData?.settings?.smtp_password_set
                    ? 'Password is set. Leave blank to keep it unchanged.'
                    : 'Set a password to enable SMTP auth.'}
                </p>
                {errors.smtp_password && (
                  <p className="text-sm text-red-600">{errors.smtp_password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_from">From Address</Label>
                <Input id="smtp_from" placeholder="CableIndex <noreply@example.com>" {...register('smtp_from')} />
                {errors.smtp_from && (
                  <p className="text-sm text-red-600">{errors.smtp_from.message}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="smtp_secure">Enable TLS/SSL</Label>
                  <p className="text-sm text-muted-foreground">
                    If enabled, connects using TLS (commonly port 465). Otherwise STARTTLS (commonly 587).
                  </p>
                </div>
                <Switch
                  id="smtp_secure"
                  checked={Boolean(watch('smtp_secure'))}
                  onCheckedChange={(checked) => setValue('smtp_secure', checked)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => testEmailMutation.mutate()}
                disabled={testEmailMutation.isPending}
              >
                {testEmailMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Test Email
                  </>
                )}
              </Button>
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
            disabled={!isDirty || isLoading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!isDirty || updateSettingsMutation.isPending}
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