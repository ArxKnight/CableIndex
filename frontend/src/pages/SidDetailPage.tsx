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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

type SidRecord = any;

type SidDetailPageMode = 'view' | 'create';

type SidDetailPageProps = {
  mode?: SidDetailPageMode;
};

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

const SidDetailPage: React.FC<SidDetailPageProps> = ({ mode = 'view' }) => {
  const navigate = useNavigate();
  const params = useParams();
  const isCreate = mode === 'create';
  const siteId = Number(params.siteId);
  const sidId = isCreate ? 0 : Number(params.sidId);
  const { user, memberships } = useAuth();
  const permissions = usePermissions();

  const canEdit = permissions.canAdministerSite(siteId);
  const canCreateSid = Boolean(
    user &&
      (user.role === 'GLOBAL_ADMIN' || (memberships ?? []).some((m) => Number(m.site_id) === siteId))
  );
  const canModify = isCreate ? canCreateSid : canEdit;

  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [sid, setSid] = React.useState<SidRecord | null>(null);
  const [notes, setNotes] = React.useState<any[]>([]);
  const [nics, setNics] = React.useState<any[]>([]);

  const [sidTypes, setSidTypes] = React.useState<any[]>([]);
  const [deviceModels, setDeviceModels] = React.useState<any[]>([]);
  const [cpuModels, setCpuModels] = React.useState<any[]>([]);
  const [platforms, setPlatforms] = React.useState<any[]>([]);
  const [statuses, setStatuses] = React.useState<any[]>([]);
  const [vlans, setVlans] = React.useState<any[]>([]);
  const [locations, setLocations] = React.useState<any[]>([]);
  const [siteSids, setSiteSids] = React.useState<any[]>([]);

  const [activeTab, setActiveTab] = React.useState('main');
  const [mainSubtab, setMainSubtab] = React.useState<'notes' | 'passwords' | 'history'>('notes');
  const [hardwareSubtab, setHardwareSubtab] = React.useState<'configuration' | 'parts'>('configuration');
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const shouldLogViewRef = React.useRef<boolean>(!isCreate);

  const [newNote, setNewNote] = React.useState('');
  const [noteLoading, setNoteLoading] = React.useState(false);
  const [noteError, setNoteError] = React.useState<string | null>(null);

  const [pinLoadingId, setPinLoadingId] = React.useState<number | null>(null);

  const [history, setHistory] = React.useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const [passwordMode, setPasswordMode] = React.useState<'typed' | 'legacy'>('typed');
  const [passwordMeta, setPasswordMeta] = React.useState<any | null>(null);
  const [passwordTypes, setPasswordTypes] = React.useState<any[]>([]);
  const [passwords, setPasswords] = React.useState<any[]>([]);
  const [passwordUsername, setPasswordUsername] = React.useState('');
  const [passwordValue, setPasswordValue] = React.useState('');
  const [passwordLoading, setPasswordLoading] = React.useState(false);
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const [createPasswordOpen, setCreatePasswordOpen] = React.useState(false);
  const [createPasswordTypeId, setCreatePasswordTypeId] = React.useState<string>('');
  const [createPasswordUsername, setCreatePasswordUsername] = React.useState('');
  const [createPasswordValue, setCreatePasswordValue] = React.useState('');

  // Closing note guard
  const [closingOpen, setClosingOpen] = React.useState(false);
  const [closingNoteText, setClosingNoteText] = React.useState('');
  const [closingError, setClosingError] = React.useState<string | null>(null);
  const [closingLoading, setClosingLoading] = React.useState(false);
  const [allowLeave, setAllowLeave] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation>(null);

  React.useEffect(() => {
    if (isCreate) return;
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
    if (isCreate) return;
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
    if (isCreate) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [allowLeave, isCreate]);

  React.useEffect(() => {
    if (isCreate) return;
    shouldLogViewRef.current = true;
  }, [isCreate, siteId, sidId]);

  const reload = React.useCallback(async () => {
    if (!Number.isFinite(siteId) || siteId <= 0) {
      setError('Invalid site');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [
        siteResp,
        sidResp,
        typesResp,
        dmResp,
        cpuResp,
        platformResp,
        statusesResp,
        vlanResp,
        locResp,
        siteSidsResp,
      ] = await Promise.all([
        apiClient.getSite(siteId),
        isCreate
          ? Promise.resolve({ success: true, data: { sid: null, notes: [], nics: [] } } as any)
          : apiClient.getSiteSid(siteId, sidId, { log_view: shouldLogViewRef.current }),
        apiClient.getSiteSidTypes(siteId),
        apiClient.getSiteSidDeviceModels(siteId),
        apiClient.getSiteSidCpuModels(siteId),
        apiClient.getSiteSidPlatforms(siteId),
        apiClient.getSiteSidStatuses(siteId),
        apiClient.getSiteSidVlans(siteId),
        apiClient.getSiteLocations(siteId),
        apiClient.getSiteSids(siteId, { limit: 500, offset: 0 }),
      ]);

      if (!siteResp.success) throw new Error(siteResp.error || 'Failed to load site');
      if (!isCreate && !sidResp.success) throw new Error(sidResp.error || 'Failed to load SID');

      setSiteName(siteResp.data?.site?.name ?? null);
      if (isCreate) {
        setSid({
          site_id: siteId,
          sid_number: '',
          sid_type_id: null,
          device_model_id: null,
          cpu_model_id: null,
          hostname: null,
          serial_number: null,
          status: null,
          cpu_count: null,
          cpu_cores: null,
          cpu_threads: null,
          ram_gb: null,
          platform_id: null,
          os_name: null,
          os_version: null,
          mgmt_ip: null,
          mgmt_mac: null,
          location_id: null,
          rack_u: null,
        });
        setNotes([]);
        setNics([]);
      } else {
        setSid(sidResp.data?.sid ?? null);
        setNotes(sidResp.data?.notes ?? []);
        setNics(sidResp.data?.nics ?? []);
        shouldLogViewRef.current = false;
      }

      setSidTypes(typesResp.success ? (typesResp.data?.sid_types ?? []) : []);
      setDeviceModels(dmResp.success ? (dmResp.data?.device_models ?? []) : []);
      setCpuModels(cpuResp.success ? (cpuResp.data?.cpu_models ?? []) : []);
      setPlatforms(platformResp.success ? (platformResp.data?.platforms ?? []) : []);
      setStatuses(statusesResp.success ? (statusesResp.data?.statuses ?? []) : []);
      setVlans(vlanResp.success ? (vlanResp.data?.vlans ?? []) : []);
      setLocations(locResp.success ? (locResp.data?.locations ?? []) : []);
      setSiteSids(siteSidsResp.success ? (siteSidsResp.data?.sids ?? []) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId, sidId, isCreate]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const updateSidLocal = (patch: Record<string, any>) => {
    setSid((prev: SidRecord | null) => ({ ...(prev ?? {}), ...patch }));
  };

  const statusOptions = React.useMemo(() => {
    const names = (statuses ?? []).map((s) => String(s.name));
    const current = (sid?.status ?? '').toString().trim();
    if (current && !names.includes(current)) return [current, ...names];
    return names;
  }, [statuses, sid?.status]);

  const missingCreatePrereqs = React.useMemo(() => {
    if (!isCreate) return [] as Array<{ key: string; label: string; href?: string }>; 

    const missing: Array<{ key: string; label: string; href?: string }> = [];
    if ((sidTypes ?? []).length === 0) missing.push({ key: 'types', label: 'SID Types', href: `/sites/${siteId}/sid/admin?tab=types` });
    if ((statuses ?? []).length === 0) missing.push({ key: 'statuses', label: 'SID Statuses', href: `/sites/${siteId}/sid/admin?tab=statuses` });
    if ((platforms ?? []).length === 0) missing.push({ key: 'platforms', label: 'Platforms', href: `/sites/${siteId}/sid/admin?tab=platforms` });
    if ((locations ?? []).length === 0) missing.push({ key: 'locations', label: 'Locations', href: `/sites/${siteId}/cable` });
    if ((deviceModels ?? []).length === 0) missing.push({ key: 'models', label: 'Models', href: `/sites/${siteId}/sid/admin?tab=devices` });
    if ((cpuModels ?? []).length === 0) missing.push({ key: 'cpuModels', label: 'CPU Models', href: `/sites/${siteId}/sid/admin?tab=cpus` });
    return missing;
  }, [isCreate, sidTypes, statuses, platforms, locations, deviceModels, cpuModels, siteId]);

  const createPrereqsReady = missingCreatePrereqs.length === 0;

  const loadHistory = React.useCallback(async () => {
    if (isCreate) return;
    if (!Number.isFinite(siteId) || siteId <= 0 || !Number.isFinite(sidId) || sidId <= 0) return;
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const resp = await apiClient.getSiteSidHistory(siteId, sidId);
      if (!resp.success) throw new Error(resp.error || 'Failed to load history');
      setHistory(resp.data?.history ?? []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [siteId, sidId]);

  const loadPassword = React.useCallback(async () => {
    if (isCreate) return;
    if (!Number.isFinite(siteId) || siteId <= 0 || !Number.isFinite(sidId) || sidId <= 0) return;
    if (!canEdit) {
      setPasswordError('Site admin access required');
      return;
    }

    try {
      setPasswordLoading(true);
      setPasswordError(null);

      // Prefer typed passwords (per Password Type)
      const [ptResp, pwResp] = await Promise.all([
        apiClient.getSiteSidPasswordTypes(siteId),
        apiClient.getSiteSidPasswords(siteId, sidId),
      ]);

      if (ptResp.success && pwResp.success) {
        const pts = ptResp.data?.password_types ?? [];
        const pws = pwResp.data?.passwords ?? [];
        setPasswordMode('typed');
        setPasswordTypes(pts);
        setPasswords(pws);
        setPasswordMeta({ key_configured: pwResp.data?.key_configured });

        return;
      }

      // Fallback for older installs / migrations not applied.
      const resp = await apiClient.getSiteSidPassword(siteId, sidId);
      if (!resp.success) {
        const firstError = ptResp.success ? (pwResp.error || resp.error) : (ptResp.error || pwResp.error || resp.error);
        throw new Error(firstError || 'Failed to load passwords');
      }

      const meta = resp.data?.password ?? null;
      setPasswordMode('legacy');
      setPasswordMeta(meta);
      setPasswordTypes([]);
      setPasswords([]);
      setPasswordUsername((meta?.username ?? '').toString());
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to load passwords');
    } finally {
      setPasswordLoading(false);
    }
  }, [siteId, sidId, canEdit, isCreate]);

  const savedPasswordRows = React.useMemo(() => {
    if (passwordMode !== 'typed') return [];
    const list = Array.isArray(passwords) ? passwords : [];
    return list.filter((p: any) => {
      const hasPw = Boolean(p?.has_password);
      const user = (p?.username ?? '').toString().trim();
      return hasPw || user !== '';
    });
  }, [passwordMode, passwords]);

  React.useEffect(() => {
    if (isCreate) return;
    if (activeTab !== 'main') return;
    if (mainSubtab === 'passwords') {
      void loadPassword();
    }
    if (mainSubtab === 'history') {
      void loadHistory();
    }
  }, [activeTab, mainSubtab, loadPassword, loadHistory, isCreate]);

  const saveLegacyPassword = async () => {
    if (isCreate) return;
    if (!canEdit) {
      setPasswordError('Site admin access required');
      return;
    }

    try {
      setPasswordSaving(true);
      setPasswordError(null);

      const usernameTrimmed = passwordUsername.trim();
      const payload: { username?: string | null; password?: string | null } = {
        username: usernameTrimmed === '' ? null : usernameTrimmed,
      };
      if (passwordValue.trim() !== '') {
        payload.password = passwordValue;
      } else {
        payload.password = '';
      }

      const resp = await apiClient.updateSiteSidPassword(siteId, sidId, payload);
      if (!resp.success) throw new Error(resp.error || 'Failed to save');

      setPasswordValue('');
      await loadPassword();
      await loadHistory();
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setPasswordSaving(false);
    }
  };

  const createTypedPassword = async () => {
    if (isCreate) return;
    if (!canEdit) {
      setPasswordError('Site admin access required');
      return;
    }
    const typeId = Number(createPasswordTypeId);
    if (!Number.isFinite(typeId) || typeId <= 0) {
      setPasswordError('Password type is required');
      return;
    }
    const username = createPasswordUsername.trim();
    const password = createPasswordValue;
    if (!username) {
      setPasswordError('Username is required');
      return;
    }
    if (password.trim() === '') {
      setPasswordError('Password is required');
      return;
    }

    try {
      setPasswordSaving(true);
      setPasswordError(null);

      const resp = await apiClient.updateSiteSidPasswordByType(siteId, sidId, typeId, {
        username,
        password,
      });
      if (!resp.success) throw new Error(resp.error || 'Failed to save');

      setCreatePasswordOpen(false);
      setCreatePasswordTypeId('');
      setCreatePasswordUsername('');
      setCreatePasswordValue('');

      await loadPassword();
      await loadHistory();
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setPasswordSaving(false);
    }
  };

  const saveSid = async () => {
    if (!sid) return;
    try {
      setSaveLoading(true);
      setSaveError(null);

      if (isCreate) {
        if (!canCreateSid) {
          throw new Error('Site access required');
        }
        if (!createPrereqsReady) {
          throw new Error('SID prerequisites not configured');
        }
        const status = String(sid.status ?? '').trim();
        if (!status) {
          throw new Error('Status is required');
        }
      }

      const payload: Record<string, any> = {
        sid_type_id: sid.sid_type_id ?? null,
        device_model_id: sid.device_model_id ?? null,
        cpu_model_id: sid.cpu_model_id ?? null,
        hostname: sid.hostname ?? null,
        serial_number: sid.serial_number ?? null,
        status: sid.status ?? null,
        cpu_count: sid.cpu_count ?? null,
        cpu_cores: sid.cpu_cores ?? null,
        cpu_threads: sid.cpu_threads ?? null,
        ram_gb: sid.ram_gb ?? null,
        platform_id: sid.platform_id ?? null,
        os_name: sid.os_name ?? null,
        os_version: sid.os_version ?? null,
        mgmt_ip: sid.mgmt_ip ?? null,
        mgmt_mac: sid.mgmt_mac ?? null,
        location_id: sid.location_id ?? null,
        rack_u: sid.rack_u ?? null,
      };

      // Avoid sending null status on update for legacy SIDs.
      if (!isCreate) {
        const status = String(sid.status ?? '').trim();
        if (!status) {
          delete payload.status;
        } else {
          payload.status = status;
        }
      } else {
        payload.status = String(sid.status ?? '').trim();
      }

      if (isCreate) {
        const resp = await apiClient.createSiteSid(siteId, payload);
        if (!resp.success || !resp.data?.sid?.id) throw new Error(resp.error || 'Failed to create');
        navigate(`/sites/${siteId}/sid/${resp.data.sid.id}`);
      } else {
        const resp = await apiClient.updateSiteSid(siteId, sidId, payload);
        if (!resp.success) throw new Error(resp.error || 'Failed to save');
        await reload();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaveLoading(false);
    }
  };

  const saveNics = async () => {
    if (isCreate) return;
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
    if (isCreate) return;
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
    if (isCreate) return;
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

  const selectedDeviceModel = React.useMemo(() => {
    const deviceModelId = sid?.device_model_id;
    if (!deviceModelId) return null;
    return deviceModels.find((m) => Number(m?.id) === Number(deviceModelId)) ?? null;
  }, [deviceModels, sid?.device_model_id]);

  const selectedPlatform = React.useMemo(() => {
    const platformId = sid?.platform_id;
    if (!platformId) return null;
    return platforms.find((p) => Number(p?.id) === Number(platformId)) ?? null;
  }, [platforms, sid?.platform_id]);

  const modelSummary = React.useMemo(() => {
    const mfr = (selectedDeviceModel?.manufacturer ?? sid?.device_model_manufacturer ?? '').toString().trim();
    const name = (selectedDeviceModel?.name ?? sid?.device_model_name ?? '').toString().trim();
    if (!mfr && !name) return '';
    if (mfr && name) return `${mfr} — ${name}`;
    return name || mfr;
  }, [selectedDeviceModel, sid?.device_model_manufacturer, sid?.device_model_name]);

  const platformSummary = React.useMemo(() => {
    return (selectedPlatform?.name ?? sid?.platform_name ?? '').toString().trim();
  }, [selectedPlatform, sid?.platform_name]);

  const locationSummary = React.useMemo(() => {
    return (sid?.location_effective_label ?? sid?.location_label ?? '').toString().trim();
  }, [sid?.location_effective_label, sid?.location_label]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 mx-auto w-full max-w-6xl">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (error || !sid) {
    return (
      <div className="pt-4 space-y-4 mx-auto w-full max-w-6xl">
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
    <div className="pt-4 space-y-6 mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (isCreate || allowLeave) {
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
            <h1 className="text-2xl font-bold">
              {siteName ?? 'Site'} — {isCreate ? 'New SID' : `SID: ${sid.sid_number}`}
            </h1>
            <p className="text-muted-foreground">{isCreate ? 'SID Editor' : 'SID Opened'}</p>
          </div>
        </div>

        <Button
          onClick={saveSid}
          disabled={
            (isCreate
              ? !canModify || saveLoading || !createPrereqsReady || String(sid?.status ?? '').trim() === ''
              : !canModify || saveLoading)
          }
        >
          {saveLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isCreate ? 'Create SID' : 'Save Edits'}
            </>
          )}
        </Button>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {isCreate && !createPrereqsReady && (
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">SID creation is not available yet</div>
              <div className="text-sm text-muted-foreground">
                {canEdit
                  ? `Set up the following before creating a SID: ${missingCreatePrereqs.map((m) => m.label).join(', ')}.`
                  : `Ask a Site Admin to set up the following before creating a SID: ${missingCreatePrereqs.map((m) => m.label).join(', ')}.`}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {missingCreatePrereqs
                    .filter((m) => m.href)
                    .map((m) => (
                      <Button
                        key={m.key}
                        variant="outline"
                        onClick={() => navigate(m.href!)}
                        disabled={saveLoading}
                      >
                        Go to {m.label}
                      </Button>
                    ))}
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Type & Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={sid.status ? String(sid.status) : ''}
                  onValueChange={(v) => updateSidLocal({ status: v })}
                  disabled={!canModify || (isCreate && !createPrereqsReady)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>SID Type</Label>
                <Select
                  value={sid.sid_type_id ? String(sid.sid_type_id) : ''}
                  onValueChange={(v) => updateSidLocal({ sid_type_id: v ? Number(v) : null })}
                  disabled={!canModify || (isCreate && !createPrereqsReady)}
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>SID Number</Label>
                <Input value={sid.sid_number ?? ''} disabled />
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={modelSummary} disabled />
              </div>

              <div className="space-y-2">
                <Label>Platform</Label>
                <Input value={platformSummary} disabled />
              </div>

              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input value={(sid.hostname ?? '').toString()} disabled />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Location</Label>
                <Input value={locationSummary} disabled />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <CardTitle>Main Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={mainSubtab} onValueChange={(v) => setMainSubtab(v as any)} className="flex gap-6">
                <TabsList className="flex h-fit w-48 flex-col items-stretch">
                  <TabsTrigger value="notes" className="justify-start">
                    Notes
                  </TabsTrigger>
                  <TabsTrigger value="passwords" className="justify-start" disabled={isCreate}>
                    Passwords
                  </TabsTrigger>
                  <TabsTrigger value="history" className="justify-start" disabled={isCreate}>
                    Update History
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1">
                  <TabsContent value="notes" className="m-0">
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
                          disabled={noteLoading || isCreate}
                          placeholder="Write a note for the SID…"
                        />
                        <div className="flex justify-end">
                          <Button onClick={addNote} disabled={noteLoading || isCreate || newNote.trim() === ''}>
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
                              <div
                                key={n.id}
                                className={
                                  isPinned
                                    ? 'rounded-md border border-primary/30 bg-primary/10 p-3 mb-3'
                                    : 'rounded-md border p-3'
                                }
                              >
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <div className={isPinned ? 'font-semibold' : 'font-medium'}>
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
                                <div className={isPinned ? 'mt-2 whitespace-pre-wrap text-sm font-semibold' : 'mt-2 whitespace-pre-wrap text-sm'}>
                                  {n.note_text}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="passwords" className="m-0">
                    <div className="space-y-4">
                      {passwordError && (
                        <Alert variant="destructive">
                          <AlertDescription>{passwordError}</AlertDescription>
                        </Alert>
                      )}

                      {passwordMode === 'legacy' ? (
                        passwordMeta ? (
                          <div className="text-sm text-muted-foreground">
                            {passwordMeta?.password_updated_at ? (
                              <div>
                                Last updated: {new Date(passwordMeta.password_updated_at).toLocaleString()} by {passwordMeta.password_updated_by_username ?? 'Unknown'}
                              </div>
                            ) : (
                              <div>No saved login details yet.</div>
                            )}
                            <div>
                              Password saved: {passwordMeta?.has_password ? 'Yes' : 'No'}
                            </div>
                            {passwordMeta?.key_configured === false && (
                              <div>
                                Encryption key is not configured on the server.
                              </div>
                            )}
                          </div>
                        ) : null
                      ) : (
                        <>
                          {passwordMeta?.key_configured === false && (
                            <div className="text-sm text-muted-foreground">
                              Encryption key is not configured on the server.
                            </div>
                          )}

                          {passwordTypes.length === 0 ? (
                            <div className="rounded-md border p-3">
                              <div className="text-sm font-medium">No password types configured</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {canEdit
                                  ? 'Create Password Types so users can save logins for OS, iDRAC/iLO, switches, etc.'
                                  : 'Ask a Site Admin to create Password Types so you can save logins for OS, iDRAC/iLO, switches, etc.'}
                              </div>
                              {canEdit && (
                                <div className="mt-3">
                                  <Button
                                    variant="outline"
                                    onClick={() => navigate(`/sites/${siteId}/sid/admin?tab=passwordTypes`)}
                                    disabled={passwordLoading || passwordSaving}
                                  >
                                    Go to Password Types
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </>
                      )}

                      {passwordMode === 'legacy' && (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Username</Label>
                              <Input
                                value={passwordUsername}
                                disabled={!canEdit || passwordLoading || passwordSaving}
                                onChange={(e) => setPasswordUsername(e.target.value)}
                                placeholder="e.g. Administrator"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Password</Label>
                              <Input
                                type="password"
                                value={passwordValue}
                                disabled={!canEdit || passwordLoading || passwordSaving}
                                onChange={(e) => setPasswordValue(e.target.value)}
                                placeholder="Enter to overwrite"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={saveLegacyPassword} disabled={!canEdit || passwordLoading || passwordSaving}>
                              {passwordSaving ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Saving…
                                </>
                              ) : (
                                'Save Login Details'
                              )}
                            </Button>
                          </div>
                        </>
                      )}

                      {passwordMode === 'typed' && passwordTypes.length > 0 && (
                        <>
                          <div className="flex justify-end">
                            <Button
                              onClick={() => {
                                setPasswordError(null);
                                setCreatePasswordTypeId('');
                                setCreatePasswordUsername('');
                                setCreatePasswordValue('');
                                setCreatePasswordOpen(true);
                              }}
                              disabled={!canEdit || passwordLoading || passwordSaving}
                            >
                              Create Password
                            </Button>
                          </div>

                          {savedPasswordRows.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              No passwords saved yet.
                            </div>
                          ) : (
                            <div className="rounded-md border p-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Password</TableHead>
                                    <TableHead>Last Updated</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {savedPasswordRows.map((row: any, idx: number) => (
                                    <TableRow key={`${row?.password_type_id ?? 't'}-${idx}`}>
                                      <TableCell className="font-medium">{row?.password_type_name ?? 'Password'}</TableCell>
                                      <TableCell>{row?.username ? String(row.username) : '—'}</TableCell>
                                      <TableCell>{row?.has_password ? 'Saved' : '—'}</TableCell>
                                      <TableCell>{row?.password_updated_at ? new Date(row.password_updated_at).toLocaleString() : '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          <Dialog open={createPasswordOpen} onOpenChange={setCreatePasswordOpen}>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Create Password</DialogTitle>
                                <DialogDescription>
                                  Select a password type and save a username/password for this SID.
                                </DialogDescription>
                              </DialogHeader>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Password Type</Label>
                                  <Select
                                    value={createPasswordTypeId}
                                    onValueChange={(v) => setCreatePasswordTypeId(v)}
                                    disabled={!canEdit || passwordLoading || passwordSaving}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select password type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {passwordTypes.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>
                                          {t.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Username</Label>
                                  <Input
                                    value={createPasswordUsername}
                                    disabled={!canEdit || passwordLoading || passwordSaving}
                                    onChange={(e) => setCreatePasswordUsername(e.target.value)}
                                    placeholder="e.g. Administrator"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Password</Label>
                                  <Input
                                    type="password"
                                    value={createPasswordValue}
                                    disabled={!canEdit || passwordLoading || passwordSaving}
                                    onChange={(e) => setCreatePasswordValue(e.target.value)}
                                    placeholder="Enter password"
                                  />
                                </div>
                              </div>

                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setCreatePasswordOpen(false)}
                                  disabled={passwordSaving}
                                >
                                  Cancel
                                </Button>
                                <Button onClick={createTypedPassword} disabled={passwordSaving}>
                                  {passwordSaving ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Saving…
                                    </>
                                  ) : (
                                    'Save Password'
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="m-0">
                    <div className="space-y-4">
                      {historyError && (
                        <Alert variant="destructive">
                          <AlertDescription>{historyError}</AlertDescription>
                        </Alert>
                      )}

                      {historyLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading history…
                        </div>
                      ) : history.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No history yet.</div>
                      ) : (
                        <div className="space-y-3">
                          {history.map((h) => {
                            let diff: any = null;
                            try {
                              diff = h?.diff_json ? JSON.parse(h.diff_json) : null;
                            } catch {
                              diff = null;
                            }

                            const changeList = Array.isArray(diff?.changes) ? diff.changes : (Array.isArray(diff?.changes?.changes) ? diff.changes.changes : null);

                            const renderedChanges = Array.isArray(changeList)
                              ? changeList
                                  .filter((c: any) => c && typeof c.field === 'string')
                                  .map((c: any) => ({
                                    field: c.field,
                                    from: c.from,
                                    to: c.to,
                                  }))
                              : null;

                            return (
                              <div key={h.id} className="rounded-md border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <div className="font-medium">
                                    {new Date(h.created_at).toLocaleString()} — {h.actor_username ?? 'Unknown'}
                                  </div>
                                  <div className="text-muted-foreground">{h.action}</div>
                                </div>
                                <div className="mt-1 text-sm">{h.summary}</div>

                                {renderedChanges && renderedChanges.length > 0 && (
                                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                    {renderedChanges.map((c: any, idx: number) => (
                                      <div key={`${h.id}-${idx}`}>
                                        {c.field}: {String(c.from ?? '')} → {String(c.to ?? '')}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Card>
            <CardHeader>
              <CardTitle>Hardware</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={hardwareSubtab} onValueChange={(v) => setHardwareSubtab(v as any)} className="flex gap-6">
                <TabsList className="flex h-fit w-48 flex-col items-stretch">
                  <TabsTrigger value="configuration" className="justify-start">
                    Configuration
                  </TabsTrigger>
                  <TabsTrigger value="parts" className="justify-start">
                    Parts
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1">
                  <TabsContent value="configuration" className="m-0">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Device Model</Label>
                        <Select
                          value={sid.device_model_id ? String(sid.device_model_id) : ''}
                          onValueChange={(v) => updateSidLocal({ device_model_id: v ? Number(v) : null })}
                          disabled={!canModify || (isCreate && !createPrereqsReady)}
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
                          onValueChange={(v) => {
                            const nextId = v ? Number(v) : null;
                            const model = cpuModels.find((m) => Number(m?.id) === Number(nextId));
                            updateSidLocal({
                              cpu_model_id: nextId,
                              cpu_cores: model?.cpu_cores ?? sid.cpu_cores ?? null,
                              cpu_threads: model?.cpu_threads ?? sid.cpu_threads ?? null,
                            });
                          }}
                          disabled={!canModify || (isCreate && !createPrereqsReady)}
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
                        <Label>Serial Number</Label>
                        <Input
                          value={sid.serial_number ?? ''}
                          disabled={!canModify || (isCreate && !createPrereqsReady)}
                          onChange={(e) => updateSidLocal({ serial_number: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>CPU Count</Label>
                        <Input
                          type="number"
                          value={sid.cpu_count ?? ''}
                          disabled={!canModify || (isCreate && !createPrereqsReady)}
                          onChange={(e) => updateSidLocal({ cpu_count: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>CPU Cores</Label>
                        <Input
                          type="number"
                          value={sid.cpu_cores ?? ''}
                          disabled
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>CPU Threads</Label>
                        <Input
                          type="number"
                          value={sid.cpu_threads ?? ''}
                          disabled
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>RAM (GB)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={sid.ram_gb ?? ''}
                          disabled={!canModify || (isCreate && !createPrereqsReady)}
                          onChange={(e) => {
                            const t = e.target.value;
                            updateSidLocal({ ram_gb: t === '' ? null : Number.parseFloat(t) });
                          }}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="parts" className="m-0">
                    <div className="text-sm text-muted-foreground">
                      Parts will attach Stock IDs here (coming soon).
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
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
                  <Label>Platform</Label>
                  <Select
                    value={sid.platform_id ? String(sid.platform_id) : ''}
                    onValueChange={(v) => {
                      const nextId = v ? Number(v) : null;
                      const platform = platforms.find((p) => Number(p?.id) === Number(nextId));
                      updateSidLocal({ platform_id: nextId, platform_name: platform?.name ?? sid.platform_name ?? null });
                    }}
                    disabled={!canModify || (isCreate && !createPrereqsReady)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>OS Name</Label>
                  <Input
                    value={sid.os_name ?? ''}
                    disabled={!canModify || (isCreate && !createPrereqsReady)}
                    onChange={(e) => updateSidLocal({ os_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>OS Version</Label>
                  <Input
                    value={sid.os_version ?? ''}
                    disabled={!canModify || (isCreate && !createPrereqsReady)}
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
                    <Label>Hostname</Label>
                    <Input
                      value={sid.hostname ?? ''}
                      disabled={!canModify || (isCreate && !createPrereqsReady)}
                      onChange={(e) => updateSidLocal({ hostname: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mgmt IP</Label>
                    <Input
                      value={sid.mgmt_ip ?? ''}
                      disabled={!canModify || (isCreate && !createPrereqsReady)}
                      onChange={(e) => updateSidLocal({ mgmt_ip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mgmt MAC</Label>
                    <Input
                      value={sid.mgmt_mac ?? ''}
                      disabled={!canModify || (isCreate && !createPrereqsReady)}
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
                      disabled={!canModify || isCreate || (isCreate && !createPrereqsReady)}
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
                    <Button onClick={saveNics} disabled={!canEdit || saveLoading || isCreate}>
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Site Location</Label>
                  <Select
                    value={sid.location_id ? String(sid.location_id) : ''}
                    onValueChange={(v) => updateSidLocal({ location_id: v ? Number(v) : null })}
                    disabled={!canModify || (isCreate && !createPrereqsReady)}
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

                <div className="space-y-2">
                  <Label>Rack Entry</Label>
                  <Input
                    type="text"
                    value={(sid.rack_u ?? '').toString()}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const cleaned = raw.replace(/^u\s*/i, '');
                      updateSidLocal({ rack_u: cleaned.trim() === '' ? null : cleaned });
                    }}
                    disabled={!canModify || (isCreate && !createPrereqsReady)}
                    placeholder="e.g. 12a"
                  />
                </div>
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
              You must leave a closing note before closing this SID.
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
