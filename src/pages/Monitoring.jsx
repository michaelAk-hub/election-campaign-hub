import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Radar,
  Plus,
  Trash2,
  Pencil,
  PlayCircle,
  Power,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const SESSION_TOKEN = () => localStorage.getItem('app_session_token');

const TYPE_LABELS = {
  website: 'Ιστοσελίδα',
  rss: 'RSS',
  facebook_rss: 'Facebook (RSS)',
  instagram_rss: 'Instagram (RSS)',
};

const STATUS_LABELS = {
  never: 'Ποτέ',
  no_change: 'Καμία αλλαγή',
  changed: 'Αλλαγή',
  error: 'Σφάλμα',
};

const EVENT_LABELS = {
  check: 'Έλεγχος',
  update_found: 'Βρέθηκε ενημέρωση',
  notification_sent: 'Ειδοποίηση εστάλη',
  notification_failed: 'Αποτυχία ειδοποίησης',
  fetch_error: 'Σφάλμα λήψης',
  parse_error: 'Σφάλμα ανάλυσης',
  timeout: 'Λήξη χρόνου',
  blocked: 'Αποκλεισμός',
  skipped: 'Παράλειψη',
};

const EMPTY_SOURCE = {
  name: '',
  type: 'rss',
  url: '',
  css_selector: '',
  check_interval: 15,
  active: true,
  notes: '',
};

function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate();
}

export default function Monitoring() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overview');

  // Source add/edit dialog
  const [sourceDialog, setSourceDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY_SOURCE);

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });

  // Test result dialog
  const [testDialog, setTestDialog] = useState({ open: false, loading: false, result: null, name: '' });

  // Log filters
  const [logFilters, setLogFilters] = useState({ source_name: 'all', status: 'all', event_type: 'all' });

  // Settings form (local mirror)
  const [settingsForm, setSettingsForm] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);

  // ---- Queries (direct client reads; entities locked to admins via RLS) ----
  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ['monitor-sources'],
    queryFn: () => base44.entities.MonitorSource.list('-created_date'),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['monitor-logs'],
    queryFn: () => base44.entities.MonitorLog.list('-created_date', 500),
  });

  const { data: settingsList = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['monitor-settings'],
    queryFn: () => base44.entities.MonitorSetting.list(),
  });
  const settings = settingsList[0] || null;

  // ---- Mutations ----
  const saveSource = useMutation({
    mutationFn: ({ id, data }) =>
      id ? base44.entities.MonitorSource.update(id, data) : base44.entities.MonitorSource.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['monitor-sources']);
      setSourceDialog({ open: false, editing: null });
      toast.success('Η πηγή αποθηκεύτηκε');
    },
    onError: (e) => toast.error(`Αποτυχία αποθήκευσης: ${e?.message || e}`),
  });

  const deleteSource = useMutation({
    mutationFn: (id) => base44.entities.MonitorSource.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['monitor-sources']);
      setDeleteDialog({ open: false, id: null, name: '' });
      toast.success('Η πηγή διαγράφηκε');
    },
    onError: (e) => toast.error(`Αποτυχία διαγραφής: ${e?.message || e}`),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }) => base44.entities.MonitorSource.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries(['monitor-sources']),
  });

  const saveSettings = useMutation({
    mutationFn: (data) =>
      settings?.id
        ? base44.entities.MonitorSetting.update(settings.id, data)
        : base44.entities.MonitorSetting.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['monitor-settings']);
      toast.success('Οι ρυθμίσεις αποθηκεύτηκαν');
    },
    onError: (e) => toast.error(`Αποτυχία αποθήκευσης: ${e?.message || e}`),
  });

  // ---- Source dialog helpers ----
  const openCreate = () => {
    setForm({ ...EMPTY_SOURCE, check_interval: settings?.default_check_interval || 15 });
    setSourceDialog({ open: true, editing: null });
  };
  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      type: row.type || 'rss',
      url: row.url || '',
      css_selector: row.css_selector || '',
      check_interval: row.check_interval || 15,
      active: row.active !== false,
      notes: row.notes || '',
    });
    setSourceDialog({ open: true, editing: row.id });
  };
  const submitSource = () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error('Συμπληρώστε όνομα και URL');
      return;
    }
    const data = {
      name: form.name.trim(),
      type: form.type,
      url: form.url.trim(),
      css_selector: form.type === 'website' ? (form.css_selector || '').trim() : '',
      check_interval: Number(form.check_interval) || 15,
      active: !!form.active,
      notes: (form.notes || '').trim(),
    };
    saveSource.mutate({ id: sourceDialog.editing, data });
  };

  // ---- Test a source (backend dry-run) ----
  const runTest = async (row) => {
    setTestDialog({ open: true, loading: true, result: null, name: row.name });
    try {
      const { data } = await base44.functions.invoke('testSource', {
        sourceId: row.id,
        session_token: SESSION_TOKEN(),
      });
      setTestDialog({ open: true, loading: false, result: data, name: row.name });
    } catch (e) {
      setTestDialog({ open: true, loading: false, result: { ok: false, error: e?.message || String(e) }, name: row.name });
    }
  };

  // ---- Send test Telegram ----
  const sendTest = async () => {
    setSendingTest(true);
    try {
      const { data } = await base44.functions.invoke('sendTestNotification', { session_token: SESSION_TOKEN() });
      if (data?.ok) toast.success(data.message || 'Το δοκιμαστικό μήνυμα εστάλη');
      else toast.error(data?.error || 'Αποτυχία αποστολής');
    } catch (e) {
      toast.error(e?.message || String(e));
    } finally {
      setSendingTest(false);
    }
  };

  // ---- Derived stats ----
  const stats = useMemo(() => ({
    total: sources.length,
    active: sources.filter((s) => s.active !== false).length,
    updatesToday: logs.filter((l) => l.event_type === 'update_found' && isToday(l.created_date)).length,
    errorsToday: logs.filter((l) => l.status === 'error' && isToday(l.created_date)).length,
  }), [sources, logs]);

  const recentLogs = useMemo(() => logs.slice(0, 10), [logs]);

  const filteredLogs = useMemo(() => logs.filter((l) =>
    (logFilters.source_name === 'all' || l.source_name === logFilters.source_name) &&
    (logFilters.status === 'all' || l.status === logFilters.status) &&
    (logFilters.event_type === 'all' || l.event_type === logFilters.event_type)
  ), [logs, logFilters]);

  const sourceNames = useMemo(
    () => Array.from(new Set(logs.map((l) => l.source_name).filter(Boolean))),
    [logs]
  );

  // ---- Column definitions ----
  const statusBadge = (val) => {
    const map = {
      changed: 'bg-emerald-100 text-emerald-700',
      error: 'bg-red-100 text-red-700',
      no_change: 'bg-slate-100 text-slate-600',
      never: 'bg-slate-100 text-slate-500',
    };
    return <Badge variant="secondary" className={map[val] || ''}>{STATUS_LABELS[val] || val || '-'}</Badge>;
  };

  const logStatusBadge = (val) => {
    const map = {
      success: 'bg-emerald-100 text-emerald-700',
      error: 'bg-red-100 text-red-700',
      warning: 'bg-amber-100 text-amber-700',
      info: 'bg-slate-100 text-slate-600',
    };
    return <Badge variant="secondary" className={map[val] || ''}>{val}</Badge>;
  };

  const sourceColumns = [
    { key: 'name', label: 'Όνομα' },
    { key: 'type', label: 'Τύπος', render: (v) => <Badge variant="outline">{TYPE_LABELS[v] || v}</Badge> },
    { key: 'url', label: 'URL', render: (v) => <span className="text-xs text-slate-500 break-all line-clamp-1">{v}</span> },
    { key: 'check_interval', label: 'Συχνότητα (λεπτά)' },
    { key: 'last_status', label: 'Κατάσταση', render: (v) => statusBadge(v) },
    { key: 'last_checked_at', label: 'Τελευταίος έλεγχος', render: (v) => <span className="text-xs">{fmtTime(v)}</span> },
    { key: 'active', label: 'Ενεργό', render: (v, row) => (
      <Switch checked={v !== false} onCheckedChange={(checked) => toggleActive.mutate({ id: row.id, active: checked })} />
    )},
  ];

  const logColumns = [
    { key: 'created_date', label: 'Ώρα', render: (v) => <span className="text-xs">{fmtTime(v)}</span> },
    { key: 'source_name', label: 'Πηγή' },
    { key: 'event_type', label: 'Συμβάν', render: (v) => <Badge variant="outline">{EVENT_LABELS[v] || v}</Badge> },
    { key: 'status', label: 'Κατάσταση', render: (v) => logStatusBadge(v) },
    { key: 'message', label: 'Μήνυμα', render: (v, row) => (
      <span className="text-xs">{v}{row.error_message ? ` — ${row.error_message}` : ''}</span>
    )},
  ];

  if (sourcesLoading || settingsLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Παρακολούθηση"
        subtitle={`${stats.active}/${stats.total} ενεργές πηγές`}
        icon={Radar}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Νέα Πηγή
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Επισκόπηση</TabsTrigger>
          <TabsTrigger value="sources">Πηγές</TabsTrigger>
          <TabsTrigger value="logs">Καταγραφές</TabsTrigger>
          <TabsTrigger value="settings">Ρυθμίσεις</TabsTrigger>
        </TabsList>

        {/* ---------------- OVERVIEW ---------------- */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Σύνολο πηγών', value: stats.total },
              { label: 'Ενεργές πηγές', value: stats.active },
              { label: 'Ενημερώσεις σήμερα', value: stats.updatesToday },
              { label: 'Σφάλματα σήμερα', value: stats.errorsToday },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-500 dark:text-slate-400">{c.label}</p>
                  <p className="text-2xl font-bold">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Πρόσφατες καταγραφές</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => queryClient.invalidateQueries(['monitor-logs'])}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {logsLoading ? <LoadingSpinner /> : <DataGrid data={recentLogs} columns={logColumns} pageSize={10} />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- SOURCES ---------------- */}
        <TabsContent value="sources" className="space-y-4">
          <DataGrid
            data={sources}
            columns={sourceColumns}
            pageSize={20}
            actions={(row) => (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title="Δοκιμή" onClick={() => runTest(row)}>
                  <PlayCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Επεξεργασία" onClick={() => openEdit(row)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Διαγραφή"
                  className="text-red-600"
                  onClick={() => setDeleteDialog({ open: true, id: row.id, name: row.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        </TabsContent>

        {/* ---------------- LOGS ---------------- */}
        <TabsContent value="logs" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Πηγή</Label>
              <Select value={logFilters.source_name} onValueChange={(v) => setLogFilters((f) => ({ ...f, source_name: v }))}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες</SelectItem>
                  {sourceNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Κατάσταση</Label>
              <Select value={logFilters.status} onValueChange={(v) => setLogFilters((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες</SelectItem>
                  <SelectItem value="success">success</SelectItem>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Συμβάν</Label>
              <Select value={logFilters.event_type} onValueChange={(v) => setLogFilters((f) => ({ ...f, event_type: v }))}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {logsLoading ? <LoadingSpinner /> : <DataGrid data={filteredLogs} columns={logColumns} pageSize={25} />}
        </TabsContent>

        {/* ---------------- SETTINGS ---------------- */}
        <TabsContent value="settings" className="space-y-4">
          <SettingsForm
            settings={settings}
            onSave={(data) => saveSettings.mutate(data)}
            saving={saveSettings.isPending}
            onSendTest={sendTest}
            sendingTest={sendingTest}
          />
        </TabsContent>
      </Tabs>

      {/* ---- Source add/edit dialog ---- */}
      <Dialog open={sourceDialog.open} onOpenChange={(open) => !open && setSourceDialog({ open: false, editing: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{sourceDialog.editing ? 'Επεξεργασία Πηγής' : 'Νέα Πηγή'}</DialogTitle>
            <DialogDescription>
              Για Facebook/Instagram χρησιμοποιήστε feed URL από RSS.app (όχι απευθείας τη σελίδα).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Όνομα</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Τύπος</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
            </div>
            {form.type === 'website' && (
              <div className="space-y-2">
                <Label>CSS Selector (προαιρετικό)</Label>
                <Input value={form.css_selector} onChange={(e) => setForm((f) => ({ ...f, css_selector: e.target.value }))} placeholder=".announcements" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Συχνότητα (λεπτά)</Label>
                <Input type="number" min={1} max={1440} value={form.check_interval}
                  onChange={(e) => setForm((f) => ({ ...f, check_interval: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ενεργό</Label>
                <div className="h-10 flex items-center">
                  <Switch checked={form.active} onCheckedChange={(c) => setForm((f) => ({ ...f, active: c }))} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Σημειώσεις</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSourceDialog({ open: false, editing: null })}>Ακύρωση</Button>
            <Button onClick={submitSource} disabled={saveSource.isPending}>
              {saveSource.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete confirmation ---- */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, id: null, name: '' })}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <DialogTitle className="text-xl">Επιβεβαίωση Διαγραφής</DialogTitle>
            </div>
            <DialogDescription className="text-base pt-2">
              Διαγραφή της πηγής <strong>{deleteDialog.name}</strong>;<br />
              <span className="text-red-600 font-medium">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null, name: '' })}>Ακύρωση</Button>
            <Button variant="destructive" onClick={() => deleteSource.mutate(deleteDialog.id)} disabled={deleteSource.isPending}>
              <Trash2 className="h-4 w-4 mr-2" />
              Διαγραφή
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Test result dialog ---- */}
      <Dialog open={testDialog.open} onOpenChange={(open) => !open && setTestDialog({ open: false, loading: false, result: null, name: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Δοκιμή: {testDialog.name}</DialogTitle>
            <DialogDescription>Δοκιμαστική λήψη — δεν αποθηκεύεται και δεν στέλνεται ειδοποίηση.</DialogDescription>
          </DialogHeader>
          {testDialog.loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {testDialog.result?.ok
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  : <XCircle className="h-5 w-5 text-red-600" />}
                <span className="font-medium">{testDialog.result?.ok ? 'Επιτυχία' : 'Αποτυχία'}</span>
              </div>
              <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-3 overflow-x-auto max-h-72">
                {JSON.stringify(testDialog.result, null, 2)}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialog({ open: false, loading: false, result: null, name: '' })}>Κλείσιμο</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings form (separate component so it re-initialises when the record loads)
// ---------------------------------------------------------------------------
function SettingsForm({ settings, onSave, saving, onSendTest, sendingTest }) {
  const [local, setLocal] = useState(() => ({
    telegram_chat_id: settings?.telegram_chat_id || '',
    default_check_interval: settings?.default_check_interval ?? 15,
    notifications_enabled: settings?.notifications_enabled !== false,
    verbose_logging: settings?.verbose_logging === true,
    notification_template: settings?.notification_template
      || 'New update detected\n\nSource: {name}\nType: {type}\nTitle: {title}\nLink: {link}\nChecked at: {time}',
  }));

  // Re-sync when the underlying record id changes (e.g. first load / created)
  const settingsId = settings?.id;
  React.useEffect(() => {
    setLocal({
      telegram_chat_id: settings?.telegram_chat_id || '',
      default_check_interval: settings?.default_check_interval ?? 15,
      notifications_enabled: settings?.notifications_enabled !== false,
      verbose_logging: settings?.verbose_logging === true,
      notification_template: settings?.notification_template
        || 'New update detected\n\nSource: {name}\nType: {type}\nTitle: {title}\nLink: {link}\nChecked at: {time}',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ρυθμίσεις Παρακολούθησης</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Telegram Chat ID</Label>
          <Input
            value={local.telegram_chat_id}
            onChange={(e) => setLocal((s) => ({ ...s, telegram_chat_id: e.target.value }))}
            placeholder="-100123456789 ή @channelname"
          />
          <p className="text-xs text-slate-500">Αριθμητικό ID ομάδας/καναλιού ή @username. Το bot token αποθηκεύεται ως μυστικό (secret).</p>
        </div>

        <div className="space-y-2 max-w-xs">
          <Label>Προεπιλεγμένη συχνότητα (λεπτά)</Label>
          <Input
            type="number" min={1}
            value={local.default_check_interval}
            onChange={(e) => setLocal((s) => ({ ...s, default_check_interval: Number(e.target.value) || 1 }))}
          />
        </div>

        <div className="flex items-center justify-between max-w-md">
          <div>
            <Label>Ειδοποιήσεις ενεργές</Label>
            <p className="text-xs text-slate-500">Αν απενεργοποιηθεί, οι αλλαγές καταγράφονται αλλά δεν στέλνονται μηνύματα.</p>
          </div>
          <Switch checked={local.notifications_enabled} onCheckedChange={(c) => setLocal((s) => ({ ...s, notifications_enabled: c }))} />
        </div>

        <div className="flex items-center justify-between max-w-md">
          <div>
            <Label>Αναλυτική καταγραφή</Label>
            <p className="text-xs text-slate-500">Καταγράφει κάθε έλεγχο (θορυβώδες).</p>
          </div>
          <Switch checked={local.verbose_logging} onCheckedChange={(c) => setLocal((s) => ({ ...s, verbose_logging: c }))} />
        </div>

        <div className="space-y-2">
          <Label>Πρότυπο ειδοποίησης</Label>
          <Textarea
            rows={6}
            value={local.notification_template}
            onChange={(e) => setLocal((s) => ({ ...s, notification_template: e.target.value }))}
          />
          <p className="text-xs text-slate-500">Placeholders: {'{name} {type} {title} {link} {description} {time}'}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => onSave(local)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Αποθήκευση
          </Button>
          <Button variant="outline" onClick={onSendTest} disabled={sendingTest}>
            {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Αποστολή δοκιμαστικού μηνύματος
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}