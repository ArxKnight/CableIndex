import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';

import { apiClient } from '../lib/api';
import usePermissions from '../hooks/usePermissions';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import SiteLocationsManager from '../components/sites/SiteLocationsManager';

const SiteSidAdminPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const siteId = Number(params.siteId);
  const permissions = usePermissions();
  const canAdmin = permissions.canAdministerSite(siteId);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [siteCode, setSiteCode] = React.useState<string | null>(null);

  const [sidTypes, setSidTypes] = React.useState<any[]>([]);
  const [deviceModels, setDeviceModels] = React.useState<any[]>([]);
  const [cpuModels, setCpuModels] = React.useState<any[]>([]);
  const [platforms, setPlatforms] = React.useState<any[]>([]);
  const [statuses, setStatuses] = React.useState<any[]>([]);
  const [passwordTypes, setPasswordTypes] = React.useState<any[]>([]);
  const [vlans, setVlans] = React.useState<any[]>([]);

  const [busy, setBusy] = React.useState(false);
  const [opError, setOpError] = React.useState<string | null>(null);

  const [addDialog, setAddDialog] = React.useState<
    null | 'sidType' | 'deviceModel' | 'cpuModel' | 'platform' | 'status' | 'passwordType' | 'vlan'
  >(null);

  const [newTypeName, setNewTypeName] = React.useState('');
  const [newDeviceManufacturer, setNewDeviceManufacturer] = React.useState('');
  const [newDeviceName, setNewDeviceName] = React.useState('');
  const [newCpuManufacturer, setNewCpuManufacturer] = React.useState('');
  const [newCpuName, setNewCpuName] = React.useState('');
  const [newCpuCores, setNewCpuCores] = React.useState('');
  const [newCpuThreads, setNewCpuThreads] = React.useState('');
  const [newPlatformName, setNewPlatformName] = React.useState('');
  const [newStatusName, setNewStatusName] = React.useState('');
  const [newPasswordTypeName, setNewPasswordTypeName] = React.useState('');
  const [newVlanId, setNewVlanId] = React.useState('');
  const [newVlanName, setNewVlanName] = React.useState('');

  const [activeTab, setActiveTab] = React.useState<'types' | 'devices' | 'cpus' | 'platforms' | 'statuses' | 'locations' | 'passwordTypes' | 'vlans'>('types');

  React.useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    const allowed = new Set(['types', 'devices', 'cpus', 'platforms', 'statuses', 'locations', 'passwordTypes', 'vlans']);
    if (tab && allowed.has(tab)) {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  const closeAddDialog = () => {
    setAddDialog(null);
    setOpError(null);
  };

  const load = React.useCallback(async () => {
    if (!Number.isFinite(siteId) || siteId <= 0) {
      setError('Invalid site');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [siteResp, typesResp, dmResp, cpuResp, platformResp, statusesResp, passwordTypesResp, vlanResp] = await Promise.all([
        apiClient.getSite(siteId),
        apiClient.getSiteSidTypes(siteId),
        apiClient.getSiteSidDeviceModels(siteId),
        apiClient.getSiteSidCpuModels(siteId),
        apiClient.getSiteSidPlatforms(siteId),
        apiClient.getSiteSidStatuses(siteId),
        apiClient.getSiteSidPasswordTypes(siteId),
        apiClient.getSiteSidVlans(siteId),
      ]);

      if (!siteResp.success || !siteResp.data?.site) {
        throw new Error(siteResp.error || 'Failed to load site');
      }
      setSiteName(siteResp.data.site.name ?? null);
      setSiteCode(siteResp.data.site.code ?? null);

      setSidTypes(typesResp.success ? (typesResp.data?.sid_types ?? []) : []);
      setDeviceModels(dmResp.success ? (dmResp.data?.device_models ?? []) : []);
      setCpuModels(cpuResp.success ? (cpuResp.data?.cpu_models ?? []) : []);
      setPlatforms(platformResp.success ? (platformResp.data?.platforms ?? []) : []);
      setStatuses(statusesResp.success ? (statusesResp.data?.statuses ?? []) : []);
      setPasswordTypes(passwordTypesResp.success ? (passwordTypesResp.data?.password_types ?? []) : []);
      setVlans(vlanResp.success ? (vlanResp.data?.vlans ?? []) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const requireAdmin = (): boolean => {
    if (!canAdmin) {
      setOpError('Site admin access required');
      return false;
    }
    return true;
  };

  const createType = async () => {
    if (!requireAdmin()) return;
    const name = newTypeName.trim();
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidType(siteId, { name });
      if (!resp.success) throw new Error(resp.error || 'Failed to create type');
      setNewTypeName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create type');
    } finally {
      setBusy(false);
    }
  };

  const deleteType = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidType(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete type');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete type');
    } finally {
      setBusy(false);
    }
  };

  const createDeviceModel = async () => {
    if (!requireAdmin()) return;
    const name = newDeviceName.trim();
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidDeviceModel(siteId, {
        manufacturer: newDeviceManufacturer.trim() || null,
        name,
      });
      if (!resp.success) throw new Error(resp.error || 'Failed to create device model');
      setNewDeviceManufacturer('');
      setNewDeviceName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create device model');
    } finally {
      setBusy(false);
    }
  };

  const deleteDeviceModel = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidDeviceModel(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete device model');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete device model');
    } finally {
      setBusy(false);
    }
  };

  const createCpuModel = async () => {
    if (!requireAdmin()) return;
    const name = newCpuName.trim();
    const cpuCores = Number(newCpuCores);
    const cpuThreads = Number(newCpuThreads);
    if (!name) {
      setOpError('Name is required');
      return;
    }
    if (!Number.isFinite(cpuCores) || cpuCores <= 0) {
      setOpError('CPU cores must be a positive number');
      return;
    }
    if (!Number.isFinite(cpuThreads) || cpuThreads <= 0) {
      setOpError('CPU threads must be a positive number');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidCpuModel(siteId, {
        manufacturer: newCpuManufacturer.trim() || null,
        name,
        cpu_cores: cpuCores,
        cpu_threads: cpuThreads,
      });
      if (!resp.success) throw new Error(resp.error || 'Failed to create CPU model');
      setNewCpuManufacturer('');
      setNewCpuName('');
      setNewCpuCores('');
      setNewCpuThreads('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create CPU model');
    } finally {
      setBusy(false);
    }
  };

  const deleteCpuModel = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidCpuModel(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete CPU model');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete CPU model');
    } finally {
      setBusy(false);
    }
  };

  const createPlatform = async () => {
    if (!requireAdmin()) return;
    const name = newPlatformName.trim();
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidPlatform(siteId, { name });
      if (!resp.success) throw new Error(resp.error || 'Failed to create platform');
      setNewPlatformName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create platform');
    } finally {
      setBusy(false);
    }
  };

  const createStatus = async () => {
    if (!requireAdmin()) return;
    const name = newStatusName.trim();
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidStatus(siteId, { name });
      if (!resp.success) throw new Error(resp.error || 'Failed to create status');
      setNewStatusName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create status');
    } finally {
      setBusy(false);
    }
  };

  const deleteStatus = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidStatus(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete status');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete status');
    } finally {
      setBusy(false);
    }
  };

  const createPasswordType = async () => {
    if (!requireAdmin()) return;
    const name = newPasswordTypeName.trim();
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidPasswordType(siteId, { name });
      if (!resp.success) throw new Error(resp.error || 'Failed to create password type');
      setNewPasswordTypeName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create password type');
    } finally {
      setBusy(false);
    }
  };

  const deletePasswordType = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidPasswordType(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete password type');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete password type');
    } finally {
      setBusy(false);
    }
  };

  const deletePlatform = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidPlatform(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete platform');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete platform');
    } finally {
      setBusy(false);
    }
  };

  const createVlan = async () => {
    if (!requireAdmin()) return;
    const vlanId = Number(newVlanId);
    const name = newVlanName.trim();
    if (!Number.isFinite(vlanId) || vlanId <= 0 || vlanId > 4094) {
      setOpError('VLAN ID must be 1-4094');
      return;
    }
    if (!name) {
      setOpError('Name is required');
      return;
    }

    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.createSiteSidVlan(siteId, { vlan_id: vlanId, name });
      if (!resp.success) throw new Error(resp.error || 'Failed to create VLAN');
      setNewVlanId('');
      setNewVlanName('');
      await load();
      closeAddDialog();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to create VLAN');
    } finally {
      setBusy(false);
    }
  };

  const deleteVlan = async (id: number) => {
    if (!requireAdmin()) return;
    try {
      setBusy(true);
      setOpError(null);
      const resp = await apiClient.deleteSiteSidVlan(siteId, id);
      if (!resp.success) throw new Error(resp.error || 'Failed to delete VLAN');
      await load();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Failed to delete VLAN');
    } finally {
      setBusy(false);
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
      <div className="pt-4 space-y-4 mx-auto w-full max-w-6xl">
        <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}/sid`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to SID Index
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-6 mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}/sid`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to SID Index
          </Button>
          <div>
            <h1 className="text-2xl font-bold">SID Admin</h1>
            <p className="text-muted-foreground">Picklists</p>
          </div>
        </div>
      </div>

      {!canAdmin && (
        <Alert variant="destructive">
          <AlertDescription>Site admin access required.</AlertDescription>
        </Alert>
      )}

      {opError && (
        <Alert variant="destructive">
          <AlertDescription>{opError}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="types">SID Types</TabsTrigger>
          <TabsTrigger value="devices">Device Models</TabsTrigger>
          <TabsTrigger value="cpus">CPU Models</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="passwordTypes">Password Types</TabsTrigger>
          <TabsTrigger value="vlans">VLANs</TabsTrigger>
        </TabsList>

        <TabsContent value="types">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>SID Types</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewTypeName('');
                  setAddDialog('sidType');
                }}
                disabled={!canAdmin || busy}
              >
                Add SID Type
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sidTypes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deleteType(t.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Device Models</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewDeviceManufacturer('');
                  setNewDeviceName('');
                  setAddDialog('deviceModel');
                }}
                disabled={!canAdmin || busy}
              >
                Add Device Model
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviceModels.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.manufacturer || '—'}</TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deleteDeviceModel(m.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cpus">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>CPU Models</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewCpuManufacturer('');
                  setNewCpuName('');
                  setNewCpuCores('');
                  setNewCpuThreads('');
                  setAddDialog('cpuModel');
                }}
                disabled={!canAdmin || busy}
              >
                Add CPU Model
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cpuModels.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.manufacturer || '—'}</TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deleteCpuModel(m.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platforms">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Platforms</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewPlatformName('');
                  setAddDialog('platform');
                }}
                disabled={!canAdmin || busy}
              >
                Add Platform
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platforms.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deletePlatform(p.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statuses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Statuses</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewStatusName('');
                  setAddDialog('status');
                }}
                disabled={!canAdmin || busy}
              >
                Add Status
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statuses.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deleteStatus(s.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <Card>
            <CardHeader>
              <CardTitle>Locations</CardTitle>
            </CardHeader>
            <CardContent>
              <SiteLocationsManager
                siteId={siteId}
                siteCode={siteCode ?? ''}
                siteName={siteName ?? ''}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="passwordTypes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Password Types</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewPasswordTypeName('');
                  setAddDialog('passwordType');
                }}
                disabled={!canAdmin || busy}
              >
                Add Password Type
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {passwordTypes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deletePasswordType(t.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vlans">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>VLANs</CardTitle>
              <Button
                onClick={() => {
                  setOpError(null);
                  setNewVlanId('');
                  setNewVlanName('');
                  setAddDialog('vlan');
                }}
                disabled={!canAdmin || busy}
              >
                Add VLAN
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>VLAN</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vlans.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.vlan_id}</TableCell>
                      <TableCell>{v.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => deleteVlan(v.id)} disabled={!canAdmin || busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addDialog !== null} onOpenChange={(open) => !open && closeAddDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addDialog === 'sidType'
                ? 'Add SID Type'
                : addDialog === 'deviceModel'
                  ? 'Add Device Model'
                  : addDialog === 'cpuModel'
                    ? 'Add CPU Model'
                    : addDialog === 'platform'
                      ? 'Add Platform'
                      : addDialog === 'status'
                        ? 'Add Status'
                        : addDialog === 'passwordType'
                          ? 'Add Password Type'
                    : addDialog === 'vlan'
                      ? 'Add VLAN'
                      : ''}
            </DialogTitle>
            <DialogDescription>
              {addDialog === 'sidType'
                ? 'Create a new SID type for this site.'
                : addDialog === 'deviceModel'
                  ? 'Create a new device model for this site.'
                  : addDialog === 'cpuModel'
                    ? 'Create a new CPU model for this site.'
                  : addDialog === 'platform'
                    ? 'Create a new platform (OS family) for this site.'
                      : addDialog === 'status'
                        ? 'Create a new status for this site.'
                        : addDialog === 'passwordType'
                          ? 'Create a new password type for this site.'
                    : addDialog === 'vlan'
                      ? 'Create a new VLAN for this site.'
                      : ''}
            </DialogDescription>
          </DialogHeader>

          {addDialog === 'sidType' && (
            <div className="space-y-2">
              <Label htmlFor="add-sid-type">Name</Label>
              <Input
                id="add-sid-type"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                disabled={!canAdmin || busy}
                placeholder="e.g., Server, Switch, Patch Panel"
              />
            </div>
          )}

          {addDialog === 'deviceModel' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-device-mfr">Manufacturer</Label>
                <Input
                  id="add-device-mfr"
                  value={newDeviceManufacturer}
                  onChange={(e) => setNewDeviceManufacturer(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g., Dell"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-device-name">Name</Label>
                <Input
                  id="add-device-name"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g., R740"
                />
              </div>
            </div>
          )}

          {addDialog === 'cpuModel' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-cpu-mfr">Manufacturer</Label>
                <Input
                  id="add-cpu-mfr"
                  value={newCpuManufacturer}
                  onChange={(e) => setNewCpuManufacturer(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g., Intel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-cpu-name">Name</Label>
                <Input
                  id="add-cpu-name"
                  value={newCpuName}
                  onChange={(e) => setNewCpuName(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g., Xeon Gold 6130"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="add-cpu-cores">CPU Cores</Label>
                  <Input
                    id="add-cpu-cores"
                    type="number"
                    value={newCpuCores}
                    onChange={(e) => setNewCpuCores(e.target.value)}
                    disabled={!canAdmin || busy}
                    placeholder="e.g., 16"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-cpu-threads">CPU Threads</Label>
                  <Input
                    id="add-cpu-threads"
                    type="number"
                    value={newCpuThreads}
                    onChange={(e) => setNewCpuThreads(e.target.value)}
                    disabled={!canAdmin || busy}
                    placeholder="e.g., 32"
                  />
                </div>
              </div>
            </div>
          )}

          {addDialog === 'platform' && (
            <div className="space-y-2">
              <Label htmlFor="add-platform">Name</Label>
              <Input
                id="add-platform"
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                disabled={!canAdmin || busy}
                placeholder="e.g., Windows, Linux, ESXi"
              />
            </div>
          )}

          {addDialog === 'status' && (
            <div className="space-y-2">
              <Label htmlFor="add-status">Name</Label>
              <Input
                id="add-status"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                disabled={!canAdmin || busy}
                placeholder="e.g., Active"
              />
            </div>
          )}

          {addDialog === 'passwordType' && (
            <div className="space-y-2">
              <Label htmlFor="add-password-type">Name</Label>
              <Input
                id="add-password-type"
                value={newPasswordTypeName}
                onChange={(e) => setNewPasswordTypeName(e.target.value)}
                disabled={!canAdmin || busy}
                placeholder="e.g., Admin OS Credentials, iDRAC Credentials"
              />
            </div>
          )}

          {addDialog === 'vlan' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-vlan-id">VLAN ID</Label>
                <Input
                  id="add-vlan-id"
                  value={newVlanId}
                  onChange={(e) => setNewVlanId(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-vlan-name">Name</Label>
                <Input
                  id="add-vlan-name"
                  value={newVlanName}
                  onChange={(e) => setNewVlanName(e.target.value)}
                  disabled={!canAdmin || busy}
                  placeholder="e.g., Management"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (addDialog === 'sidType') await createType();
                else if (addDialog === 'deviceModel') await createDeviceModel();
                else if (addDialog === 'cpuModel') await createCpuModel();
                else if (addDialog === 'platform') await createPlatform();
                else if (addDialog === 'status') await createStatus();
                else if (addDialog === 'passwordType') await createPasswordType();
                else if (addDialog === 'vlan') await createVlan();
              }}
              disabled={!canAdmin || busy}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteSidAdminPage;
