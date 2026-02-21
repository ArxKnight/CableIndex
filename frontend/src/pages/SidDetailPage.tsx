import React from 'react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import { ArrowLeft, Loader2, Pin, PinOff, Save } from 'lucide-react';

import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import usePermissions from '../hooks/usePermissions';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

type SidRecord = any;

type PendingNavigation =
  | { kind: 'path'; to: string }
  | { kind: 'back' }
  | null;

function formatNoteHeader(createdAt: any, username: any): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) {
    const u = String(username ?? '').trim();
    return u ? `${String(createdAt ?? '')} - ${u}` : String(createdAt ?? '');
  }

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).formatToParts(d);

  const getDate = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((p) => p.type === type)?.value ?? '';

  const dateStr = `${getDate('weekday')} ${getDate('day')} ${getDate('month')} ${getDate('year')}`.trim();

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const getTime = (type: Intl.DateTimeFormatPartTypes) =>
    timeParts.find((p) => p.type === type)?.value ?? '';

  const timeStr = `${getTime('hour')}:${getTime('minute')}:${getTime('second')}`;

  const u = String(username ?? '').trim();
  return `${dateStr} - ${timeStr}${u ? ` - ${u}` : ''}`;
}

const SidDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const siteId = Number(params.siteId);
  const sidId = Number(params.sidId);
  const { user } = useAuth();
  const permissions = usePermissions();

  const canEdit = permissions.canAdministerSite(siteId);

  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [sid, setSid] = React.useState<SidRecord | null>(null);
  const [notes, setNotes] = React.useState<any[]>([]);
  const [nics, setNics] = React.useState<any[]>([]);

  const [sidTypes, setSidTypes] = React.useState<any[]>([]);
  const [deviceModels, setDeviceModels] = React.useState<any[]>([]);
  const [cpuModels, setCpuModels] = React.useState<any[]>([]);
  const [vlans, setVlans] = React.useState<any[]>([]);
  const [locations, setLocations] = React.useState<any[]>([]);
  const [siteSids, setSiteSids] = React.useState<any[]>([]);

  const [activeTab, setActiveTab] = React.useState('main');
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const [newNote, setNewNote] = React.useState('');
  const [noteLoading, setNoteLoading] = React.useState(false);
  const [noteError, setNoteError] = React.useState<string | null>(null);

  const [pinLoadingId, setPinLoadingId] = React.useState<number | null>(null);

  // Closing note guard
  const [closingOpen, setClosingOpen] = React.useState(false);
  const [closingNoteText, setClosingNoteText] = React.useState('');
  const [closingError, setClosingError] = React.useState<string | null>(null);
  const [closingLoading, setClosingLoading] = React.useState(false);
  const [allowLeave, setAllowLeave] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation>(null);

  React.useEffect(() => {
    if (!Number.isFinite(siteId) || siteId <= 0 || !Number.isFinite(sidId) || sidId <= 0) return;
    if (allowLeave) return;

    // Prevent browser back from leaving without closing note
    try {
      window.history.pushState({ sid_editor: true }, document.title, window.location.href);
    } catch {
      // ignore
    }

    const onPopState = (e: PopStateEvent) => {
      if (allowLeave) return;
      e.preventDefault();
      try {
        window.history.pushState({ sid_editor: true }, document.title, window.location.href);
      } catch {
        // ignore
      }
      setClosingError(null);
      setClosingNoteText('');
      setPendingNavigation({ kind: 'back' });
      setClosingOpen(true);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [allowLeave, siteId, sidId]);

  React.useEffect(() => {
    if (allowLeave) return;

    // Intercept in-app link clicks (sidebar/header links) to enforce closing note.
    const onClickCapture = (e: MouseEvent) => {
      if (allowLeave) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#')) return;
      if (anchor.target && anchor.target !== '_self') return;

      // Only intercept same-origin navigation
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const current = window.location.pathname + window.location.search + window.location.hash;
      const next = url.pathname + url.search + url.hash;
      if (next === current) return;

      e.preventDefault();
      setClosingError(null);
      setClosingNoteText('');
      setPendingNavigation({ kind: 'path', to: next });
      setClosingOpen(true);
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [allowLeave]);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [allowLeave]);

  const reload = React.useCallback(async () => {
    if (!Number.isFinite(siteId) || siteId <= 0 || !Number.isFinite(sidId) || sidId <= 0) {
      setError('Invalid site or SID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [siteResp, sidResp, typesResp, dmResp, cpuResp, vlanResp, locResp, siteSidsResp] = await Promise.all([
        apiClient.getSite(siteId),
        apiClient.getSiteSid(siteId, sidId),
        apiClient.getSiteSidTypes(siteId),
        apiClient.getSiteSidDeviceModels(siteId),
        apiClient.getSiteSidCpuModels(siteId),
        apiClient.getSiteSidVlans(siteId),
        apiClient.getSiteLocations(siteId),
        apiClient.getSiteSids(siteId, { limit: 500, offset: 0 }),
      ]);

      if (!siteResp.success) throw new Error(siteResp.error || 'Failed to load site');
      if (!sidResp.success) throw new Error(sidResp.error || 'Failed to load SID');

      setSiteName(siteResp.data?.site?.name ?? null);
      setSid(sidResp.data?.sid ?? null);
      setNotes(sidResp.data?.notes ?? []);
      setNics(sidResp.data?.nics ?? []);

      setSidTypes(typesResp.success ? (typesResp.data?.sid_types ?? []) : []);
      setDeviceModels(dmResp.success ? (dmResp.data?.device_models ?? []) : []);
      setCpuModels(cpuResp.success ? (cpuResp.data?.cpu_models ?? []) : []);
      setVlans(vlanResp.success ? (vlanResp.data?.vlans ?? []) : []);
      setLocations(locResp.success ? (locResp.data?.locations ?? []) : []);
      setSiteSids(siteSidsResp.success ? (siteSidsResp.data?.sids ?? []) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId, sidId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const updateSidLocal = (patch: Record<string, any>) => {
    setSid((prev: SidRecord | null) => ({ ...(prev ?? {}), ...patch }));
  };

  const saveSid = async () => {
    if (!sid) return;
    try {
      setSaveLoading(true);
      setSaveError(null);

      const payload: Record<string, any> = {
        sid_type_id: sid.sid_type_id ?? null,
        device_model_id: sid.device_model_id ?? null,
        cpu_model_id: sid.cpu_model_id ?? null,
        hostname: sid.hostname ?? null,
        serial_number: sid.serial_number ?? null,
        asset_tag: sid.asset_tag ?? null,
        status: sid.status ?? null,
        cpu_count: sid.cpu_count ?? null,
        cpu_cores: sid.cpu_cores ?? null,
        cpu_threads: sid.cpu_threads ?? null,
        ram_gb: sid.ram_gb ?? null,
        os_name: sid.os_name ?? null,
        os_version: sid.os_version ?? null,
        mgmt_ip: sid.mgmt_ip ?? null,
        mgmt_mac: sid.mgmt_mac ?? null,
        location_id: sid.location_id ?? null,
      };

      const resp = await apiClient.updateSiteSid(siteId, sidId, payload);
      if (!resp.success) throw new Error(resp.error || 'Failed to save');
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaveLoading(false);
    }
  };

  const saveNics = async () => {
    try {
      setSaveLoading(true);
      setSaveError(null);

      const resp = await apiClient.replaceSiteSidNics(siteId, sidId, {
        nics: (nics ?? []).map((n) => ({
          name: n.name,
          mac_address: n.mac_address ?? null,
          ip_address: n.ip_address ?? null,
          site_vlan_id: n.site_vlan_id ?? null,
          switch_sid_id: n.switch_sid_id ?? null,
          switch_port: n.switch_port ?? null,
        })),
      });

      if (!resp.success) throw new Error(resp.error || 'Failed to save NICs');
      setNics(resp.data?.nics ?? []);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save NICs');
    } finally {
      setSaveLoading(false);
    }
  };

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;

    try {
      setNoteLoading(true);
      setNoteError(null);
      const resp = await apiClient.addSiteSidNote(siteId, sidId, { note_text: text, type: 'NOTE' });
      if (!resp.success) throw new Error(resp.error || 'Failed to add note');
      setNewNote('');
      setNotes((prev) => [resp.data?.note, ...(prev ?? [])].filter(Boolean));
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'Failed to add note');
    } finally {
      setNoteLoading(false);
    }
  };

  const setNotePinned = async (noteId: number, pinned: boolean) => {
    try {
      setPinLoadingId(noteId);
      setNoteError(null);

      const resp = await apiClient.setSiteSidNotePinned(siteId, sidId, noteId, pinned);
      if (!resp.success) throw new Error(resp.error || 'Failed to update pin');
      const updated = resp.data?.note;
      if (!updated) return;

      setNotes((prev) => {
        const next = prev.map((n) => (n.id === noteId ? updated : n));
        next.sort((a, b) => {
          const ap = Number(a?.pinned ?? 0);
          const bp = Number(b?.pinned ?? 0);
          if (bp !== ap) return bp - ap;
          const at = new Date(a?.pinned_at ?? a?.created_at ?? 0).getTime();
          const bt = new Date(b?.pinned_at ?? b?.created_at ?? 0).getTime();
          return bt - at;
        });
        return next;
      });
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'Failed to update pin');
    } finally {
      setPinLoadingId(null);
    }
  };

  const confirmLeaveWithClosingNote = async () => {
    const text = closingNoteText.trim();
    if (!text) {
      setClosingError('Closing note is required');
      return;
    }

    try {
      setClosingLoading(true);
      setClosingError(null);
      const resp = await apiClient.addSiteSidNote(siteId, sidId, { note_text: text, type: 'CLOSING' });
      if (!resp.success) throw new Error(resp.error || 'Failed to add closing note');
      setNotes((prev) => [resp.data?.note, ...(prev ?? [])].filter(Boolean));
      setAllowLeave(true);
      setClosingOpen(false);
      const pending = pendingNavigation;
      setPendingNavigation(null);
      if (pending?.kind === 'path') {
        navigate(pending.to);
      } else if (pending?.kind === 'back') {
        navigate(-1);
      }
    } catch (e) {
      setClosingError(e instanceof Error ? e.message : 'Failed to add closing note');
    } finally {
      setClosingLoading(false);
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

  if (error || !sid) {
    return (
      <div className="pt-4 space-y-4">
        <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}/sid`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to SID Index
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error || 'SID not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (allowLeave) {
                navigate(`/sites/${siteId}/sid`);
                return;
              }
              setClosingError(null);
              setClosingNoteText('');
              setPendingNavigation({ kind: 'path', to: `/sites/${siteId}/sid` });
              setClosingOpen(true);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to SID Index
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{siteName ?? 'Site'} — {sid.sid_number}</h1>
            <p className="text-muted-foreground">SID Editor</p>
          </div>
        </div>

        <Button onClick={saveSid} disabled={!canEdit || saveLoading}>
          {saveLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="main">Main</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="software">Software</TabsTrigger>
          <TabsTrigger value="networking">Networking</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
        </TabsList>

        <TabsContent value="main">
          <Card>
            <CardHeader>
              <CardTitle>Main</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>SID Number</Label>
                  <Input
                    value={sid.sid_number ?? ''}
                    disabled
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input
                    value={sid.status ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ status: e.target.value })}
                    placeholder="e.g. Active"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={sid.sid_type_id ? String(sid.sid_type_id) : ''}
                    onValueChange={(v) => updateSidLocal({ sid_type_id: v ? Number(v) : null })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
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
                    value={sid.device_model_id ? String(sid.device_model_id) : ''}
                    onValueChange={(v) => updateSidLocal({ device_model_id: v ? Number(v) : null })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select device model" />
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
                    value={sid.cpu_model_id ? String(sid.cpu_model_id) : ''}
                    onValueChange={(v) => updateSidLocal({ cpu_model_id: v ? Number(v) : null })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CPU model" />
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
                  <Input
                    value={sid.hostname ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ hostname: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Serial Number</Label>
                  <Input
                    value={sid.serial_number ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ serial_number: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Asset Tag</Label>
                  <Input
                    value={sid.asset_tag ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ asset_tag: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {noteError && (
                  <Alert variant="destructive">
                    <AlertDescription>{noteError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label>Add note</Label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    disabled={noteLoading}
                    placeholder="Write a note for the SID…"
                  />
                  <div className="flex justify-end">
                    <Button onClick={addNote} disabled={noteLoading || newNote.trim() === ''}>
                      {noteLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Add Note'
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No notes yet.</div>
                  ) : (
                    notes.map((n) => {
                      const isPinned = Boolean(n?.pinned);
                      const isAdmin = canEdit;
                      const isOwner = user?.id != null && Number(n?.created_by) === Number(user.id);
                      const canPin = isAdmin || isOwner;
                      const canUnpin = isAdmin;

                      return (
                        <div key={n.id} className="rounded-md border p-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="font-medium">
                              {formatNoteHeader(n.created_at, n.created_by_username)}
                            </div>
                            <div className="flex items-center gap-2">
                              {isPinned ? (
                                canUnpin ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setNotePinned(n.id, false)}
                                    disabled={pinLoadingId === n.id}
                                    title="Unpin"
                                  >
                                    <PinOff className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <div className="text-muted-foreground" title="Pinned">
                                    <Pin className="h-4 w-4" />
                                  </div>
                                )
                              ) : canPin ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setNotePinned(n.id, true)}
                                  disabled={pinLoadingId === n.id}
                                  title="Pin"
                                >
                                  <Pin className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm">{n.note_text}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Card>
            <CardHeader>
              <CardTitle>Hardware</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>CPU Count</Label>
                  <Input
                    type="number"
                    value={sid.cpu_count ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ cpu_count: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPU Cores</Label>
                  <Input
                    type="number"
                    value={sid.cpu_cores ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ cpu_cores: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPU Threads</Label>
                  <Input
                    type="number"
                    value={sid.cpu_threads ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ cpu_threads: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RAM (GB)</Label>
                  <Input
                    type="number"
                    value={sid.ram_gb ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ ram_gb: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="software">
          <Card>
            <CardHeader>
              <CardTitle>Software</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>OS Name</Label>
                  <Input
                    value={sid.os_name ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ os_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>OS Version</Label>
                  <Input
                    value={sid.os_version ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => updateSidLocal({ os_version: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="networking">
          <Card>
            <CardHeader>
              <CardTitle>Networking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Mgmt IP</Label>
                    <Input
                      value={sid.mgmt_ip ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => updateSidLocal({ mgmt_ip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mgmt MAC</Label>
                    <Input
                      value={sid.mgmt_mac ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => updateSidLocal({ mgmt_mac: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>NICs</Label>
                    <Button
                      variant="secondary"
                      onClick={() => setNics((prev) => ([...(prev ?? []), { name: 'eth0' }]))}
                      disabled={!canEdit}
                    >
                      Add NIC
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {nics.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No NICs.</div>
                    ) : (
                      nics.map((nic, idx) => (
                        <Card key={`${idx}-${nic.name ?? 'nic'}`}>
                          <CardContent className="pt-6">
                            <div className="grid gap-4 md:grid-cols-6">
                              <div className="space-y-2 md:col-span-1">
                                <Label>Name</Label>
                                <Input
                                  value={nic.name ?? ''}
                                  disabled={!canEdit}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)));
                                  }}
                                />
                              </div>
                              <div className="space-y-2 md:col-span-1">
                                <Label>MAC</Label>
                                <Input
                                  value={nic.mac_address ?? ''}
                                  disabled={!canEdit}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, mac_address: v } : p)));
                                  }}
                                />
                              </div>
                              <div className="space-y-2 md:col-span-1">
                                <Label>IP</Label>
                                <Input
                                  value={nic.ip_address ?? ''}
                                  disabled={!canEdit}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, ip_address: v } : p)));
                                  }}
                                />
                              </div>
                              <div className="space-y-2 md:col-span-1">
                                <Label>VLAN</Label>
                                <Select
                                  value={nic.site_vlan_id ? String(nic.site_vlan_id) : ''}
                                  onValueChange={(v) => {
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, site_vlan_id: v ? Number(v) : null } : p)));
                                  }}
                                  disabled={!canEdit}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {vlans.map((v) => (
                                      <SelectItem key={v.id} value={String(v.id)}>
                                        {v.vlan_id} — {v.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2 md:col-span-1">
                                <Label>Switch</Label>
                                <Select
                                  value={nic.switch_sid_id ? String(nic.switch_sid_id) : ''}
                                  onValueChange={(v) => {
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, switch_sid_id: v ? Number(v) : null } : p)));
                                  }}
                                  disabled={!canEdit}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {siteSids
                                      .filter((s) => Number(s.id) !== sidId)
                                      .map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>
                                          {s.sid_number}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2 md:col-span-1">
                                <Label>Port</Label>
                                <Input
                                  value={nic.switch_port ?? ''}
                                  disabled={!canEdit}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setNics((prev) => prev.map((p, i) => (i === idx ? { ...p, switch_port: v } : p)));
                                  }}
                                />
                              </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                onClick={() => setNics((prev) => prev.filter((_, i) => i !== idx))}
                                disabled={!canEdit}
                              >
                                Remove
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveNics} disabled={!canEdit || saveLoading}>
                      {saveLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save NICs'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location">
          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Site Location</Label>
                <Select
                  value={sid.location_id ? String(sid.location_id) : ''}
                  onValueChange={(v) => updateSidLocal({ location_id: v ? Number(v) : null })}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.effective_label || l.label || 'Location'} — Floor: {l.floor}
                        {l.suite ? ` | Suite: ${l.suite}` : ''}
                        {l.row ? ` | Row: ${l.row}` : ''}
                        {l.rack ? ` | Rack: ${l.rack}` : ''}
                        {l.area ? ` | Area: ${l.area}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={closingOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingNavigation(null);
            setClosingOpen(false);
          } else {
            setClosingOpen(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Closing Note Required</DialogTitle>
            <DialogDescription>
              You must leave a closing note before leaving this SID editor.
            </DialogDescription>
          </DialogHeader>

          {closingError && (
            <Alert variant="destructive">
              <AlertDescription>{closingError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Closing note</Label>
            <Textarea
              value={closingNoteText}
              onChange={(e) => setClosingNoteText(e.target.value)}
              placeholder="What changed? Why? Any follow-up needed?"
              disabled={closingLoading}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingNavigation(null);
                setClosingOpen(false);
              }}
              disabled={closingLoading}
            >
              Stay
            </Button>
            <Button onClick={confirmLeaveWithClosingNote} disabled={closingLoading}>
              {closingLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save and Leave'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SidDetailPage;
