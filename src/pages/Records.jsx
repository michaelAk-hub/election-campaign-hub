import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Plus, Download, MoreHorizontal, Pencil, Trash2,
  CheckCircle2, Phone, Upload, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';

const PEOPLE_PAGE_SIZE = 500;

const COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)', editable: true },
  { key: 'ucid', label: 'UCID', editable: true },
  { key: 'last_name', label: 'Επίθετο', editable: true },
  { key: 'first_name', label: 'Όνομα', editable: true },
  { key: 'department', label: 'Τμήμα', editable: true },
  { key: 'admission_year', label: 'Εισδοχή', editable: true },
  { key: 'academic_level', label: 'Επίπεδο', editable: true },
  {
    key: 'mobile_phone', label: 'Κινητό', editable: true,
    render: (val) => val ? (
      <a href={`tel:${val}`} className="text-blue-600 hover:underline flex items-center gap-1">
        <Phone className="h-3 w-3" /> {val}
      </a>
    ) : '-'
  },
  { key: 'contact_person_1', label: 'Άτομο 1', editable: true },
  { key: 'contact_person_2', label: 'Άτομο 2', editable: true },
  { key: 'member', label: 'Μέλος', editable: true },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης', editable: true },
  {
    key: 'voted', label: 'Ψήφισε', type: 'boolean', editable: true,
    render: (val) => (
      <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
        {val ? 'ΝΑΙ' : 'ΟΧΙ'}
      </Badge>
    )
  },
  { key: 'monadikos_kanali', label: 'Μοναδικό Κανάλι', editable: true },
  {
    key: 'notes', label: 'Σημειώσεις', editable: true,
    render: (val) => <span className="truncate max-w-[150px] block">{val || '-'}</span>
  },
];

const LABEL_TO_KEY = Object.fromEntries(COLUMNS.map(c => [c.label, c.key]));

function parseVoted(val) {
  if (val === true || val === false) return val;
  const s = String(val ?? '').trim().toLowerCase();
  return ['ναι', 'nai', 'yes', 'true', '1', 'y'].includes(s);
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const key = LABEL_TO_KEY[k] || k;
    out[key] = typeof v === 'string' ? v.trim() : v;
  }
  out.voted = parseVoted(out.voted);
  return out;
}

async function parseFileToRows(file) {
  const name = (file?.name ?? '').toLowerCase();

  if (name.endsWith('.csv')) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (parsed.errors?.length) throw new Error(parsed.errors[0].message || 'CSV parse error');
    return parsed.data || [];
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' }) || [];
  }

  throw new Error('Μη υποστηριζόμενος τύπος αρχείου (.csv, .xlsx, .xls)');
}

export default function Records() {
  const queryClient = useQueryClient();

  const [editDialog, setEditDialog] = useState({ open: false, person: null });
  const [addDialog, setAddDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [partition, setPartition] = useState('all');
  // Column mapping state
  const [missingPersonIdDialog, setMissingPersonIdDialog] = useState(false);
  const [fileColumns, setFileColumns] = useState([]);
  const [personIdMapping, setPersonIdMapping] = useState(''); // '' = auto-generate
  const [pendingRows, setPendingRows] = useState([]);

  const { data: datasets = [], isLoading: datasetsLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: async () => {
      let all = [], skip = 0;
      while (true) {
        const batch = await base44.entities.Dataset.list('-created_date', 5000, skip);
        all = all.concat(batch);
        if (batch.length < 5000) break;
        skip += 5000;
      }
      return all;
    }
  });

  const activeDataset = useMemo(() => datasets.find(d => d.status === 'active') || null, [datasets]);
  const activeDatasetId = activeDataset?.id || null;

  const POSTGRAD_LEVELS = ['Δ', 'Μ', 'Μεταπτυχιακός Εράσμους'];
  const UNDERGRAD_LEVELS = ['Π', 'Προπτυχιακός Εράσμους'];

  const peopleQuery = useInfiniteQuery({
    queryKey: ['people', activeDatasetId, partition],
    enabled: !!activeDatasetId,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      let filter = { dataset_id: activeDatasetId };
      if (partition === 'postgrad') filter = { ...filter, academic_level: { $in: POSTGRAD_LEVELS } };
      else if (partition === 'undergrad') filter = { ...filter, academic_level: { $in: UNDERGRAD_LEVELS } };
      else if (partition === 'unknown') filter = { ...filter, academic_level: null };
      return base44.entities.Person.filter(filter, '-created_date', PEOPLE_PAGE_SIZE, pageParam);
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PEOPLE_PAGE_SIZE ? pages.length * PEOPLE_PAGE_SIZE : undefined,
  });

  const loadedPeople = useMemo(() => peopleQuery.data?.pages?.flat() ?? [], [peopleQuery.data]);
  const people = loadedPeople;

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Person.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      setAddDialog(false);
      setFormData({});
      toast.success('Η εγγραφή δημιουργήθηκε');
    },
    onError: (e) => toast.error(e.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      setEditDialog({ open: false, person: null });
      toast.success('Η εγγραφή ενημερώθηκε');
    },
    onError: (e) => toast.error(e.message)
  });

  const updateCellMutation = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.Person.update(id, patch),
    onMutate: async ({ id, patch }) => {
      if (!activeDatasetId) return;
      const qk = ['people', activeDatasetId, partition];
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData(qk);
      queryClient.setQueryData(qk, (old) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map(pg => pg.map(r => r.id === id ? { ...r, ...patch } : r)) };
      });
      return { prev, qk };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev && ctx?.qk) queryClient.setQueryData(ctx.qk, ctx.prev);
      const msg = err?.message || '';
      if (msg.includes('not found')) {
        queryClient.invalidateQueries({ queryKey: ['people', activeDatasetId, partition] });
      } else {
        toast.error('Αποτυχία αποθήκευσης');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['people', activeDatasetId, partition] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Η εγγραφή διαγράφηκε');
    },
    onError: (e) => {
      if (e?.message?.includes('not found')) {
        queryClient.invalidateQueries({ queryKey: ['people', activeDatasetId, partition] });
      } else {
        toast.error(e.message);
      }
    }
  });

  const handleExport = async () => {
    if (!activeDatasetId) return toast.error('Δεν υπάρχει ενεργό dataset');
    try {
      toast.message('Ετοιμασία εξαγωγής...');
      let all = [], skip = 0;
      while (true) {
        const batch = await base44.entities.Person.filter({ dataset_id: activeDatasetId }, '-created_date', 5000, skip);
        all = all.concat(batch);
        if (batch.length < 5000) break;
        skip += 5000;
      }
      const headers = COLUMNS.map(c => c.label).join(',');
      const rows = all.map(p =>
        COLUMNS.map(c => {
          let val = p[c.key];
          if (c.key === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        }).join(',')
      ).join('\n');
      const csv = '\uFEFF' + headers + '\n' + rows;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `εγγραφές_${activeDataset?.name || 'dataset'}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success('Εξαγωγή ολοκληρώθηκε');
    } catch (e) {
      toast.error('Σφάλμα εξαγωγής: ' + e.message);
    }
  };

  const doImport = async (rows) => {
    setUploadLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });

      const normalized = rows.map(normalizeRow);
      const valid = normalized.filter(r => r.person_id && String(r.person_id).trim() !== '');
      const skipped = normalized.length - valid.length;

      const dataset = await base44.entities.Dataset.create({
        name: uploadFile.name,
        status: 'pending',
        source_file_url: file_url,
        total_records: valid.length,
        activated_at: new Date().toISOString()
      });

      const withDataset = valid.map(r => ({ ...r, dataset_id: dataset.id }));
      const chunkSize = 500;
      for (let i = 0; i < withDataset.length; i += chunkSize) {
        await base44.entities.Person.bulkCreate(withDataset.slice(i, i + chunkSize));
      }

      const sessionToken = localStorage.getItem('app_session_token');
      await base44.functions.invoke('activateDataset', { dataset_id: dataset.id, session_token: sessionToken });

      toast.success(`✅ Επιτυχία! Εισήχθησαν ${valid.length} εγγραφές.${skipped ? ` Παραλείφθηκαν ${skipped}.` : ''}`);
      queryClient.removeQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      setUploadDialog(false);
      setMissingPersonIdDialog(false);
      setUploadFile(null);
      setPendingRows([]);
    } catch (e) {
      toast.error(`❌ Σφάλμα εισαγωγής: ${e.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) return toast.error('Παρακαλώ επιλέξτε αρχείο');
    setUploadLoading(true);
    try {
      let rawRows = [];
      try {
        rawRows = await parseFileToRows(uploadFile);
      } catch (e) {
        toast.error(`❌ Σφάλμα ανάλυσης αρχείου: ${e.message}`);
        return;
      }

      // Check if person_id is missing
      const normalized = rawRows.map(normalizeRow);
      const hasMissingPersonId = normalized.some(r => !r.person_id || String(r.person_id).trim() === '');
      const allMissingPersonId = normalized.every(r => !r.person_id || String(r.person_id).trim() === '');

      if (allMissingPersonId && rawRows.length > 0) {
        // Detect file columns
        const cols = Object.keys(rawRows[0] || {});
        setFileColumns(cols);
        setPendingRows(rawRows);
        setPersonIdMapping('');
        setUploadLoading(false);
        setMissingPersonIdDialog(true);
        return;
      }

      await doImport(rawRows);
    } catch (e) {
      toast.error(`❌ Σφάλμα εισαγωγής: ${e.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleMissingPersonIdIgnore = async () => {
    // Auto-generate person_id as sequential number
    const rowsWithId = pendingRows.map((r, i) => ({ ...r, person_id: String(i + 1) }));
    await doImport(rowsWithId);
  };

  const handleMissingPersonIdMapping = async () => {
    if (!personIdMapping) return toast.error('Παρακαλώ επιλέξτε στήλη');
    const rowsWithId = pendingRows.map(r => ({ ...r, person_id: String(r[personIdMapping] ?? '').trim() }));
    await doImport(rowsWithId);
  };

  const handleActivateDataset = async (datasetId) => {
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('activateDataset', { dataset_id: datasetId, session_token: sessionToken });
      if (data.success) {
        toast.success('Το dataset ενεργοποιήθηκε');
        queryClient.removeQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['datasets'] });
      } else toast.error(data.error || 'Σφάλμα ενεργοποίησης');
    } catch (e) { toast.error('Σφάλμα: ' + e.message); }
  };

  const handleDeleteDataset = async (datasetId) => {
    if (!confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το dataset και όλες τις εγγραφές του;')) return;
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('deleteDataset', { dataset_id: datasetId, session_token: sessionToken });
      if (data.success) {
        toast.success(`Το dataset διαγράφηκε (${data.deleted_count ?? 0} εγγραφές)`);
        queryClient.removeQueries({ queryKey: ['people', activeDatasetId] });
        queryClient.invalidateQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['datasets'] });
      } else toast.error(data.error || 'Σφάλμα κατά τη διαγραφή');
    } catch (e) { toast.error('Σφάλμα: ' + e.message); }
  };

  const handleDeleteAllPersons = async () => {
    if (!confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε ΟΛΕΣ τις εγγραφές από τον πίνακα Person;')) return;
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('deleteAllPersons', { session_token: sessionToken });
      if (data.success) {
        toast.success(`${data.deleted_count} εγγραφές διαγράφηκαν επιτυχώς.`);
        queryClient.removeQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['datasets'] });
      } else toast.error(data.error || 'Σφάλμα κατά τη διαγραφή');
    } catch (e) { toast.error('Σφάλμα: ' + e.message); }
  };

  const subtitle = useMemo(() => {
    if (!activeDataset) return 'Δεν υπάρχει ενεργό dataset';
    const total = activeDataset.total_records ?? '—';
    const loaded = loadedPeople.length;
    const partLabel = { all: 'Όλα', undergrad: 'Προπτυχιακοί', postgrad: 'Μεταπτυχιακοί', unknown: 'Άγνωστοι' }[partition] || partition;
    return `${activeDataset.name} • Φορτώθηκαν ${loaded.toLocaleString('el-GR')} / ${total} (${partLabel})`;
  }, [activeDataset, loadedPeople.length, partition]);

  if (datasetsLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Εγγραφές"
        subtitle={subtitle}
        icon={Database}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={partition} onValueChange={setPartition}>
              <SelectTrigger className="h-10 min-w-[180px]"><SelectValue placeholder="Ομάδα" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλα</SelectItem>
                <SelectItem value="postgrad">Μεταπτυχιακοί</SelectItem>
                <SelectItem value="undergrad">Προπτυχιακοί</SelectItem>
                <SelectItem value="unknown">Άγνωστοι</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => setUploadDialog(true)} className="h-10">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Εισαγωγή</span>
            </Button>

            <Button variant="outline" onClick={handleExport} disabled={!activeDatasetId} className="h-10">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Εξαγωγή</span>
            </Button>

            <Button disabled={!activeDatasetId} onClick={() => { if (!activeDatasetId) return; setFormData({}); setAddDialog(true); }} className="h-10">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Νέα</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="destructive" className="h-10">
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Διαγραφές</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => activeDatasetId && handleDeleteDataset(activeDatasetId)} className="text-red-700">
                  <Trash2 className="h-4 w-4 mr-2" /> Διαγραφή Ενεργού Dataset
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteAllPersons} className="text-red-700">
                  <ShieldAlert className="h-4 w-4 mr-2" /> Διαγραφή Όλων των Person
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {datasets.length > 0 && (
        <div className="bg-white rounded-lg border p-3 sm:p-4">
          <h3 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5" /> Datasets
          </h3>
          <div className="space-y-2">
            {datasets.map(dataset => (
              <div key={dataset.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-50 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base truncate">{dataset.name}</p>
                  <p className="text-xs sm:text-sm text-slate-600">{dataset.total_records || 0} εγγραφές • {dataset.status}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {dataset.status !== 'active' && (
                    <Button size="sm" onClick={() => handleActivateDataset(dataset.id)} className="h-9">
                      <CheckCircle2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Ενεργοποίηση</span>
                    </Button>
                  )}
                  {dataset.status === 'active' && <Badge className="bg-green-100 text-green-700">Ενεργό</Badge>}
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteDataset(dataset.id)} className="h-9 w-9 p-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!activeDatasetId ? (
        <div className="bg-white border rounded-lg p-8 text-center text-slate-600">
          Δεν υπάρχει ενεργό dataset. Κάντε <strong>Εισαγωγή</strong> αρχείου ή ενεργοποιήστε ένα dataset.
        </div>
      ) : (
        <DataGrid
          mode="infinite"
          height="70vh"
          data={people}
          columns={COLUMNS}
          searchable
          filterable
          sortable
          editable
          hasMore={!!peopleQuery.hasNextPage}
          isLoadingMore={peopleQuery.isFetchingNextPage}
          onLoadMore={() => peopleQuery.fetchNextPage()}
          onCellUpdate={async ({ row, key, value }) => {
            await updateCellMutation.mutateAsync({ id: row.id, patch: { [key]: value } });
          }}
          actions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setFormData({ ...row }); setEditDialog({ open: true, person: row }); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Επεξεργασία
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { if (confirm('Είστε σίγουροι;')) deleteMutation.mutate(row.id); }}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Διαγραφή
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={addDialog || editDialog.open} onOpenChange={(open) => {
        if (!open) { setAddDialog(false); setEditDialog({ open: false, person: null }); setFormData({}); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editDialog.person ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[
              { key: 'person_id', label: 'ΑΤ (ID) *' },
              { key: 'ucid', label: 'UCID' },
              { key: 'last_name', label: 'Επίθετο' },
              { key: 'first_name', label: 'Όνομα' },
              { key: 'department', label: 'Τμήμα' },
              { key: 'admission_year', label: 'Έτος Εισδοχής' },
              { key: 'mobile_phone', label: 'Κινητό' },
              { key: 'academic_level', label: 'Ακαδημαϊκό Επίπεδο' },
              { key: 'contact_person_1', label: 'Άτομο 1' },
              { key: 'contact_person_2', label: 'Άτομο 2' },
              { key: 'member', label: 'Μέλος' },
              { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input value={formData[key] || ''} onChange={e => setFormData(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2 flex items-center gap-3">
              <Switch checked={formData.voted || false} onCheckedChange={v => setFormData(f => ({ ...f, voted: v }))} />
              <Label>Ψήφισε</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Σημειώσεις</Label>
              <Textarea value={formData.notes || ''} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setEditDialog({ open: false, person: null }); setFormData({}); }}>
              Ακύρωση
            </Button>
            <Button
              disabled={createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (!formData.person_id) return toast.error('Το πεδίο ΑΤ (ID) είναι υποχρεωτικό');
                if (editDialog.person) {
                  updateMutation.mutate({ id: editDialog.person.id, data: formData });
                } else {
                  createMutation.mutate({ ...formData, dataset_id: activeDatasetId });
                }
              }}
            >
              {editDialog.person ? 'Αποθήκευση' : 'Δημιουργία'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Εισαγωγή Αρχείου</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-1">💡 Συμβουλή</p>
              <p className="text-sm text-blue-800">
                Χρησιμοποιήστε το <strong>"Εξαγωγή"</strong> για να κατεβάσετε πρότυπο CSV. Υποστηρίζονται .csv, .xlsx, .xls.
              </p>
            </div>
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => setUploadFile(e.target.files[0])} />
            {uploadFile && (
              <p className="text-sm text-green-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Επιλέχθηκε: {uploadFile.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialog(false); setUploadFile(null); }}>Ακύρωση</Button>
            <Button onClick={handleFileUpload} disabled={uploadLoading || !uploadFile}>
              {uploadLoading ? 'Εισαγωγή...' : 'Εισαγωγή'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}