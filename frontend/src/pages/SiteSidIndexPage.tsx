import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Search } from 'lucide-react';

import { apiClient } from '../lib/api';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import usePermissions from '../hooks/usePermissions';

const SiteSidIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const siteId = Number(params.siteId);
  const permissions = usePermissions();
  const canEdit = permissions.canAdministerSite(siteId);

  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState('');
  const [sids, setSids] = React.useState<any[]>([]);
  const [sidsLoading, setSidsLoading] = React.useState(false);
  const [sidsError, setSidsError] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState('');
  const [createSidTypeId, setCreateSidTypeId] = React.useState<number | null>(null);
  const [createDeviceModelId, setCreateDeviceModelId] = React.useState<number | null>(null);
  const [createCpuModelId, setCreateCpuModelId] = React.useState<number | null>(null);
  const [createHostname, setCreateHostname] = React.useState('');
  const [createSerialNumber, setCreateSerialNumber] = React.useState('');
  const [createAssetTag, setCreateAssetTag] = React.useState('');
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [picklistsLoading, setPicklistsLoading] = React.useState(false);
  const [picklistsError, setPicklistsError] = React.useState<string | null>(null);
  const [sidTypes, setSidTypes] = React.useState<any[]>([]);
  const [deviceModels, setDeviceModels] = React.useState<any[]>([]);
  const [cpuModels, setCpuModels] = React.useState<any[]>([]);

  React.useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(siteId) || siteId <= 0) {
        setError('Invalid site');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const resp = await apiClient.getSite(siteId);
        if (!resp.success || !resp.data?.site) {
          throw new Error(resp.error || 'Failed to load site');
        }
        setSiteName(resp.data.site.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load site');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [siteId]);

  React.useEffect(() => {
    if (!Number.isFinite(siteId) || siteId <= 0) return;

    const timeout = setTimeout(() => {
      const run = async () => {
        try {
          setSidsLoading(true);
          setSidsError(null);
          const resp = await apiClient.getSiteSids(siteId, { search: search.trim() || undefined, limit: 200, offset: 0 });
          if (!resp.success) throw new Error(resp.error || 'Failed to load SIDs');
          setSids(resp.data?.sids ?? []);
        } catch (e) {
          setSidsError(e instanceof Error ? e.message : 'Failed to load SIDs');
        } finally {
          setSidsLoading(false);
        }
      };

      run();
    }, 250);

    return () => clearTimeout(timeout);
  }, [siteId, search]);

  const openCreate = () => {
    setCreateStatus('');
    setCreateSidTypeId(null);
    setCreateDeviceModelId(null);
    setCreateCpuModelId(null);
    setCreateHostname('');
    setCreateSerialNumber('');
    setCreateAssetTag('');
    setCreateError(null);
    setPicklistsError(null);
    setCreateOpen(true);
  };

  React.useEffect(() => {
    if (!createOpen || !canEdit) return;
    if (!Number.isFinite(siteId) || siteId <= 0) return;

    const run = async () => {
      try {
        setPicklistsLoading(true);
        setPicklistsError(null);
        const [typesResp, dmResp, cpuResp] = await Promise.all([
          apiClient.getSiteSidTypes(siteId),
          apiClient.getSiteSidDeviceModels(siteId),
          apiClient.getSiteSidCpuModels(siteId),
        ]);
        setSidTypes(typesResp.success ? (typesResp.data?.sid_types ?? []) : []);
        setDeviceModels(dmResp.success ? (dmResp.data?.device_models ?? []) : []);
        setCpuModels(cpuResp.success ? (cpuResp.data?.cpu_models ?? []) : []);
      } catch (e) {
        setPicklistsError(e instanceof Error ? e.message : 'Failed to load picklists');
      } finally {
        setPicklistsLoading(false);
      }
    };

    run();
  }, [createOpen, canEdit, siteId]);

  const submitCreate = async () => {
    try {
      setCreateLoading(true);
      setCreateError(null);
      const resp = await apiClient.createSiteSid(siteId, {
        status: createStatus.trim() || null,
        sid_type_id: createSidTypeId,
        device_model_id: createDeviceModelId,
        cpu_model_id: createCpuModelId,
        hostname: createHostname.trim() || null,
        serial_number: createSerialNumber.trim() || null,
        asset_tag: createAssetTag.trim() || null,
      });
      if (!resp.success || !resp.data?.sid?.id) {
        throw new Error(resp.error || 'Failed to create SID');
      }
      setCreateOpen(false);
      navigate(`/sites/${siteId}/sid/${resp.data.sid.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create SID');
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-4 space-y-4">
        <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Site Hub
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-6 mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Site Hub
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{siteName ?? 'Site'}</h1>
            <p className="text-muted-foreground">SID Index</p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/sites/${siteId}/sid/admin`)}>
              SID Admin
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create SID
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SID Index</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by SID number, hostname, serial, asset tag…"
                  className="pl-8"
                />
              </div>
            </div>

            {sidsError && (
              <Alert variant="destructive">
                <AlertDescription>{sidsError}</AlertDescription>
              </Alert>
            )}

            {sidsLoading ? (
              <div className="flex items-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading SIDs…
              </div>
            ) : sids.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">No SIDs found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SID</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Serial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sids.map((sid) => (
                    <TableRow
                      key={sid.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sites/${siteId}/sid/${sid.id}`)}
                    >
                      <TableCell className="font-medium">{sid.sid_number}</TableCell>
                      <TableCell>{sid.hostname || '—'}</TableCell>
                      <TableCell>{sid.status || '—'}</TableCell>
                      <TableCell>{sid.serial_number || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen && canEdit} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setCreateError(null);
          setPicklistsError(null);
          setCreateStatus('');
          setCreateSidTypeId(null);
          setCreateDeviceModelId(null);
          setCreateCpuModelId(null);
          setCreateHostname('');
          setCreateSerialNumber('');
          setCreateAssetTag('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create SID</DialogTitle>
            <DialogDescription>
              Enter the SID details. The SID number will be assigned automatically (starting at 1).
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <Alert variant="destructive">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}

          {picklistsError && (
            <Alert variant="destructive">
              <AlertDescription>{picklistsError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Input
                value={createStatus}
                onChange={(e) => setCreateStatus(e.target.value)}
                placeholder="e.g. Active"
                disabled={createLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={createSidTypeId ? String(createSidTypeId) : ''}
                onValueChange={(v) => setCreateSidTypeId(v ? Number(v) : null)}
                disabled={createLoading || picklistsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={picklistsLoading ? 'Loading…' : 'Select type'} />
                </SelectTrigger>
                <SelectContent>
                  {sidTypes.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Device Model</Label>
              <Select
                value={createDeviceModelId ? String(createDeviceModelId) : ''}
                onValueChange={(v) => setCreateDeviceModelId(v ? Number(v) : null)}
                disabled={createLoading || picklistsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={picklistsLoading ? 'Loading…' : 'Select device model'} />
                </SelectTrigger>
                <SelectContent>
                  {deviceModels.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.manufacturer ? `${m.manufacturer} — ${m.name}` : m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>CPU Model</Label>
              <Select
                value={createCpuModelId ? String(createCpuModelId) : ''}
                onValueChange={(v) => setCreateCpuModelId(v ? Number(v) : null)}
                disabled={createLoading || picklistsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={picklistsLoading ? 'Loading…' : 'Select CPU model'} />
                </SelectTrigger>
                <SelectContent>
                  {cpuModels.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.manufacturer ? `${m.manufacturer} — ${m.name}` : m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hostname</Label>
              <Input value={createHostname} onChange={(e) => setCreateHostname(e.target.value)} disabled={createLoading} />
            </div>

            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input value={createSerialNumber} onChange={(e) => setCreateSerialNumber(e.target.value)} disabled={createLoading} />
            </div>

            <div className="space-y-2">
              <Label>Asset Tag</Label>
              <Input value={createAssetTag} onChange={(e) => setCreateAssetTag(e.target.value)} disabled={createLoading} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createLoading}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createLoading}>
              {createLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteSidIndexPage;
