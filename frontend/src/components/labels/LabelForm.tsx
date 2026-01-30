import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Label as LabelType, Site, CreateLabelData } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, Download } from 'lucide-react';
import apiClient from '../../lib/api';

const labelSchema = z.object({
  source: z.string()
    .min(1, 'Source is required')
    .max(200, 'Source must be less than 200 characters'),
  destination: z.string()
    .min(1, 'Destination is required')
    .max(200, 'Destination must be less than 200 characters'),
  site_id: z.number()
    .min(1, 'Please select a site'),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional()
    .or(z.literal('')),
});

type LabelFormData = z.infer<typeof labelSchema>;

interface LabelFormProps {
  label?: LabelType;
  onSubmit: (data: CreateLabelData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  showPreview?: boolean;
  initialSiteId?: number;
}

const LabelForm: React.FC<LabelFormProps> = ({ 
  label, 
  onSubmit, 
  onCancel, 
  isLoading = false,
  showPreview = true,
  initialSiteId
}) => {
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [previewRef, setPreviewRef] = useState<string>('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LabelFormData>({
    resolver: zodResolver(labelSchema),
    defaultValues: {
      source: label?.source || '',
      destination: label?.destination || '',
      site_id: label?.site_id || initialSiteId || 0,
      notes: label?.notes || '',
    },
  });

  const watchedValues = watch();

  // Load sites on component mount
  useEffect(() => {
    const loadSites = async () => {
      try {
        const response = await apiClient.getSites();
        if (response.success && response.data) {
          setSites(response.data.sites);
        }
      } catch (err) {
        console.error('Failed to load sites:', err);
        setError('Failed to load sites');
      } finally {
        setLoadingSites(false);
      }
    };

    loadSites();
  }, []);

  // Update preview reference number when site or form values change
  useEffect(() => {
    if (watchedValues.site_id && watchedValues.source && watchedValues.destination) {
      const selectedSite = sites.find(s => s.id === watchedValues.site_id);
      if (selectedSite) {
        // For preview, show a placeholder reference number with 4 digits
        setPreviewRef('XXXX');
      }
    } else {
      setPreviewRef('');
    }
  }, [watchedValues.site_id, watchedValues.source, watchedValues.destination, sites]);

  // If we navigated here with a site_id query param, preselect it for create flow.
  useEffect(() => {
    if (!label && initialSiteId && watchedValues.site_id === 0) {
      setValue('site_id', initialSiteId, { shouldValidate: true });
    }
  }, [initialSiteId, label, setValue, watchedValues.site_id]);

  const handleFormSubmit = async (data: LabelFormData) => {
    try {
      setError(null);
      const submitData: CreateLabelData = {
        source: data.source,
        destination: data.destination,
        site_id: data.site_id,
        notes: data.notes || undefined,
      };
      await onSubmit(submitData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save label');
    }
  };

  const generateZPLPreview = () => {
    if (!previewRef || !watchedValues.source || !watchedValues.destination) {
      return '';
    }
    
    const referenceNumber = previewRef || 'XXXX';
    
    return `^XA
^MUm^LH8,19^FS
^MUm^FO0,2
^A0N,7,5
^FB280,1,1,C
^FD#${referenceNumber}^FS
^FO0,14
^A0N,7,5
^FB280,1,1,C
^FD${watchedValues.source} > ${watchedValues.destination}^FS
^XZ`;
  };

  const downloadZPLPreview = () => {
    const zplContent = generateZPLPreview();
    if (!zplContent) return;

    const blob = new Blob([zplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${previewRef || 'label'}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loadingSites) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading sites...</span>
      </div>
    );
  }

  if (!loadingSites && sites.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        You do not have access to any sites
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="site_id">Site *</Label>
          <select
            id="site_id"
            {...register('site_id', { valueAsNumber: true })}
            disabled={isLoading}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:py-2"
          >
            <option value={0}>Select a site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} {site.location && `(${site.location})`}
              </option>
            ))}
          </select>
          {errors.site_id && (
            <p className="text-sm text-destructive">{errors.site_id.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            The site where this cable will be installed
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="source">Source *</Label>
            <Input
              id="source"
              placeholder="e.g., Switch A Port 1, Panel 1-12"
              {...register('source')}
              disabled={isLoading}
            />
            {errors.source && (
              <p className="text-sm text-destructive">{errors.source.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Where the cable originates from
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination">Destination *</Label>
            <Input
              id="destination"
              placeholder="e.g., Server Rack B-15, Workstation 42"
              {...register('destination')}
              disabled={isLoading}
            />
            {errors.destination && (
              <p className="text-sm text-destructive">{errors.destination.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Where the cable terminates
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Additional information about this cable (cable type, length, special requirements, etc.)"
            rows={3}
            {...register('notes')}
            disabled={isLoading}
          />
          {errors.notes && (
            <p className="text-sm text-destructive">{errors.notes.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Optional details for reference and troubleshooting
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
                {label ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              label ? 'Update Label' : 'Create Label'
            )}
          </Button>
        </div>
      </form>

      {showPreview && previewRef && watchedValues.source && watchedValues.destination && (
        <div className="border rounded-lg p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Label Preview</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadZPLPreview}
              className="h-8"
            >
              <Download className="h-3 w-3 mr-1" />
              Download ZPL
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Reference:</span> #{previewRef}
            </div>
            <div className="text-sm">
              <span className="font-medium">Label Text:</span> #{previewRef} {watchedValues.source} &gt; {watchedValues.destination}
            </div>
            
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View ZPL Code
              </summary>
              <pre className="mt-2 p-2 bg-background border rounded text-xs overflow-x-auto">
                {generateZPLPreview()}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabelForm;