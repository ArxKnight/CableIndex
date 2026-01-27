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
  Download, 
  Edit, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import apiClient from '../../lib/api';

interface LabelDatabaseProps {
  onEditLabel?: (label: LabelWithSiteInfo) => void;
  onCreateLabel?: () => void;
}

const LabelDatabase: React.FC<LabelDatabaseProps> = ({ 
  onEditLabel, 
  onCreateLabel 
}) => {
  const [labels, setLabels] = useState<LabelWithSiteInfo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  // Search and filter state
  const [searchParams, setSearchParams] = useState<LabelSearchParams>({
    search: '',
    site_id: undefined,
    source: '',
    destination: '',
    reference_number: '',
    limit: 20,
    offset: 0,
    sort_by: 'created_at',
    sort_order: 'DESC',
    include_site_info: true,
  });
  
  // Pagination state
  const [pagination, setPagination] = useState({
    total: 0,
    has_more: false,
  });

  // Load sites for filter dropdown
  useEffect(() => {
    const loadSites = async () => {
      try {
        const response = await apiClient.getSites();
        if (response.success && response.data) {
          setSites(response.data.sites);
        }
      } catch (err) {
        console.error('Failed to load sites:', err);
      }
    };

    loadSites();
  }, []);

  // Load labels
  const loadLabels = useCallback(async (params: LabelSearchParams) => {
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

  const selectAllLabels = () => {
    setSelectedLabels(new Set(labels.map(l => l.id)));
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

    try {
      const response = await apiClient.bulkDeleteLabels(Array.from(selectedLabels));
      if (response.success) {
        setSelectedLabels(new Set());
        loadLabels(searchParams); // Reload labels
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete labels');
    }
  };

  const handleBulkDownload = () => {
    if (selectedLabels.size === 0) return;
    
    const selectedLabelData = labels.filter(l => selectedLabels.has(l.id));
    const zplContent = selectedLabelData.map(label => {
      return `^XA
^MUm^LH8,19^FS
^MUm^FO0,2
^A0N,7,5
^FB280,1,1,C
^FD${label.reference_number} ${label.source} > ${label.destination}
^FS
^XZ`;
    }).join('\n\n');

    const blob = new Blob([zplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels-${selectedLabels.size}-${new Date().toISOString().split('T')[0]}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle individual label operations
  const handleDeleteLabel = async (labelId: number) => {
    if (!confirm('Are you sure you want to delete this label?')) {
      return;
    }

    try {
      const response = await apiClient.deleteLabel(labelId);
      if (response.success) {
        loadLabels(searchParams); // Reload labels
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete label');
    }
  };

  const handleDownloadLabel = (label: LabelWithSiteInfo) => {
    const zplContent = `^XA
^MUm^LH8,19^FS
^MUm^FO0,2
^A0N,7,5
^FB280,1,1,C
^FD${label.reference_number} ${label.source} > ${label.destination}
^FS
^XZ`;

    const blob = new Blob([zplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label.reference_number}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchParams(prev => ({
      ...prev,
      search: '',
      site_id: undefined,
      source: '',
      destination: '',
      reference_number: '',
      offset: 0,
    }));
  };

  const hasActiveFilters = searchParams.search || searchParams.site_id || 
    searchParams.source || searchParams.destination || searchParams.reference_number;

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
          {onCreateLabel && (
            <Button onClick={onCreateLabel}>
              Create Label
            </Button>
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
                  placeholder="Search labels..."
                  value={searchParams.search || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full w-2 h-2" />
                )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="filter-site">Site</Label>
                <select
                  id="filter-site"
                  value={searchParams.site_id || ''}
                  onChange={(e) => handleFilterChange('site_id', e.target.value ? Number(e.target.value) : undefined)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">All sites</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-reference">Reference</Label>
                <Input
                  id="filter-reference"
                  placeholder="e.g., MAIN-001"
                  value={searchParams.reference_number || ''}
                  onChange={(e) => handleFilterChange('reference_number', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-source">Source</Label>
                <Input
                  id="filter-source"
                  placeholder="e.g., Switch A"
                  value={searchParams.source || ''}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-destination">Destination</Label>
                <Input
                  id="filter-destination"
                  placeholder="e.g., Server B"
                  value={searchParams.destination || ''}
                  onChange={(e) => handleFilterChange('destination', e.target.value)}
                />
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Bulk Actions */}
      {selectedLabels.size > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedLabels.size} label{selectedLabels.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                >
                  Clear Selection
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDownload}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download ZPL
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
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
            <div className="text-center p-8">
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters ? 'No labels match your search criteria.' : 'No labels found.'}
              </p>
              {onCreateLabel && !hasActiveFilters && (
                <Button onClick={onCreateLabel}>
                  Create Your First Label
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="border-b bg-muted/50 px-4 py-3">
                <div className="grid grid-cols-12 gap-4 items-center text-sm font-medium">
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectedLabels.size === labels.length ? clearSelection : selectAllLabels}
                      className="h-6 w-6 p-0"
                    >
                      {selectedLabels.size === labels.length ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="col-span-2">Reference</div>
                  <div className="col-span-2">Site</div>
                  <div className="col-span-2">Source</div>
                  <div className="col-span-2">Destination</div>
                  <div className="col-span-2">Created</div>
                  <div className="col-span-1">Actions</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y">
                {labels.map((label) => (
                  <div key={label.id} className="px-4 py-3 hover:bg-muted/50">
                    <div className="grid grid-cols-12 gap-4 items-center text-sm">
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleLabelSelection(label.id)}
                          className="h-6 w-6 p-0"
                        >
                          {selectedLabels.has(label.id) ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="col-span-2 font-mono font-medium">
                        {label.reference_number}
                      </div>
                      <div className="col-span-2">
                        <div>{label.site_name}</div>
                        {label.site_location && (
                          <div className="text-xs text-muted-foreground">
                            {label.site_location}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 truncate" title={label.source}>
                        {label.source}
                      </div>
                      <div className="col-span-2 truncate" title={label.destination}>
                        {label.destination}
                      </div>
                      <div className="col-span-2 text-muted-foreground">
                        {new Date(label.created_at).toLocaleDateString()}
                      </div>
                      <div className="col-span-1">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadLabel(label)}
                            className="h-8 w-8 p-0"
                            title="Download ZPL"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          {onEditLabel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEditLabel(label)}
                              className="h-8 w-8 p-0"
                              title="Edit Label"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLabel(label.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Delete Label"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {label.notes && (
                      <div className="mt-2 text-xs text-muted-foreground pl-8">
                        <strong>Notes:</strong> {label.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.total > (searchParams.limit || 10) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(searchParams.offset || 0) + 1} to {Math.min((searchParams.offset || 0) + (searchParams.limit || 10), pagination.total)} of {pagination.total} labels
          </div>
          
          <div className="flex gap-2">
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