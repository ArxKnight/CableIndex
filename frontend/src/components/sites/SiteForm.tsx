import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Site } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2 } from 'lucide-react';

const siteSchema = z.object({
  name: z.string()
    .min(1, 'Site name is required')
    .max(100, 'Site name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Site name can only contain letters, numbers, spaces, hyphens, underscores, and periods'),
  code: z.string()
    .min(1, 'Abbreviation is required')
    .max(20, 'Abbreviation must be less than 20 characters')
    .regex(/^[A-Za-z0-9\-_]+$/, 'Abbreviation can only contain letters, numbers, hyphens, and underscores')
    .transform((v) => v.trim().toUpperCase()),
  location: z.string()
    .max(200, 'Location must be less than 200 characters')
    .optional()
    .or(z.literal('')),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .or(z.literal('')),
});

type SiteFormData = z.infer<typeof siteSchema>;

interface SiteFormProps {
  site?: Site;
  onSubmit: (data: SiteFormData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const SiteForm: React.FC<SiteFormProps> = ({ 
  site, 
  onSubmit, 
  onCancel, 
  isLoading = false 
}) => {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: site?.name || '',
      code: site?.code || '',
      location: site?.location || '',
      description: site?.description || '',
    },
  });

  const handleFormSubmit = async (data: SiteFormData) => {
    try {
      setError(null);
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save site');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Site Name *</Label>
          <Input
            id="name"
            placeholder="e.g., Main Office, Data Center A, Building 1, Company Name"
            {...register('name')}
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
          <p className="text-xs text-muted-foreground">Internal display name only (not printed on labels).</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">Abbreviation *</Label>
          <Input
            id="code"
            placeholder="e.g., MAIN"
            {...register('code')}
            disabled={isLoading}
            autoCapitalize="characters"
          />
          {errors.code && (
            <p className="text-sm text-destructive">{errors.code.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            This is what appears on cable labels by default. Ideally 3-4 characters Long (e.g., MAIN/1/A/1/42).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            placeholder="e.g., 123 Main St, New York, NY 10001"
            {...register('location')}
            disabled={isLoading}
          />
          {errors.location && (
            <p className="text-sm text-destructive">{errors.location.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Physical address or location description
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Additional details about this site, equipment, or special considerations..."
            rows={3}
            {...register('description')}
            disabled={isLoading}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Optional details to help identify and manage this site
          </p>
        </div>

        <div className="flex justify-end space-x-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {site ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              site ? 'Update Site' : 'Create Site'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SiteForm;