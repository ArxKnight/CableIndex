import React, { useState, useEffect, useMemo } from 'react';
import { Label, Site } from '../../types';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { LabelDatabase, LabelForm } from '../labels';
import type { CreateLabelData } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { downloadBlobAsNamedFile, downloadBlobAsNamedTextFile, makeTimestampLocal } from '../../lib/download';
import SiteLocationsDialog from './SiteLocationsDialog';
import SiteCableTypesDialog from './SiteCableTypesDialog';
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
  onBack: () => void;
  onEdit?: (site: Site) => void;
  onDelete?: (site: Site) => void;
}

const SiteDetails: React.FC<SiteDetailsProps> = ({ 
  siteId, 
  onEdit, 
  onDelete, 
  onBack 
}) => {
  const { canCreate, canAdministerSite, isGlobalAdmin } = usePermissions();
  const canManageSite = canAdministerSite(siteId);
  const [site, setSite] = useState<SiteWithLabelCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelsRefreshToken, setLabelsRefreshToken] = useState(0);
  const [createLabelOpen, setCreateLabelOpen] = useState(false);
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false);
  const [creatingLabels, setCreatingLabels] = useState(false);
  const [createdLabels, setCreatedLabels] = useState<Label[]>([]);
  const [createdMeta, setCreatedMeta] = useState<{ created_count: number; first_ref_number: number; last_ref_number: number } | null>(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [locationCount, setLocationCount] = useState<number | null>(null);
  const [cableTypesOpen, setCableTypesOpen] = useState(false);
  const [cableTypeCount, setCableTypeCount] = useState<number | null>(null);
  const [isGeneratingCableReport, setIsGeneratingCableReport] = useState(false);

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

        try {
          const locResp = await apiClient.getSiteLocations(siteId);
          if (locResp.success && locResp.data) {
            setLocationCount(locResp.data.locations.length);
          } else {
            setLocationCount(null);
          }
        } catch {
          setLocationCount(null);
        }

        try {
          const ctResp = await apiClient.getSiteCableTypes(siteId);
          if (ctResp.success && ctResp.data) {
            setCableTypeCount(ctResp.data.cable_types.length);
          } else {
            setCableTypeCount(null);
          }
        } catch {
          setCableTypeCount(null);
        }
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
    try {
      setCreatingLabels(true);

      const resp = await apiClient.createLabel({
        source_location_id: data.source_location_id,
        destination_location_id: data.destination_location_id,
        cable_type_id: data.cable_type_id,
        notes: data.notes,
        site_id: site.id,
        quantity: data.quantity,
      });

      if (!resp.success || !resp.data?.label) {
        throw new Error(resp.error || 'Failed to create label');
      }

    const createdCount = Number((resp.data as any)?.created_count ?? ((resp.data as any)?.labels?.length ?? 1));
    const firstRefNumber = Number((resp.data as any)?.first_ref_number ?? (resp.data as any)?.label?.ref_number);
    const lastRefNumber = Number((resp.data as any)?.last_ref_number ?? (resp.data as any)?.label?.ref_number);

    if (Number.isFinite(createdCount) && createdCount > 0 && Number.isFinite(firstRefNumber) && Number.isFinite(lastRefNumber)) {
      setCreatedMeta({ created_count: createdCount, first_ref_number: firstRefNumber, last_ref_number: lastRefNumber });
    } else {
      setCreatedMeta(null);
    }

    // Keep existing behavior if backend returned created label objects (small quantities),
    // but do not require it (large quantities can use range download).
    const labels = (resp.data as any)?.labels && Array.isArray((resp.data as any)?.labels)
      ? ((resp.data as any).labels as Label[])
      : ((resp.data as any)?.label ? ([(resp.data as any).label] as Label[]) : []);
      setCreatedLabels(labels);
      setCreateLabelOpen(false);
      setCreateSuccessOpen(true);
      setLabelsRefreshToken((t) => t + 1);
      await loadSite();
    } finally {
      setCreatingLabels(false);
    }
  };

  const createdRange = useMemo(() => {
    if (createdMeta) {
      const formatRef = (n: number) => (n < 10000 ? `#${String(n).padStart(4, '0')}` : `#${n}`);
      return {
        from: formatRef(createdMeta.first_ref_number),
        to: formatRef(createdMeta.last_ref_number),
        count: createdMeta.created_count,
      };
    }

    if (!createdLabels.length) return null;
    const refs = createdLabels
      .map((l) => String(l.ref_string || l.ref_number || '').replace(/^#/, ''))
      .map((s) => s.padStart(4, '0'))
      .filter((s) => s.trim().length > 0);

    if (!refs.length) return null;
    refs.sort((a, b) => Number(a) - Number(b));
    return { from: `#${refs[0]}`, to: `#${refs[refs.length - 1]}`, count: createdLabels.length };
  }, [createdLabels, createdMeta]);

  const handleDownloadCreated = async () => {
    if (!site) return;
    if (!createdRange) return;

    // Prefer range download so we don't need all created label IDs.
    const blob = await apiClient.downloadFile('/labels/bulk-zpl-range', {
      site_id: site.id,
      start_ref: createdRange.from,
      end_ref: createdRange.to,
    });

    const filename = `crossrackref_${makeTimestampLocal()}.txt`;
    await downloadBlobAsNamedTextFile(blob, filename);
  };

  const handleRangeDownload = async () => {
    if (!site) return;

    if (!rangeStart.trim() || !rangeEnd.trim()) {
      setError('Please enter both start and end reference numbers');
      return;
    }

    const extractTrailingNumber = (value: string) => {
      const match = value.trim().match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const start = extractTrailingNumber(rangeStart);
    const end = extractTrailingNumber(rangeEnd);

    if (!start || !end || start < 1 || end < 1 || start > end) {
      setError('Invalid reference range');
      return;
    }

    try {
      setError(null);
      const blob = await apiClient.downloadFile('/labels/bulk-zpl-range', {
        site_id: site.id,
        start_ref: rangeStart,
        end_ref: rangeEnd,
      });

      const filename = `crossrackref_${makeTimestampLocal()}.txt`;
      await downloadBlobAsNamedTextFile(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download labels');
    }
  };

  const handleDownloadCableReport = async () => {
    if (!site) return;

    try {
      setIsGeneratingCableReport(true);
      const { blob, filename } = await apiClient.downloadSiteCableReport(site.id);
      const fallbackFilename = `${String(site.code || '').toUpperCase()}_cable_report_${makeTimestampLocal()}.docx`;
      downloadBlobAsNamedFile(blob, filename || fallbackFilename);
    } catch {
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setIsGeneratingCableReport(false);
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
      <div className="pt-4 space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Site Hub
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="pt-4 space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Site Hub
        </Button>
        <Alert>
          <AlertDescription>Site not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const locationsMissing = locationCount === 0;
  const cableTypesMissing = cableTypeCount === 0;
  const canCreateLabelForSite = canCreateLabels && !locationsMissing && !cableTypesMissing;

  return (
    <div className="pt-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Site Hub
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{site.name}</h1>
            <p className="text-muted-foreground">Cable Index</p>
          </div>
        </div>
      </div>

      {/* Site Information */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center whitespace-nowrap shrink-0">
                <FileText className="mr-2 h-5 w-5" />
                Site Information
              </CardTitle>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {canManageSite && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                      onClick={() => setLocationsOpen(true)}
                    >
                      Manage Site Locations
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                      onClick={() => setCableTypesOpen(true)}
                    >
                      Manage Cable Types
                    </Button>
                  </>
                )}

                {canManageSite && onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    onClick={() => onEdit(site)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Site
                  </Button>
                )}

                {isGlobalAdmin && onDelete && (
                  <Button variant="destructive" size="sm" onClick={() => onDelete(site)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Site
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Site Name</label>
              <p className="text-sm">{site.name}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Site Abbreviation</label>
              <p className="text-sm font-mono">{site.code}</p>
            </div>
            
            {site.location && (
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <MapPin className="mr-1 h-3 w-3" />
                  Site Location
                </label>
                <p className="text-sm">{site.location}</p>
              </div>
            )}
            
            {site.description && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Site Description</label>
                <p className="text-sm whitespace-pre-wrap">{site.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <Calendar className="mr-1 h-3 w-3" />
                  Site Created
                </label>
                <p className="text-sm">{formatDateTime(site.created_at)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Site Last Updated</label>
                <p className="text-sm">{formatDateTime(site.updated_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Tag className="mr-2 h-5 w-5" />
              Bulk Operations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-center">
                <div className="text-sm font-semibold">Cross-Rack Reference Range</div>
                <div className="text-xs text-muted-foreground">Downloads a single .txt for a reference range.</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">From Cable ID</label>
                  <Input
                    placeholder="#0001"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">To Cable ID</label>
                  <Input
                    placeholder="#0100"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <Button variant="outline" onClick={handleRangeDownload}>
                  Download Label Range
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="text-center">
                <div className="text-sm font-semibold">Cable Report</div>
                <div className="text-xs text-muted-foreground">
                  Export a Word document containing site locations, cable types, and all cable runs for this site.
                </div>
              </div>

              <div className="flex justify-center">
                <Button onClick={handleDownloadCableReport} disabled={isGeneratingCableReport}>
                  {isGeneratingCableReport ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Download Cable Report (.docx)'
                  )}
                </Button>
              </div>
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

            {locationsMissing ? (
              canManageSite ? (
                <Button aria-label="Open site locations dialog" onClick={() => setLocationsOpen(true)}>
                  Create Your First Site Location
                </Button>
              ) : null
            ) : cableTypesMissing ? (
              canManageSite ? (
                <Button aria-label="Open cable types dialog" onClick={() => setCableTypesOpen(true)}>
                  Create Your First Cable Type
                </Button>
              ) : null
            ) : canCreateLabels ? (
              <Button aria-label="Open label creation dialog" onClick={() => setCreateLabelOpen(true)}>
                Create Label
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {locationsMissing && !canManageSite && (
            <Alert>
              <AlertDescription>
                No site locations exist yet. Ask an admin to add locations for this site.
              </AlertDescription>
            </Alert>
          )}

          {cableTypesMissing && !canManageSite && (
            <Alert>
              <AlertDescription>
                No cable types exist yet. Ask an admin to add cable types for this site.
              </AlertDescription>
            </Alert>
          )}

          <Dialog open={createLabelOpen} onOpenChange={setCreateLabelOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create Label</DialogTitle>
              </DialogHeader>
              <LabelForm
                onSubmit={handleCreateLabel}
                onCancel={() => setCreateLabelOpen(false)}
                isLoading={creatingLabels}
                lockedSiteId={site.id}
                lockedSiteCode={site.code}
                lockedSiteName={site.name}
              />
            </DialogContent>
          </Dialog>

          <Dialog
            open={createSuccessOpen}
            onOpenChange={(open) => {
              setCreateSuccessOpen(open);
                      if (!open) {
                        setCreatedLabels([]);
                        setCreatedMeta(null);
                      }
            }}
          >
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Success</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="text-sm">
                  {createdRange?.count === 1
                    ? `Label created: ${createdRange.from}`
                    : createdRange
                      ? `Created ${createdRange.count} labels: ${createdRange.from} → ${createdRange.to}`
                      : createdLabels.length > 1
                        ? `Created ${createdLabels.length} labels.`
                        : 'Label created.'}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={handleDownloadCreated} disabled={!createdRange}>
                    Download Label/s.txt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCreateSuccessOpen(false);
                      setCreatedLabels([]);
                      setCreatedMeta(null);
                      setCreateLabelOpen(true);
                    }}
                  >
                    Create Another
                  </Button>
                  <Button onClick={() => setCreateSuccessOpen(false)}>Close</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <LabelDatabase
            fixedSiteId={site.id}
            siteCode={site.code}
            refreshToken={labelsRefreshToken}
            onCreateLabel={canCreateLabelForSite ? () => setCreateLabelOpen(true) : undefined}
            emptyStateDescription={
              locationsMissing
                ? (canManageSite
                  ? 'No site locations exist yet. Add a site location to enable labels.'
                  : 'No site locations exist yet. Ask an admin to add locations for this site.')
                : cableTypesMissing
                  ? (canManageSite
                    ? 'No cable types exist yet. Add a cable type to enable labels.'
                    : 'No cable types exist yet. Ask an admin to add cable types for this site.')
                  : undefined
            }
            emptyStateAction={
              locationsMissing && canManageSite
                ? { label: 'Create Your First Site Location', onClick: () => setLocationsOpen(true) }
                : cableTypesMissing && canManageSite
                  ? { label: 'Create Your First Cable Type', onClick: () => setCableTypesOpen(true) }
                  : undefined
            }
            onLabelsChanged={() => {
              setLabelsRefreshToken((t) => t + 1);
              loadSite();
            }}
          />

          {canManageSite && (
            <SiteLocationsDialog
              open={locationsOpen}
              onOpenChange={setLocationsOpen}
              siteId={site.id}
              siteCode={site.code}
              siteName={site.name}
              onChanged={loadSite}
            />
          )}

          {canManageSite && (
            <SiteCableTypesDialog
              open={cableTypesOpen}
              onOpenChange={setCableTypesOpen}
              siteId={site.id}
              siteCode={site.code}
              siteName={site.name}
              onChanged={loadSite}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDetails;