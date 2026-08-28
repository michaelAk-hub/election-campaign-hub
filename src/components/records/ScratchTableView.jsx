import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Download, Trash2, Loader2, Search, GitMerge } from 'lucide-react';
import RecordsAgGrid from './RecordsAgGrid';
import ImportMappingDialog from './ImportMappingDialog';
import MergeDialog from './MergeDialog';

const sanitize = (h) => String(h).trim().replace(/[^\p{L}\p{N}]+/gu, '_');

// Self-contained editable view for one scratch table. Deliberately separate
// from the live Records grid so the live path is untouched. Reads/writes only
// PersonScratch via the scratch* Edge Functions.
export default function ScratchTableView({ scratchDatasetId, name, onDeleted, onChanged }) {
  const queryClient = useQueryClient();
  const gridRef = useRef(null);
  const fileRef = useRef(null);
  const [search, setSearch] = useState('');
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [sortModel, setSortModel] = useState({ field: 'created_date', dir: 'desc' });
  const [filterModel, setFilterModel] = useState({});
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importDialog, setImportDialog] = useState(null); // { fileUrl, headers, defaultMapping, total }
  const [importBusy, setImportBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const sessionToken = () => localStorage.getItem('app_session_token');

  // Shared schema → column defs (ordered). Physical fields map to a real column;
  // non-physical fields live in custom_data.
  const { data: columnDefsRegistry = [], isLoading: schemaLoading } = useQuery({
    queryKey: ['columnDefs', scratchDatasetId],
    queryFn: async () => {
      const rows = await base44.entities.ColumnDef.filter({ table_key: scratchDatasetId }, 'sort_order', 1000, 0);
      return (rows || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    staleTime: 60 * 1000,
  });

  const physicalKeys = useMemo(
    () => new Set(columnDefsRegistry.filter(c => c.physical).map(c => c.key)),
    [columnDefsRegistry]
  );

  const columnDefs = useMemo(() => {
    const truthy = (v) => v === true || ['true', 'ναι', 'nai', 'yes', '1', 'y'].includes(String(v ?? '').trim().toLowerCase());
    return columnDefsRegistry.map((cd) => {
      const isCustom = !cd.physical;
      const raw = (p) => (isCustom ? p.data?.custom_data?.[cd.key] : p.data?.[cd.key]);
      const col = {
        colId: cd.key,
        headerName: cd.label || cd.key,
        field: isCustom ? undefined : cd.key,
        valueGetter: isCustom ? (p) => p.data?.custom_data?.[cd.key] ?? '' : undefined,
        // Custom fields live in custom_data → write there so the edit applies
        // locally and fires onCellValueChanged.
        valueSetter: isCustom ? (p) => {
          const c = { ...(p.data.custom_data || {}) };
          c[cd.key] = p.newValue;
          p.data.custom_data = c;
          return true;
        } : undefined,
        editable: true,
        minWidth: 90,
        resizable: true,
      };
      if (cd.type === 'number') {
        col.cellEditor = 'agNumberCellEditor';
      } else if (cd.type === 'date') {
        col.cellEditor = 'agDateStringCellEditor';
      } else if (cd.type === 'select') {
        col.cellEditor = 'agSelectCellEditor';
        col.cellEditorParams = { values: Array.isArray(cd.options) ? cd.options : [] };
      } else if (cd.type === 'boolean') {
        col.valueGetter = (p) => truthy(raw(p));
        col.cellRenderer = 'agCheckboxCellRenderer';
        col.cellEditor = 'agCheckboxCellEditor';
        col.cellDataType = 'boolean';
        col.singleClickEdit = true;
      }
      return col;
    });
  }, [columnDefsRegistry]);

  // Reload the grid when the schema or the active table changes.
  useEffect(() => {
    gridRef.current?.api?.purgeInfiniteCache?.();
  }, [scratchDatasetId, columnDefs]);

  const handleCellValueChanged = useCallback(async (params) => {
    const row = params.data;
    if (!row?.id) return;
    const key = params.column.getColId();
    const field = physicalKeys.has(key) ? key : `custom:${key}`;
    try {
      const { data: result } = await base44.functions.invoke('scratchGridUpdateCell', {
        session_token: sessionToken(),
        person_id: row.id,
        field,
        value: params.newValue,
        expected_row_version: row.row_version || 1,
      });
      if (result?.error) throw new Error(result.error);
      if (result?.data) params.node.setData(result.data);
    } catch (e) {
      toast.error('Αποτυχία αποθήκευσης: ' + (e.message || ''));
      gridRef.current?.api?.purgeInfiniteCache?.();
    }
  }, [physicalKeys]);

  const handleSortModelChange = useCallback((field, dir) => {
    setSortModel({ field, dir });
  }, []);

  // Phase 1: upload + read headers, then open the mapping dialog.
  const onFileChosen = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      // Big .xlsx files are too heavy to parse server-side (546). Convert to CSV
      // in the browser first; the server then parses cheaply. Same rows either way.
      let uploadObj = file;
      const nm = (file.name || '').toLowerCase();
      if (nm.endsWith('.xlsx') || nm.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const base = file.name.replace(/\.(xlsx|xls)$/i, '') || 'import';
        uploadObj = new File([csv], `${base}.csv`, { type: 'text/csv' });
      }
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadObj });
      const { data } = await base44.functions.invoke('importScratchJob', {
        session_token: sessionToken(),
        file_url,
        preview: true,
      });
      if (data?.error) throw new Error(data.error);
      const headers = data.headers || [];
      const suggestions = data.suggestions || {};
      // Match a file header to an existing column by its key OR label, case-insensitively.
      const norm = (s) => String(s ?? '').trim().toLowerCase();
      const byKey = new Map(columnDefsRegistry.map(c => [c.key, c]));
      const byNorm = new Map();
      for (const c of columnDefsRegistry) {
        byNorm.set(norm(c.key), c);
        if (c.label) byNorm.set(norm(c.label), c);
      }
      const defaultMapping = {};
      for (const h of headers) {
        const sug = suggestions[h];
        if (sug && byKey.has(sug)) { defaultMapping[h] = sug; continue; }
        const match = byNorm.get(norm(h)) || byKey.get(sanitize(h));
        defaultMapping[h] = match ? match.key : '__new__';
      }
      setImportDialog({ fileUrl: file_url, headers, defaultMapping, total: data.total || 0 });
    } catch (e) {
      toast.error('Αποτυχία ανάγνωσης αρχείου: ' + (e.message || ''));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Phase 2: import applying the chosen mapping.
  const runImport = async (mapping) => {
    if (!importDialog) return;
    setImportBusy(true);
    try {
      const { data } = await base44.functions.invoke('importScratchJob', {
        session_token: sessionToken(),
        scratch_dataset_id: scratchDatasetId,
        file_url: importDialog.fileUrl,
        mapping,
      });
      if (data?.error) throw new Error(data.error);
      toast.success(`Εισήχθησαν ${data.processed} εγγραφές${data.failed ? ` (${data.failed} απέτυχαν)` : ''}`);
      await queryClient.invalidateQueries({ queryKey: ['columnDefs', scratchDatasetId] });
      gridRef.current?.api?.purgeInfiniteCache?.();
      onChanged?.();
      setImportDialog(null);
    } catch (e) {
      toast.error('Αποτυχία εισαγωγής: ' + (e.message || ''));
    } finally {
      setImportBusy(false);
    }
  };

  // Export in the browser: page all rows via scratchGridFetch (cheap) and build
  // the .xlsx client-side, so the server never generates a big workbook (546).
  const handleExport = async () => {
    setExporting(true);
    try {
      const cols = columnDefsRegistry;
      if (!cols.length) { toast.message('Ο πίνακας δεν έχει στήλες'); return; }

      const all = [];
      const PAGE = 1000;
      for (let start = 0; ; start += PAGE) {
        const { data } = await base44.functions.invoke('scratchGridFetch', {
          session_token: sessionToken(),
          scratchDatasetId,
          startRow: start,
          endRow: start + PAGE,
          sortField: 'created_date',
          sortDirection: 'desc',
        });
        if (data?.error) throw new Error(data.error);
        const rows = data?.rows || [];
        all.push(...rows);
        const total = typeof data?.total === 'number' ? data.total : null;
        if (rows.length < PAGE || (total !== null && all.length >= total)) break;
      }

      const truthy = (v) => v === true || ['true', 'ναι', 'nai', 'yes', '1', 'y'].includes(String(v ?? '').trim().toLowerCase());
      const sheetRows = all.map((r) => {
        const o = {};
        for (const c of cols) {
          let v = c.physical ? r[c.key] : r?.custom_data?.[c.key];
          if (c.type === 'boolean') v = truthy(v) ? 'ΝΑΙ' : 'ΟΧΙ';
          o[c.label || c.key] = v === null || v === undefined ? '' : String(v);
        }
        return o;
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: cols.map((c) => c.label || c.key) });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(name || 'scratch').replace(/[^\w.-]+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Αποτυχία εξαγωγής: ' + (e.message || ''));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!confirm(`Διαγραφή του πρόχειρου πίνακα «${name}» και όλων των εγγραφών του;`)) return;
    setDeleting(true);
    try {
      const { data } = await base44.functions.invoke('scratchDatasetDelete', {
        session_token: sessionToken(),
        scratch_dataset_id: scratchDatasetId,
      });
      if (data?.error) throw new Error(data.error);
      toast.success('Ο πίνακας διαγράφηκε');
      onDeleted?.();
    } catch (e) {
      toast.error('Αποτυχία διαγραφής: ' + (e.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  const commitSearch = (val) => {
    setSearch(val);
    if (val.length === 0 || val.length >= 2) setServerSearchTerm(val);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 shrink-0 truncate">
            {name || 'Πρόχειρος Πίνακας'}
          </h2>
          <span className="hidden lg:inline text-xs text-slate-500 dark:text-slate-400 shrink-0">— πρόχειρος (δεν επηρεάζει το σύστημα)</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => commitSearch(e.target.value)}
              placeholder="Αναζήτηση (2+ χαρ)"
              className="h-8 w-40 sm:w-48 pl-7"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => onFileChosen(e.target.files?.[0])}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Εισαγωγή</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={exporting} onClick={handleExport}>
            {exporting ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <Download className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Εξαγωγή</span>
          </Button>
          <Button variant="default" size="sm" className="h-8 shrink-0" onClick={() => setMergeOpen(true)}>
            <GitMerge className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Συγχώνευση</span>
          </Button>
          <Button variant="destructive" size="sm" className="h-8 shrink-0" disabled={deleting} onClick={handleDeleteTable}>
            <Trash2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Διαγραφή Πίνακα</span>
          </Button>
        </div>
      </div>

      {schemaLoading ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center text-slate-600 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin inline" />
        </div>
      ) : columnDefs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center text-slate-600 dark:text-slate-400">
          Αυτός ο πίνακας δεν έχει στήλες ακόμη. Κάντε <strong>Εισαγωγή</strong> ενός αρχείου για να οριστούν οι στήλες,
          ή προσθέστε στήλες από τη <strong>Σχεδίαση</strong>.
        </div>
      ) : (
        <RecordsAgGrid
          ref={gridRef}
          scratchDatasetId={scratchDatasetId}
          serverSearchTerm={serverSearchTerm}
          filterModel={filterModel}
          sortModel={sortModel}
          columnDefs={columnDefs}
          onCellValueChanged={handleCellValueChanged}
          onSortModelChange={handleSortModelChange}
          gridRef={gridRef}
          height="calc(100vh - 130px)"
        />
      )}

      <ImportMappingDialog
        open={!!importDialog}
        onOpenChange={(o) => { if (!o) setImportDialog(null); }}
        headers={importDialog?.headers || []}
        defaultMapping={importDialog?.defaultMapping || {}}
        existingColumns={columnDefsRegistry}
        total={importDialog?.total || 0}
        busy={importBusy}
        onConfirm={runImport}
      />

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        scratchDatasetId={scratchDatasetId}
        scratchName={name}
        scratchColumns={columnDefsRegistry}
        onDone={() => onChanged?.()}
      />
    </div>
  );
}
