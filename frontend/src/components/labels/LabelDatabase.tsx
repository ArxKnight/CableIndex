import React, { useState, useEffect, useCallback } from 'react';
import { LabelWithSiteInfo, Site, LabelSearchParams } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardHeader } from '../ui/card';
import { 
  Search, 
  Filter, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  CheckSquare,
  Square,
  Eye,
  X,
  Plus
} from 'lucide-react';
import apiClient from '../../lib/api';
import { formatLocationDisplay, formatLocationFields } from '../../lib/locationFormat';
import LabelDetailsDialog from './LabelDetailsDialog';

interface LabelDatabaseProps {
  onCreateLabel?: () => void;
  initialSiteId?: number;
  fixedSiteId?: number;
  refreshToken?: number;
  onLabelsChanged?: () => void;
  siteCode?: string;
  emptyStateDescription?: string;
  emptyStateAction?: { label: string; onClick: () => void };
}

const LabelDatabase: React.FC<LabelDatabaseProps> = ({ 
  onCreateLabel,
  initialSiteId,
  fixedSiteId,
  refreshToken,
  onLabelsChanged,
  siteCode,
  emptyStateDescription,
  emptyStateAction
}) => {
  const [labels, setLabels] = useState<LabelWithSiteInfo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(fixedSiteId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLabel, setDetailsLabel] = useState<LabelWithSiteInfo | null>(null);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);

  useEffect(() => {
    if (!multiSelectEnabled && selectedLabels.size > 0) {
      setSelectedLabels(new Set());
    }
  }, [multiSelectEnabled, selectedLabels.size]);
  
  // Search and filter state
  const [searchParams, setSearchParams] = useState<LabelSearchParams>({
    search: '',
    site_id: fixedSiteId || 0,
    reference_number: '',
    limit: 25,
    offset: 0,
    sort_by: 'created_at',
    sort_order: 'DESC',
  });
  
  // Pagination state
  const [pagination, setPagination] = useState({
    total: 0,
    has_more: false,
  });

  // Load sites for filter dropdown
  useEffect(() => {
    if (fixedSiteId) {
      return;
    }
    const loadSites = async () => {
      try {
        const response = await apiClient.getSites();
        if (response.success && response.data) {
          setSites(response.data.sites);
          // Set initial selected site
          if (!selectedSiteId) {
            const exists = initialSiteId
              ? response.data.sites.some((s: Site) => s.id === initialSiteId)
              : false;

            if (exists) {
              setSelectedSiteId(initialSiteId!);
            } else if (response.data.sites.length > 0) {
              setSelectedSiteId(response.data.sites[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load sites:', err);
      }
    };

    loadSites();
  }, [fixedSiteId, initialSiteId]);

  // Update search params when selected site changes
  useEffect(() => {
    if (selectedSiteId) {
      setSearchParams(prev => ({
        ...prev,
        site_id: selectedSiteId,
        offset: 0,
      }));
    }
  }, [selectedSiteId]);

  // Load labels
  const loadLabels = useCallback(async (params: LabelSearchParams) => {
    // Don't try to load labels if no site is selected
    if (!params.site_id) {
      setLabels([]);
      setPagination({
        total: 0,
        has_more: false,
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getLabels(params);
      
      if (response.success && response.data) {
        setLabels(response.data.labels);
        setPagination({
          total: response.data.pagination.total,
          has_more: response.data.pagination.has_more,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load labels when search params change
  useEffect(() => {
    loadLabels(searchParams);
  }, [loadLabels, searchParams]);

  // External refresh trigger (e.g., after create/update)
  useEffect(() => {
    if (refreshToken === undefined) return;
    loadLabels(searchParams);
  }, [loadLabels, refreshToken]);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchParams(prev => ({
      ...prev,
      search: value,
      offset: 0, // Reset to first page
    }));
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof LabelSearchParams, value: any) => {
    setSearchParams(prev => ({
      ...prev,
      [key]: value,
      offset: 0, // Reset to first page
    }));
  };

  // Handle pagination
  const handlePageChange = (direction: 'prev' | 'next') => {
    const currentOffset = searchParams.offset || 0;
    const currentLimit = searchParams.limit || 10;
    const newOffset = direction === 'next' 
      ? currentOffset + currentLimit
      : Math.max(0, currentOffset - currentLimit);
    
    setSearchParams(prev => ({
      ...prev,
      offset: newOffset,
    }));
  };

  // Handle label selection
  const toggleLabelSelection = (labelId: number) => {
    setSelectedLabels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(labelId)) {
        newSet.delete(labelId);
      } else {
        newSet.add(labelId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedLabels(new Set());
  };

  // Handle bulk operations
  const handleBulkDelete = async () => {
    if (selectedLabels.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedLabels.size} label(s)?`)) {
      return;
    }

    if (!selectedSiteId) {
      setError('No site selected');
      return;
    }

    try {
      const response = await apiClient.bulkDeleteLabels(selectedSiteId, Array.from(selectedLabels));
      if (response.success) {
        setSelectedLabels(new Set());
        loadLabels(searchParams); // Reload labels
        onLabelsChanged?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete labels');
    }
  };

  const openDetails = (label: LabelWithSiteInfo) => {
    setDetailsLabel(label);
    setDetailsOpen(true);
  };

  const formatRefForSiteDetails = (label: LabelWithSiteInfo): string => {
    if (typeof label.ref_number === 'number' && Number.isFinite(label.ref_number)) {
      return `#${String(label.ref_number).padStart(4, '0')}`;
    }

    const raw = label.ref_string || label.reference_number || '';
    const match = raw.match(/(\d{1,})$/);
    if (match) return `#${match[1].padStart(4, '0')}`;
    return raw;
  };

  const formatCreatedDisplay = (label: LabelWithSiteInfo): string => {
    const date = new Date(label.created_at);
    const datePart = date.toLocaleDateString('en-GB');
    const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const who = label.created_by_name || label.created_by_email || 'Unknown';
    return `${datePart} ${timePart} — ${who}`;
  };

  const clearFilters = () => {
    setSearchParams(prev => ({
      ...prev,
      search: '',
      reference_number: '',
      site_id: selectedSiteId || 0,
      offset: 0,
    }));
  };

  const hasActiveFilters = searchParams.search || searchParams.reference_number;

  const showSiteColumn = !fixedSiteId;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Label Database</h2>
          <p className="text-muted-foreground">
            {pagination.total} label{pagination.total !== 1 ? 's' : ''} total
          </p>
        </div>
        
        <div className="flex gap-2">
          {!fixedSiteId && sites.length > 1 && (
            <select
              value={selectedSiteId || ''}
              onChange={(e) => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={selectedSiteId ? "Search labels..." : "Select a site first to search labels"}
                  value={searchParams.search || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  disabled={!selectedSiteId}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                disabled={!selectedSiteId}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full w-2 h-2" />
                )}
              </Button>

              <Button
                type="button"
                variant={multiSelectEnabled ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setMultiSelectEnabled((v) => !v)}
                disabled={!selectedSiteId}
              >
                {multiSelectEnabled ? (
                  <CheckSquare className="h-4 w-4 mr-1" />
                ) : (
                  <Square className="h-4 w-4 mr-1" />
                )}
                Select Multiple
              </Button>
              
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="filter-reference">Reference</Label>
                <Input
                  id="filter-reference"
                  placeholder="e.g., #0001"
                  value={searchParams.reference_number || ''}
                  onChange={(e) => handleFilterChange('reference_number', e.target.value)}
                />
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Bulk operations */}
      {multiSelectEnabled && selectedLabels.size > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={clearSelection}>
            <X className="h-4 w-4 mr-1" />
            Clear Selection
          </Button>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Selected ({selectedLabels.size})
          </Button>
        </div>
      )}

      {/* Labels List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2">Loading labels...</span>
            </div>
          ) : labels.length === 0 ? (
            <div className="text-center p-12">
              <div className="space-y-4">
                <p className="text-muted-foreground text-lg">
                  {hasActiveFilters ? 'No labels match your search criteria.' : 'No labels exist yet.'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters 
                    ? 'Try adjusting your filters to find what you\'re looking for.'
                    : (emptyStateDescription || (fixedSiteId ? 'Start by creating your first label for this site.' : 'Select a site above and start creating your first label.'))}
                </p>
                {!hasActiveFilters && (emptyStateAction || onCreateLabel) && (
                  <Button onClick={emptyStateAction?.onClick || onCreateLabel} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    {emptyStateAction?.label || 'Create Your First Label'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="border-b bg-muted/50 px-4 py-3">
                <div className="grid grid-cols-12 gap-4 items-center text-sm font-medium">
                  {multiSelectEnabled && (
                    <div className="col-span-1">
                      <span className="sr-only">Select</span>
                    </div>
                  )}

                  <div className="col-span-2">Cable Reference #</div>

                  {showSiteColumn ? (
                    <>
                      <div className="col-span-2">Site</div>
                      <div className={multiSelectEnabled ? 'col-span-2' : 'col-span-3'}>Cable Source</div>
                      <div className={multiSelectEnabled ? 'col-span-2' : 'col-span-3'}>Cable Destination</div>
                      <div className="col-span-2">Created By</div>
                    </>
                  ) : (
                    <>
                      <div className={multiSelectEnabled ? 'col-span-3' : 'col-span-4'}>Cable Source</div>
                      <div className={multiSelectEnabled ? 'col-span-3' : 'col-span-4'}>Cable Destination</div>
                      <div className="col-span-2">Created By</div>
                    </>
                  )}

                  {multiSelectEnabled && <div className="col-span-1 text-right">Actions</div>}
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y">
                {labels.map((label) => {
                  const sourceText = label.source_location
                    ? (fixedSiteId && siteCode
                      ? formatLocationDisplay(label.source_location, siteCode)
                      : formatLocationFields(label.source_location))
                    : (label.source ?? '');

                  const destinationText = label.destination_location
                    ? (fixedSiteId && siteCode
                      ? formatLocationDisplay(label.destination_location, siteCode)
                      : formatLocationFields(label.destination_location))
                    : (label.destination ?? '');

                  return (
                    <div
                      key={label.id}
                      className="px-4 py-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        if (multiSelectEnabled) {
                          toggleLabelSelection(label.id);
                        } else {
                          openDetails(label);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (multiSelectEnabled) {
                            toggleLabelSelection(label.id);
                          } else {
                            openDetails(label);
                          }
                        }
                      }}
                    >
                      <div className="grid grid-cols-12 gap-4 items-center text-sm">
                        {multiSelectEnabled && (
                          <div className="col-span-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLabelSelection(label.id);
                              }}
                              className="h-6 w-6 p-0"
                            >
                              {selectedLabels.has(label.id) ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        )}

                        <div className="col-span-2 font-mono font-medium">
                          {fixedSiteId ? formatRefForSiteDetails(label) : label.reference_number}
                        </div>

                        {showSiteColumn ? (
                          <>
                            <div className="col-span-2">
                              <div>{label.site_name}</div>
                              {label.site_location && (
                                <div className="text-xs text-muted-foreground">
                                  {label.site_location}
                                </div>
                              )}
                            </div>

                            <div
                              className={(multiSelectEnabled ? 'col-span-2' : 'col-span-3') + ' truncate'}
                              title={sourceText || undefined}
                            >
                              {sourceText || '—'}
                            </div>
                            <div
                              className={(multiSelectEnabled ? 'col-span-2' : 'col-span-3') + ' truncate'}
                              title={destinationText || undefined}
                            >
                              {destinationText || '—'}
                            </div>
                            <div className="col-span-2 text-muted-foreground">
                              {formatCreatedDisplay(label)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              className={(multiSelectEnabled ? 'col-span-3' : 'col-span-4') + ' truncate'}
                              title={sourceText || undefined}
                            >
                              {sourceText || '—'}
                            </div>
                            <div
                              className={(multiSelectEnabled ? 'col-span-3' : 'col-span-4') + ' truncate'}
                              title={destinationText || undefined}
                            >
                              {destinationText || '—'}
                            </div>
                            <div className="col-span-2 text-muted-foreground">
                              {formatCreatedDisplay(label)}
                            </div>
                          </>
                        )}

                        {multiSelectEnabled && (
                          <div className="col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails(label);
                              }}
                              aria-label="Open label details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {fixedSiteId && (
        <LabelDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          label={detailsLabel}
          siteId={fixedSiteId}
          siteCode={siteCode || ''}
          onChanged={() => {
            setDetailsLabel(null);
            loadLabels(searchParams);
            onLabelsChanged?.();
          }}
        />
      )}

      {/* Pagination */}
      {pagination.total > (searchParams.limit || 10) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(searchParams.offset || 0) + 1} to {Math.min((searchParams.offset || 0) + (searchParams.limit || 10), pagination.total)} of {pagination.total} labels
          </div>
          
          <div className="flex gap-2">
            <div className="text-sm text-muted-foreground flex items-center px-2">
              Page {Math.floor((searchParams.offset || 0) / (searchParams.limit || 25)) + 1} of {Math.max(1, Math.ceil(pagination.total / (searchParams.limit || 25)))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange('prev')}
              disabled={searchParams.offset === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange('next')}
              disabled={!pagination.has_more}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabelDatabase;