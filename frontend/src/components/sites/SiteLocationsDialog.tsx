import React, { useEffect, useMemo, useState } from 'react';
import type { SiteLocation } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Trash2, Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatLocationWithPrefix } from '../../lib/locationFormat';

export interface SiteLocationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: number;
  siteCode: string;
  siteName: string;
  onChanged?: () => void;
}

function formatLocationDisplay(siteName: string, siteCode: string, loc: SiteLocation): string {
  const prefix = (siteCode || siteName).toString().trim() || siteCode;
  const base = formatLocationWithPrefix(prefix, loc);
  return base;
}

const SiteLocationsDialog: React.FC<SiteLocationsDialogProps> = ({ open, onOpenChange, siteId, siteCode, siteName, onChanged }) => {
  const [locations, setLocations] = useState<SiteLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLocation, setDeleteLocation] = useState<SiteLocation | null>(null);
  const [deleteUsageLoading, setDeleteUsageLoading] = useState(false);
  const [deleteUsage, setDeleteUsage] = useState<{ source_count: number; destination_count: number; total_in_use: number } | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
  const [cascadeAck, setCascadeAck] = useState(false);
  const [cascadeTyped, setCascadeTyped] = useState('');

  const [label, setLabel] = useState('');
  const [templateType, setTemplateType] = useState<'DATACENTRE' | 'DOMESTIC'>('DATACENTRE');
  const [floor, setFloor] = useState('');
  const [suite, setSuite] = useState('');
  const [row, setRow] = useState('');
  const [rack, setRack] = useState('');
  const [area, setArea] = useState('');

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }, [locations]);

  const otherLocations = useMemo(() => {
    const deleteId = deleteLocation?.id;
    return deleteId ? sortedLocations.filter((l) => l.id !== deleteId) : sortedLocations;
  }, [deleteLocation?.id, sortedLocations]);

  const deleteLocationDisplay = deleteLocation ? formatLocationDisplay(siteName, siteCode, deleteLocation) : '';
  const hasDeleteUsage = (deleteUsage?.total_in_use ?? 0) > 0;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.getSiteLocations(siteId);
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Failed to load locations');
      setLocations(resp.data.locations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, siteId]);

  const resetForm = () => {
    setLabel('');
    setTemplateType('DATACENTRE');
    setFloor('');
    setSuite('');
    setRow('');
    setRack('');
    setArea('');
  };

  const handleCreate = async () => {
    const floorV = floor.trim();
    const suiteV = suite.trim();
    const rowV = row.trim();
    const rackV = rack.trim();
    const areaV = area.trim();

    if (!floorV) {
      setError('Floor is required.');
      return;
    }

    if (templateType === 'DATACENTRE') {
      if (!suiteV || !rowV || !rackV) {
        setError('Suite, Row, and Rack are required for Datacentre/Commercial locations.');
        return;
      }
    } else {
      if (!areaV) {
        setError('Area is required for Domestic locations.');
        return;
      }
    }

    try {
      setWorking(true);
      setError(null);
      const resp = await apiClient.createSiteLocation(siteId, {
        template_type: templateType,
        label: label.trim() || undefined,
        floor: floorV,
        ...(templateType === 'DOMESTIC'
          ? { area: areaV }
          : {
            suite: suiteV,
            row: rowV,
            rack: rackV,
          }),
      });
      if (!resp.success) throw new Error(resp.error || 'Failed to create location');
      resetForm();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location');
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (locationId: number) => {
    const loc = locations.find((l) => l.id === locationId) ?? null;
    setDeleteLocation(loc);
    setDeleteUsage(null);
    setCascadeAck(false);
    setCascadeTyped('');

    const firstOther = locations.find((l) => l.id !== locationId);
    setReassignTargetId(firstOther?.id ? String(firstOther.id) : '');

    setDeleteOpen(true);
    if (!loc?.id) return;

    try {
      setDeleteUsageLoading(true);
      const resp = await apiClient.getSiteLocationUsage(siteId, loc.id);
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Failed to load location usage');
      setDeleteUsage(resp.data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load location usage');
    } finally {
      setDeleteUsageLoading(false);
    }
  };

  const confirmDeleteSimple = async () => {
    if (!deleteLocation?.id) return;

    try {
      setWorking(true);
      setError(null);

      const resp = await apiClient.deleteSiteLocation(siteId, deleteLocation.id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete location');

      setDeleteOpen(false);
      setDeleteLocation(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location');
    } finally {
      setWorking(false);
    }
  };

  const confirmDeleteReassign = async () => {
    if (!deleteLocation?.id) return;
    if (!reassignTargetId) {
      setError('Select a target location to reassign labels.');
      return;
    }

    try {
      setWorking(true);
      setError(null);

      const resp = await apiClient.reassignAndDeleteSiteLocation(siteId, deleteLocation.id, Number(reassignTargetId));
      if (!resp.success) throw new Error(resp.error || 'Failed to delete location');

      setDeleteOpen(false);
      setDeleteLocation(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location');
    } finally {
      setWorking(false);
    }
  };

  const canConfirmCascade =
    !!deleteLocation?.id &&
    !working &&
    cascadeAck &&
    cascadeTyped.trim() === deleteLocationDisplay;

  const confirmDeleteCascade = async () => {
    if (!deleteLocation?.id) return;
    if (!canConfirmCascade) return;

    try {
      setWorking(true);
      setError(null);

      const resp = await apiClient.deleteSiteLocation(siteId, deleteLocation.id, { cascade: true });
      if (!resp.success) throw new Error(resp.error || 'Failed to delete location');

      setDeleteOpen(false);
      setDeleteLocation(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location');
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteOpenChange = (next: boolean) => {
    if (working) return;
    setDeleteOpen(next);
    if (!next) {
      setDeleteLocation(null);
      setDeleteUsage(null);
      setCascadeAck(false);
      setCascadeTyped('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Site Locations</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="rounded-md border p-3 space-y-3">
            <div className="text-sm font-semibold">Add Location</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Template</Label>
                <Select
                  value={templateType}
                  onValueChange={(v) => {
                    const next = v === 'DOMESTIC' ? 'DOMESTIC' : 'DATACENTRE';
                    setTemplateType(next);
                    // Clear incompatible fields when switching templates
                    if (next === 'DOMESTIC') {
                      setSuite('');
                      setRow('');
                      setRack('');
                    } else {
                      setArea('');
                    }
                  }}
                  disabled={working}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DATACENTRE">Datacentre / Commercial</SelectItem>
                    <SelectItem value="DOMESTIC">Domestic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional nickname" disabled={working} />
              </div>

              <div className="space-y-1">
                <Label>Floor</Label>
                <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g., 1" disabled={working} />
              </div>

              {templateType === 'DOMESTIC' ? (
                <div className="space-y-1">
                  <Label>Area</Label>
                  <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g., Garage" disabled={working} />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>Suite</Label>
                    <Input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="e.g., 1" disabled={working} />
                  </div>
                  <div className="space-y-1">
                    <Label>Row</Label>
                    <Input value={row} onChange={(e) => setRow(e.target.value)} placeholder="e.g., A" disabled={working} />
                  </div>
                  <div className="space-y-1">
                    <Label>Rack</Label>
                    <Input value={rack} onChange={(e) => setRack(e.target.value)} placeholder="e.g., 1" disabled={working} />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={working}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Location'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-semibold">Existing Locations</div>
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : sortedLocations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No locations yet.</div>
            ) : (
              <div className="divide-y">
                {sortedLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">
                        {formatLocationDisplay(siteName, siteCode, loc)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(loc.id)}
                      className="text-destructive hover:text-destructive"
                      disabled={working}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Site Location</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteLocationDisplay ? <span className="font-medium text-foreground">{deleteLocationDisplay}</span> : 'Choose how to delete this location.'}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {deleteUsageLoading ? (
              <div className="py-4 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking usage...
              </div>
            ) : !hasDeleteUsage ? (
              <div className="text-sm text-muted-foreground">
                This location is not referenced by any labels.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  This location is used by <span className="font-medium text-foreground">{deleteUsage?.total_in_use ?? 0}</span> labels
                  ({deleteUsage?.source_count ?? 0} as Source, {deleteUsage?.destination_count ?? 0} as Destination).
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-semibold">Option A — Reassign labels, then delete</div>
                  <div className="space-y-1">
                    <Label>Reassign labels to</Label>
                    <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                      <SelectTrigger>
                        <SelectValue placeholder={otherLocations.length ? 'Select a location' : 'No other locations'} />
                      </SelectTrigger>
                      <SelectContent>
                        {otherLocations.map((loc) => (
                          <SelectItem key={loc.id} value={String(loc.id)}>
                            {formatLocationDisplay(siteName, siteCode, loc)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {otherLocations.length === 0 && (
                      <div className="text-xs text-muted-foreground">Create another location first to reassign labels.</div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void confirmDeleteReassign()} disabled={working || !reassignTargetId || otherLocations.length === 0}>
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reassign & Delete'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-destructive/40 p-3 space-y-2">
                  <div className="text-sm font-semibold text-destructive">Option B — Delete location AND labels</div>
                  <div className="text-sm text-muted-foreground">
                    This will delete all labels that use this location as Source or Destination.
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox id="cascade-ack" checked={cascadeAck} onCheckedChange={(v) => setCascadeAck(Boolean(v))} disabled={working} />
                    <Label htmlFor="cascade-ack" className="text-sm leading-5">
                      I understand this will delete labels.
                    </Label>
                  </div>
                  <div className="space-y-1">
                    <Label>Type this exact location name to confirm</Label>
                    <Input value={cascadeTyped} onChange={(e) => setCascadeTyped(e.target.value)} disabled={working} />
                    <div className="text-xs text-muted-foreground">Must match exactly: {deleteLocationDisplay}</div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      onClick={() => void confirmDeleteCascade()}
                      disabled={!canConfirmCascade}
                    >
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Location & Labels'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
              {!hasDeleteUsage && !deleteUsageLoading && (
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmDeleteSimple();
                  }}
                  disabled={!deleteLocation?.id || working}
                >
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Location'}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

export default SiteLocationsDialog;
