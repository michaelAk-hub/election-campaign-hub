import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Download, Trash2, Loader2, Search } from 'lucide-react';
import RecordsAgGrid from './RecordsAgGrid';

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
        col.cellRenderer = (p) => (p.value ? '✓' : '');
        col.cellEditor = 'agCheckboxCellEditor';
        col.cellDataType = 'boolean';
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

  const doImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const { data } = await base44.functions.invoke('importScratchJob', {
        session_token: sessionToken(),
        scratch_dataset_id: scratchDatasetId,
        file_url,
      });
      if (data?.error) throw new Error(data.error);
      toast.success(`Εισήχθησαν ${data.processed} εγγραφές${data.failed ? ` (${data.failed} απέτυχαν)` : ''}`);
      // Import defines this table's columns — refetch them, then refresh the grid.
      await queryClient.invalidateQueries({ queryKey: ['columnDefs', scratchDatasetId] });
      gridRef.current?.api?.purgeInfiniteCache?.();
      onChanged?.();
    } catch (e) {
      toast.error('Αποτυχία εισαγωγής: ' + (e.message || ''));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = async () => {
    try {
      const blob = await base44.functions.invokeBlob('exportScratchJob', {
        session_token: sessionToken(),
        scratch_dataset_id: scratchDatasetId,
      });
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
            onChange={(e) => doImport(e.target.files?.[0])}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Εισαγωγή</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleExport}>
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Εξαγωγή</span>
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
    </div>
  );
}
