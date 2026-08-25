import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Plus, Download, MoreHorizontal, Pencil, Trash2,
  CheckCircle2, Phone, Upload, FileSpreadsheet, Loader2, Search, X, Filter, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { ColumnFilterPanel } from '@/components/datagrid/ColumnFilterPopover';
import RecordsAgGrid from '../components/records/RecordsAgGrid';
import ImportProgressModal from '../components/records/ImportProgressModal';
import ExportProgressModal from '../components/records/ExportProgressModal';
import DeleteProgressModal from '../components/records/DeleteProgressModal';
import PullToRefresh from '../components/common/PullToRefresh';

// ─── Constants ────────────────────────────────────────────────────────────────
const USE_AG_GRID = true;
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 600;
const PEOPLE_PAGE_SIZE = 500;
const GRID_KEY = 'records_person_grid';

const POSTGRAD_LEVELS = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD_LEVELS = ["Π", "Προπτυχιακός Εράσμους"];

const SEARCH_FIELDS = [
  'person_id', 'last_name', 'first_name', 'mobile_phone', 'department', 'ucid',
  'direction', 'X', 'F26_1', 'F25', 'phone', 'T24', 'F24', 'F23', 'T22',
  'details', 'father_n', 'father_name', 'ElectoralDistrict', 'ElectoralTown', 'RelatedMember',
];

const REMOVED_FIELDS = new Set([]);

// ─── Stable serialisation ─────────────────────────────────────────────────────
function stableStringify(obj) {
  if (obj === null || obj === undefined) return String(obj ?? '');
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// ─── isSafeToPatch ────────────────────────────────────────────────────────────
function isSafeToPatch(oldRow, newRow, { sortModel, filterModel, partition, serverSearchTerm }) {
  if (!oldRow) return false;

  // If the sorted field changed, row position may change → not safe
  if (sortModel?.field && oldRow[sortModel.field] !== newRow[sortModel.field]) return false;

  // If any active filter field changed, row may drop out of view → not safe
  for (const key of Object.keys(filterModel || {})) {
    if (filterModel[key] && oldRow[key] !== newRow[key]) return false;
  }

  // If academic_level changed, partition membership may change → not safe
  if (oldRow.academic_level !== newRow.academic_level) return false;

  // If search is active and any search field changed → not safe
  if (serverSearchTerm && serverSearchTerm.length >= SEARCH_MIN_CHARS) {
    for (const f of SEARCH_FIELDS) {
      if (oldRow[f] !== newRow[f]) return false;
    }
  }

  // Check row still belongs to current partition
  if (partition === 'postgrad' && !POSTGRAD_LEVELS.includes(newRow.academic_level)) return false;
  if (partition === 'undergrad' && !UNDERGRAD_LEVELS.includes(newRow.academic_level)) return false;
  if (partition === 'unknown' && (POSTGRAD_LEVELS.includes(newRow.academic_level) || UNDERGRAD_LEVELS.includes(newRow.academic_level))) return false;

  return true;
}

// ─── Columns ──────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)', editable: true, reorderable: true },
  { key: 'ucid', label: 'UCID', editable: true, reorderable: true },
  { key: 'last_name', label: 'Επίθετο', editable: true, reorderable: true },
  { key: 'first_name', label: 'Όνομα', editable: true, reorderable: true },
  { key: 'department', label: 'Τμήμα', editable: true, reorderable: true },
  { key: 'admission_year', label: 'Εισδοχή', editable: true, reorderable: true },
  { key: 'academic_level', label: 'Επίπεδο', editable: true, reorderable: true },
  {
    key: 'mobile_phone', label: 'Κινητό', editable: true, reorderable: true,
    render: (val) => val ? (
      <a href={`tel:${val}`} className="text-blue-600 hover:underline flex items-center gap-1">
        <Phone className="h-3 w-3" /> {val}
      </a>
    ) : '-'
  },
  { key: 'contact_person_1', label: 'Άτομο 1', editable: true, reorderable: true },
  { key: 'contact_person_2', label: 'Άτομο 2', editable: true, reorderable: true },
  { key: 'member', label: 'Μέλος', editable: true, reorderable: true },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης', editable: true, reorderable: true },
  {
    key: 'voted', label: 'Ψήφισε', type: 'boolean', editable: true, reorderable: true,
    render: (val) => (
      <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
        {val ? 'ΝΑΙ' : 'ΟΧΙ'}
      </Badge>
    )
  },
  { key: 'monadikos_kanali', label: 'Μοναδικό Κανάλι', editable: true, reorderable: true },
  {
    key: 'notes', label: 'Σημειώσεις', editable: true, reorderable: true,
    render: (val) => <span className="truncate max-w-[150px] block">{val || '-'}</span>
  },
  { key: 'direction', label: 'ΚΑΤ', editable: true, reorderable: true },
  { key: 'X', label: 'X', editable: true, reorderable: true },
  { key: 'F26_1', label: 'Φ26_1', editable: true, reorderable: true },
  { key: 'F25', label: 'Φ25', editable: true, reorderable: true },
  { key: 'phone', label: 'phone', editable: true, reorderable: true },
  { key: 'T24', label: 'T24', editable: true, reorderable: true },
  { key: 'F24', label: 'Φ24', editable: true, reorderable: true },
  { key: 'F23', label: 'Φ23', editable: true, reorderable: true },
  { key: 'T22', label: 'T22', editable: true, reorderable: true },
  {
    key: 'details', label: 'ΠΑΡΑΤΗΡΗΣΕΙΣ', editable: true, reorderable: true,
    render: (val) => <span className="truncate max-w-[150px] block">{val || '-'}</span>
  },
  { key: 'father_n', label: 'ΟΝ_ΠΑΤΡΟΣ', editable: true, reorderable: true },
  { key: 'father_name', label: 'ΟΝΟΜΑ ΠΑΤΕΡΑ', editable: true, reorderable: true },
  { key: 'ElectoralDistrict', label: 'ElectoralDistrict', editable: true, reorderable: true },
  { key: 'ElectoralTown', label: 'ElectoralTown', editable: true, reorderable: true },
  { key: 'RelatedMember', label: 'RelatedMember', editable: true, reorderable: true },
];

const LABEL_TO_KEY = Object.fromEntries(COLUMNS.map(c => [c.label, c.key]));

// ─── Search input (AG Grid) ───────────────────────────────────────────────────
function AgGridSearchInput({ value, onCommit }) {
  const [local, setLocal] = useState(value || '');
  const debounceRef = useRef(null);

  useEffect(() => { setLocal(value || ''); }, [value]);

  const handleChange = (val) => {
    setLocal(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onCommit(val), SEARCH_DEBOUNCE_MS);
  };

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
      <Input
        value={local}
        onChange={e => handleChange(e.target.value)}
        placeholder={`Αναζήτηση (${SEARCH_MIN_CHARS}+ χαρ)...`}
        className="pl-8 pr-8 h-8 w-40 sm:w-48 text-sm"
      />
      {local && (
        <button
          className="absolute right-2 text-slate-400 hover:text-slate-600"
          onClick={() => { setLocal(''); onCommit(''); }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── RecordsHeaderComponent (module scope, used by AG Grid) ──────────────────
function RecordsHeaderComponent(params) {
  const { displayName, column, api } = params;
  const colId = column.getColId();
  const filterModel = params.context?.filterModel || {};
  const onFilterChange = params.context?.onFilterChange;
  const partition = params.context?.partition || 'all';

  const [sortDir, setSortDir] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const isFiltered = !!(filterModel[colId] &&
    (filterModel[colId].values?.length > 0 || filterModel[colId].includeBlanks));

  // Sync sort from grid state
  useEffect(() => {
    const onSort = () => {
      const state = api.getColumnState();
      const col = state.find(c => c.colId === colId);
      setSortDir(col?.sort || null);
    };
    api.addEventListener('sortChanged', onSort);
    onSort();
    return () => { try { api.removeEventListener('sortChanged', onSort); } catch (_) {} };
  }, [api, colId]);

  const handleSort = useCallback(() => {
    const next = sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc';
    api.applyColumnState({ state: [{ colId, sort: next }], defaultState: { sort: null } });
  }, [api, colId, sortDir]);

  const openFilter = useCallback((e) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPanelPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setFilterOpen(true);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!filterOpen) return;
    const onMouseDown = (e) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target)) setFilterOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const col = COLUMNS.find(c => c.key === colId);

  return (
    <div className="flex items-center w-full overflow-hidden gap-1">
      <button
        onClick={handleSort}
        className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden text-left font-medium text-xs"
      >
        <span className="truncate">{displayName}</span>
        {sortDir === 'asc' && <span className="text-blue-600 flex-shrink-0">▲</span>}
        {sortDir === 'desc' && <span className="text-blue-600 flex-shrink-0">▼</span>}
      </button>
      {col && (
        <button
          ref={btnRef}
          onClick={openFilter}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${isFiltered ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}
          title={`Φίλτρο: ${displayName}`}
        >
          <Filter className="h-3 w-3" fill={isFiltered ? 'currentColor' : 'none'} />
        </button>
      )}
      {filterOpen && col && createPortal(
        <div
          ref={panelRef}
          data-column-filter-panel="true"
          style={{
            position: 'absolute',
            top: panelPos.top,
            left: panelPos.left,
            zIndex: 9999,
            minWidth: 256,
          }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3"
        >
          <ColumnFilterPanel
            columnKey={colId}
            columnLabel={col.label}
            partition={partition}
            currentModel={filterModel[colId]}
            onApply={(model) => {
              const next = { ...filterModel };
              if (model) next[colId] = model;
              else delete next[colId];
              onFilterChange?.(next);
            }}
            onClose={() => setFilterOpen(false)}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── RowActionsCellRenderer (module scope) ────────────────────────────────────
function RowActionsCellRenderer(params) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const row = params.data;

  const openMenu = useCallback((e) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + window.scrollY + 2, left: rect.right + window.scrollX - 144 });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!row) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <button
        ref={btnRef}
        onClick={openMenu}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4 text-slate-500 dark:text-slate-400" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          data-row-actions-panel="true"
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 144 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1"
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
            onClick={() => { setOpen(false); params.context?.actions?.onEdit?.(row); }}
          >
            <Pencil className="h-4 w-4" /> Επεξεργασία
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600"
            onClick={() => { setOpen(false); params.context?.actions?.onDelete?.(row); }}
          >
            <Trash2 className="h-4 w-4" /> Διαγραφή
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── buildAgColumnDefs ────────────────────────────────────────────────────────
function buildAgColumnDefs(columns, columnOrder, sortModel) {
  const ordered = columnOrder
    ? columnOrder.map(k => columns.find(c => c.key === k)).filter(Boolean)
    : columns;

  return ordered.map(col => {
    const base = {
      colId: col.key,
      field: col.key,
      headerName: col.label,
      headerComponent: RecordsHeaderComponent,
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 80,
      suppressMovable: false,
    };

    if (col.type === 'boolean') {
      return {
        ...base,
        cellRenderer: 'agCheckboxCellRenderer',
        cellEditor: 'agCheckboxCellEditor',
        singleClickEdit: true,
        editable: true,
        width: 100,
      };
    }

    if (col.render) {
      return {
        ...base,
        editable: col.editable,
        cellRenderer: (p) => {
          if (!p.data) return null;
          return col.render(p.value);
        },
      };
    }

    return {
      ...base,
      editable: col.editable,
      valueFormatter: (p) => {
        const v = p.value;
        if (v === null || v === undefined || v === '') return '-';
        return String(v);
      },
    };
  });
}

// ─── File utilities ───────────────────────────────────────────────────────────
function parseVoted(val) {
  if (val === true || val === false) return val;
  const s = String(val ?? '').trim().toLowerCase();
  return ['ναι', 'nai', 'yes', 'true', '1', 'y'].includes(s);
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const key = LABEL_TO_KEY[k] || k;
    if (key === 'voted') {
      out[key] = v;
    } else if (v === null || v === undefined || v === '') {
      out[key] = '';
    } else {
      out[key] = String(v).trim();
    }
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Records() {
  const queryClient = useQueryClient();
  const agGridRef = useRef(null);

  // Preferences
  const [columnOrder, setColumnOrder] = useState(null);
  const [filterModel, setFilterModel] = useState({});
  const [sortModel, setSortModel] = useState({ field: 'created_date', dir: 'desc' });
  const columnOrderSaveTimer = useRef(null);
  const prefSaveTimer = useRef(null);

  // UI state
  const [editDialog, setEditDialog] = useState({ open: false, person: null });
  const [addDialog, setAddDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ step: '', percent: 0 });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState(null);
  const [importJobId, setImportJobId] = useState(null);
  const [exportJobId, setExportJobId] = useState(null);
  const [partition, setPartition] = useState('all');
  const [showDatasets, setShowDatasets] = useState(false); // collapsible datasets panel (compact by default)
  const [mixedImportDialog, setMixedImportDialog] = useState(false);
  const [mixedMissingCount, setMixedMissingCount] = useState(0);
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const serverSearchDebounceRef = useRef(null);
  const [missingPersonIdDialog, setMissingPersonIdDialog] = useState(false);
  const [fileColumns, setFileColumns] = useState([]);
  const [personIdMapping, setPersonIdMapping] = useState('');
  const [pendingRows, setPendingRows] = useState([]);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);

  // Refs for stale closure avoidance
  const columnOrderRef = useRef(columnOrder);
  const filterModelRef = useRef(filterModel);
  const sortModelRef = useRef(sortModel);
  const partitionRef = useRef(partition);
  const searchRef = useRef(serverSearchTerm);
  useEffect(() => { columnOrderRef.current = columnOrder; }, [columnOrder]);
  useEffect(() => { filterModelRef.current = filterModel; }, [filterModel]);
  useEffect(() => { sortModelRef.current = sortModel; }, [sortModel]);
  useEffect(() => { partitionRef.current = partition; }, [partition]);
  useEffect(() => { searchRef.current = serverSearchTerm; }, [serverSearchTerm]);

  // Load persisted preferences
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionToken = localStorage.getItem('app_session_token');
        const { data } = await base44.functions.invoke('gridPreferencesLoad', { grid_key: GRID_KEY, session_token: sessionToken });
        if (!cancelled) {
          const sj = data?.state_json || data?.preference?.state_json || {};
          setColumnOrder(sj.columnOrder || COLUMNS.filter(c => c.reorderable).map(c => c.key));
          setFilterModel(sj.filterModel || {});
          setSortModel(sj.sortModel || { field: 'created_date', dir: 'desc' });
        }
      } catch {
        if (!cancelled) {
          setColumnOrder(COLUMNS.filter(c => c.reorderable).map(c => c.key));
          setFilterModel({});
          setSortModel({ field: 'created_date', dir: 'desc' });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const savePreferences = useCallback((patch) => {
    if (prefSaveTimer.current) clearTimeout(prefSaveTimer.current);
    prefSaveTimer.current = setTimeout(async () => {
      try {
        await base44.functions.invoke('gridPreferencesSave', {
          grid_key: GRID_KEY,
          session_token: localStorage.getItem('app_session_token'),
          state_json: {
            columnOrder: columnOrderRef.current,
            filterModel: filterModelRef.current,
            sortModel: sortModelRef.current,
            ...patch,
          },
        });
      } catch { /* silent */ }
    }, 800);
  }, []);

  const handleColumnOrderChange = useCallback((newOrder) => {
    setColumnOrder(newOrder);
    if (columnOrderSaveTimer.current) clearTimeout(columnOrderSaveTimer.current);
    columnOrderSaveTimer.current = setTimeout(async () => {
      try {
        await base44.functions.invoke('gridPreferencesSave', {
          grid_key: GRID_KEY,
          session_token: localStorage.getItem('app_session_token'),
          state_json: {
            columnOrder: newOrder,
            filterModel: filterModelRef.current,
            sortModel: sortModelRef.current,
          },
        });
      } catch { /* silent */ }
    }, 800);
  }, []);

  const handleFilterModelChange = useCallback((newFilterModel) => {
    setFilterModel(newFilterModel);
    filterModelRef.current = newFilterModel;
    savePreferences({ filterModel: newFilterModel });
  }, [savePreferences]);

  // For AG Grid column filter panel
  const handleAgColumnFilterChange = useCallback((newFilterModel) => {
    handleFilterModelChange(newFilterModel);
    // Purge AG Grid cache so new filter takes effect
    setTimeout(() => {
      const api = agGridRef.current?.api;
      if (api) api.purgeInfiniteCache();
    }, 50);
  }, [handleFilterModelChange]);

  const handleSortModelChange = useCallback((field, dir) => {
    const newSort = { field, dir };
    setSortModel(newSort);
    sortModelRef.current = newSort;
    savePreferences({ sortModel: newSort });
  }, [savePreferences]);

  // AG Grid: column reorder → filter to reorderable keys
  const handleAgColumnOrderChange = useCallback((order) => {
    const reorderableKeys = new Set(COLUMNS.filter(c => c.reorderable).map(c => c.key));
    const filtered = order.filter(k => reorderableKeys.has(k));
    if (filtered.join(',') === (columnOrderRef.current || []).join(',')) return;
    handleColumnOrderChange(filtered);
  }, [handleColumnOrderChange]);

  // ── AG Grid column defs ────────────────────────────────────────────────────
  const agColumnDefs = useMemo(() => {
    if (!columnOrder) return [];
    const defs = buildAgColumnDefs(COLUMNS, columnOrder, sortModel);
    // Append actions column
    defs.push({
      colId: '__actions__',
      headerName: '',
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      pinned: 'right',
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      cellRenderer: RowActionsCellRenderer,
    });
    return defs;
  }, [columnOrder, sortModel]);

  // ── AG Grid context ────────────────────────────────────────────────────────
  const agGridContext = useMemo(() => ({
    actions: {
      onEdit: (row) => { setFormData({ ...row }); setEditDialog({ open: true, person: row }); },
      onDelete: (row) => { if (confirm('Είστε σίγουροι;')) deleteMutation.mutate(row.id); },
    },
    filterModel,
    onFilterChange: handleAgColumnFilterChange,
    partition,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filterModel, handleAgColumnFilterChange, partition]);

  // ── Datasets query ─────────────────────────────────────────────────────────
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

  // ── People query (legacy DataGrid path) ────────────────────────────────────
  const peopleQuery = useInfiniteQuery({
    queryKey: ['people', activeDatasetId, partition, serverSearchTerm, stableStringify(filterModel), stableStringify(sortModel)],
    enabled: !!activeDatasetId && !USE_AG_GRID,
    staleTime: 30000,
    placeholderData: (prev) => prev,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const { data: result } = await base44.functions.invoke('personGridFetch', {
        session_token: localStorage.getItem('app_session_token'),
        datasetId: activeDatasetId,
        partition,
        startRow: pageParam,
        endRow: pageParam + PEOPLE_PAGE_SIZE,
        sortField: sortModel.field,
        sortDirection: sortModel.dir,
        filters: Object.keys(filterModel).length > 0 ? filterModel : null,
        search: serverSearchTerm || undefined,
      });
      return result?.rows ?? [];
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PEOPLE_PAGE_SIZE ? pages.length * PEOPLE_PAGE_SIZE : undefined,
  });

  const loadedPeople = useMemo(() => peopleQuery.data?.pages?.flat() ?? [], [peopleQuery.data]);
  const people = loadedPeople;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Person.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', activeDatasetId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      if (USE_AG_GRID) {
        agGridRef.current?.api?.refreshInfiniteCache();
      }
      setAddDialog(false);
      setFormData({});
      toast.success('Η εγγραφή δημιουργήθηκε');
    },
    onError: (e) => toast.error(e.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, row_version }) => {
      const { data: result } = await base44.functions.invoke('personGridBatchUpdate', {
        session_token: localStorage.getItem('app_session_token'),
        person_id: id,
        fields: data,
        expected_row_version: row_version || 1,
      });
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result, { id }) => {
      const updatedRow = result?.data;
      setEditDialog({ open: false, person: null });
      toast.success('Η εγγραφή ενημερώθηκε');

      if (USE_AG_GRID) {
        const api = agGridRef.current?.api;
        if (api && updatedRow) {
          const node = api.getRowNode(updatedRow.id);
          const oldRow = node?.data;
          if (node && isSafeToPatch(oldRow, updatedRow, {
            sortModel: sortModelRef.current,
            filterModel: filterModelRef.current,
            partition: partitionRef.current,
            serverSearchTerm: searchRef.current,
          })) {
            node.setData(updatedRow);
          } else {
            api.purgeInfiniteCache();
          }
        } else {
          api?.purgeInfiniteCache();
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['people'] });
      }
    },
    onError: (e) => {
      if (e.message?.includes('Conflict')) {
        toast.error('Η εγγραφή άλλαξε από άλλον χρήστη. Ανανεώστε και προσπαθήστε ξανά.');
      } else {
        toast.error(e.message || 'Αποτυχία αποθήκευσης');
      }
    }
  });

  const updateCellMutation = useMutation({
    mutationFn: async ({ id, field, value, row_version }) => {
      const { data } = await base44.functions.invoke('personGridUpdateCell', {
        person_id: id,
        field,
        value,
        expected_row_version: row_version || 1,
        session_token: localStorage.getItem('app_session_token'),
      });
      if (data?.error) throw Object.assign(new Error(data.error), { isConflict: data.error === 'Conflict', currentRow: data.current_row });
      return data;
    },
    onMutate: async ({ id, field, value }) => {
      if (USE_AG_GRID || !activeDatasetId) return;
      const qk = ['people', activeDatasetId, partition, serverSearchTerm, stableStringify(filterModel), stableStringify(sortModel)];
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData(qk);
      queryClient.setQueryData(qk, (old) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map(pg => pg.map(r => r.id === id ? { ...r, [field]: value } : r)) };
      });
      return { prev, qk };
    },
    onSuccess: (result, { id }, ctx) => {
      const updatedRow = result?.data;
      if (USE_AG_GRID) return; // AG Grid path handles this in handleAgCellValueChanged
      if (!updatedRow || !ctx?.qk) return;
      queryClient.setQueryData(ctx.qk, (old) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map(pg => pg.map(r => r.id === id ? updatedRow : r)) };
      });
    },
    onError: (err, _vars, ctx) => {
      if (!USE_AG_GRID && ctx?.prev && ctx?.qk) queryClient.setQueryData(ctx.qk, ctx.prev);
      if (err.isConflict) {
        toast.error('Η εγγραφή άλλαξε από άλλον χρήστη. Ανανεώστε και προσπαθήστε ξανά.');
        if (USE_AG_GRID) agGridRef.current?.api?.purgeInfiniteCache();
        else queryClient.invalidateQueries({ queryKey: ['people'] });
      } else {
        toast.error('Αποτυχία αποθήκευσης');
      }
    },
  });

  // AG Grid inline cell edit handler
  const handleAgCellValueChanged = useCallback(async (params) => {
    const row = params.data;
    if (!row?.id) return;
    const field = params.column.getColId();
    const value = params.newValue;
    if (REMOVED_FIELDS.has(field) || field === '__actions__') return;

    try {
      const { data: result } = await base44.functions.invoke('personGridUpdateCell', {
        person_id: row.id,
        field,
        value,
        expected_row_version: row.row_version || 1,
        session_token: localStorage.getItem('app_session_token'),
      });
      if (result?.error) throw new Error(result.error);
      const updatedRow = result?.data;
      if (updatedRow) {
        const node = params.node;
        const old = node.data;
        if (isSafeToPatch(old, updatedRow, {
          sortModel: sortModelRef.current,
          filterModel: filterModelRef.current,
          partition: partitionRef.current,
          serverSearchTerm: searchRef.current,
        })) {
          node.setData(updatedRow);
        } else {
          agGridRef.current?.api?.purgeInfiniteCache();
        }
      }
    } catch (e) {
      toast.error('Αποτυχία αποθήκευσης: ' + (e.message || ''));
      agGridRef.current?.api?.purgeInfiniteCache();
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: (_, id) => {
      if (USE_AG_GRID) {
        agGridRef.current?.api?.purgeInfiniteCache();
      } else {
        const qk = ['people', activeDatasetId, partition, serverSearchTerm, stableStringify(filterModel), stableStringify(sortModel)];
        queryClient.setQueryData(qk, (old) => {
          if (!old) return old;
          return { ...old, pages: old.pages.map(pg => pg.filter(r => r.id !== id)) };
        });
      }
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Η εγγραφή διαγράφηκε');
    },
    onError: (e) => toast.error(e.message)
  });

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!activeDatasetId) return toast.error('Δεν υπάρχει ενεργό dataset');
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('exportPersonsJob', {
        session_token: sessionToken,
        datasetId: activeDatasetId,
        datasetName: activeDataset?.name,
        partition,
        filters: Object.keys(filterModel).length > 0 ? filterModel : null,
        sortField: sortModel.field,
        sortDirection: sortModel.dir,
        search: serverSearchTerm || undefined,
      });
      if (data?.job_id) {
        setExportJobId(data.job_id);
      } else {
        toast.error(data?.error || 'Σφάλμα εξαγωγής');
      }
    } catch (e) {
      toast.error('Σφάλμα εξαγωγής: ' + e.message);
    }
  };

  // ── Download Template ──────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map(c => c.label)]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Πρότυπο');
      XLSX.writeFile(wb, 'πρότυπο_εγγραφών.xlsx');
    } catch (e) {
      toast.error('Σφάλμα: ' + e.message);
    }
  };

  // ── Import (new backend-driven) ───────────────────────────────────────────
  const doImport = async (overrideFile, personIdCol) => {
    if (!overrideFile && !uploadFile) return;
    const file = overrideFile || uploadFile;
    setUploadLoading(true);
    setUploadProgress({ step: 'Ανέβασμα αρχείου...', percent: 5 });
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadProgress({ step: 'Εκκίνηση εισαγωγής...', percent: 20 });
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('importPersonsJob', {
        session_token: sessionToken,
        file_url,
        dataset_name: file.name,
        person_id_col: personIdCol || null,
      });
      if (data?.job_id) {
        setUploadDialog(false);
        setMissingPersonIdDialog(false);
        setMixedImportDialog(false);
        setUploadFile(null);
        setPendingRows([]);
        setImportJobId(data.job_id);
      } else {
        toast.error(data?.error || 'Σφάλμα εκκίνησης εισαγωγής');
      }
    } catch (e) {
      toast.error('Σφάλμα εισαγωγής: ' + e.message);
    } finally {
      setUploadLoading(false);
      setUploadProgress({ step: '', percent: 0 });
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) return toast.error('Παρακαλώ επιλέξτε αρχείο');
    // For person_id detection, still parse locally (lightweight)
    setUploadLoading(true);
    try {
      let rawRows = [];
      try { rawRows = await parseFileToRows(uploadFile); } catch (e) {
        toast.error('Σφάλμα ανάλυσης: ' + e.message);
        return;
      }
      const normalized = rawRows.map(normalizeRow);
      const hasMissing = normalized.some(r => !r.person_id || String(r.person_id).trim() === '');
      const allMissing = normalized.every(r => !r.person_id || String(r.person_id).trim() === '');

      if (allMissing && rawRows.length > 0) {
        setFileColumns(Object.keys(rawRows[0] || {}));
        setPendingRows(rawRows);
        setPersonIdMapping('');
        setUploadLoading(false);
        setMissingPersonIdDialog(true);
        return;
      }
      if (hasMissing && rawRows.length > 0) {
        const missingCount = normalized.filter(r => !r.person_id || String(r.person_id).trim() === '').length;
        setFileColumns(Object.keys(rawRows[0] || {}));
        setPendingRows(rawRows);
        setMixedMissingCount(missingCount);
        setUploadLoading(false);
        setMixedImportDialog(true);
        return;
      }
      await doImport(uploadFile, null);
    } catch (e) {
      toast.error('Σφάλμα: ' + e.message);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleMissingPersonIdIgnore = () => doImport(uploadFile, null);
  const handleMissingPersonIdMapping = () => {
    if (!personIdMapping) return toast.error('Παρακαλώ επιλέξτε στήλη');
    doImport(uploadFile, personIdMapping);
  };
  const handleMixedAutoGenerate = () => { setMixedImportDialog(false); doImport(uploadFile, null); };
  const handleMixedSkipMissing = () => { setMixedImportDialog(false); doImport(uploadFile, null); };

  // ── Dataset management ────────────────────────────────────────────────────
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
    setDeleteLoading(true);
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('deleteDataset', { dataset_id: datasetId, session_token: sessionToken });
      if (data.success && data.job_id) {
        setDeleteJobId(data.job_id);
      } else {
        toast.error(data.error || 'Σφάλμα κατά τη διαγραφή');
      }
    } catch (e) {
      toast.error('Σφάλμα: ' + e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteAllPersons = async () => {
    setDeleteAllConfirmOpen(false);
    setDeleteLoading(true);
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('deleteAllPersons', { session_token: sessionToken });
      if (data.success && data.job_id) {
        setDeleteJobId(data.job_id);
      } else {
        toast.error(data.error || 'Σφάλμα κατά τη διαγραφή');
      }
    } catch (e) {
      toast.error('Σφάλμα: ' + e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchLatestRow = useCallback(async (rowId) => {
    const sessionToken = localStorage.getItem('app_session_token');
    const { data } = await base44.functions.invoke('personGridGetRow', { row_id: rowId, session_token: sessionToken });
    if (data?.error) throw new Error(data.error);
    return data?.data ?? null;
  }, []);

  const handleRowRefreshed = useCallback((id, newData) => {
    if (!activeDatasetId || USE_AG_GRID) return;
    const qk = ['people', activeDatasetId, partition, serverSearchTerm, stableStringify(filterModel), stableStringify(sortModel)];
    queryClient.setQueryData(qk, (old) => {
      if (!old) return old;
      return { ...old, pages: old.pages.map(pg => pg.map(r => r.id === id ? newData : r)) };
    });
  }, [activeDatasetId, partition, serverSearchTerm, filterModel, sortModel, queryClient]);

  const handleDeleteJobClose = () => {
    setDeleteJobId(null);
    queryClient.removeQueries({ queryKey: ['people'] });
    queryClient.invalidateQueries({ queryKey: ['people'] });
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
    if (USE_AG_GRID) agGridRef.current?.api?.purgeInfiniteCache();
  };

  const handleImportJobClose = () => {
    setImportJobId(null);
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
    if (USE_AG_GRID) agGridRef.current?.api?.purgeInfiniteCache();
  };

  const handlePullRefresh = useCallback(async () => {
    queryClient.removeQueries({ queryKey: ['people'] });
    await queryClient.invalidateQueries({ queryKey: ['people'] });
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
    if (USE_AG_GRID) agGridRef.current?.api?.purgeInfiniteCache();
  }, [queryClient]);

  // ── Real-time subscription (AG Grid path) ────────────────────────────────
  useEffect(() => {
    if (!USE_AG_GRID || !activeDatasetId) return;
    const unsubscribe = base44.entities.Person.subscribe((event) => {
      const api = agGridRef.current?.api;
      if (!api) return;

      if (event.type === 'delete') {
        api.purgeInfiniteCache();
        return;
      }
      if (event.type === 'create') {
        const data = event.data;
        if (!data || data.dataset_id !== activeDatasetId) return;
        // Check partition match
        const acLevel = data.academic_level || '';
        if (partitionRef.current === 'postgrad' && !POSTGRAD_LEVELS.includes(acLevel)) return;
        if (partitionRef.current === 'undergrad' && !UNDERGRAD_LEVELS.includes(acLevel)) return;
        if (partitionRef.current === 'unknown' && (POSTGRAD_LEVELS.includes(acLevel) || UNDERGRAD_LEVELS.includes(acLevel))) return;
        api.refreshInfiniteCache();
        return;
      }
      if (event.type === 'update') {
        const updatedRow = event.data;
        if (!updatedRow) return;
        const node = api.getRowNode(updatedRow.id);
        const oldRow = node?.data;
        if (node && isSafeToPatch(oldRow, updatedRow, {
          sortModel: sortModelRef.current,
          filterModel: filterModelRef.current,
          partition: partitionRef.current,
          serverSearchTerm: searchRef.current,
        })) {
          node.setData(updatedRow);
        } else {
          api.purgeInfiniteCache();
        }
      }
    });
    return () => unsubscribe();
  }, [activeDatasetId]);

  // ── Real-time subscription (legacy DataGrid path) ────────────────────────
  useEffect(() => {
    if (USE_AG_GRID || !activeDatasetId) return;
    const qk = ['people', activeDatasetId, partition, serverSearchTerm, stableStringify(filterModel), stableStringify(sortModel)];
    const unsubscribe = base44.entities.Person.subscribe((event) => {
      if (event.type === 'delete') {
        queryClient.setQueryData(qk, (old) => {
          if (!old) return old;
          return { ...old, pages: old.pages.map(pg => pg.filter(r => r.id !== event.id)) };
        });
      } else if (event.type === 'update') {
        const updatedRow = event.data;
        if (!updatedRow) return;
        const node = null;
        queryClient.setQueryData(qk, (old) => {
          if (!old) return old;
          let found = false;
          const pages = old.pages.map(pg => pg.map(r => {
            if (r.id === updatedRow.id) { found = true; return updatedRow; }
            return r;
          }));
          if (!found) return old;
          return { ...old, pages };
        });
      }
    });
    return () => unsubscribe();
  }, [activeDatasetId, partition, serverSearchTerm, filterModel, sortModel, queryClient]);

  // ── Subtitle ──────────────────────────────────────────────────────────────
  const subtitle = useMemo(() => {
    if (!activeDataset) return 'Δεν υπάρχει ενεργό dataset';
    const total = activeDataset.total_records ?? '—';
    const partLabel = { all: 'Όλα', undergrad: 'Προπτυχιακοί', postgrad: 'Μεταπτυχιακοί', unknown: 'Άγνωστοι' }[partition] || partition;
    if (USE_AG_GRID) return `${activeDataset.name} • ${total} εγγραφές (${partLabel})`;
    const loaded = loadedPeople.length;
    return `${activeDataset.name} • Φορτώθηκαν ${loaded.toLocaleString('el-GR')} / ${total} (${partLabel})`;
  }, [activeDataset, loadedPeople.length, partition]);

  if (datasetsLoading) return <LoadingSpinner />;

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div className="space-y-3">
        {/* Single-line header: title (shrinks) + all controls inline; scrolls if too narrow */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Database className="h-5 w-5 text-blue-600 shrink-0" />
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 shrink-0">Εγγραφές</h1>
            {subtitle && <span className="hidden lg:inline text-xs text-slate-500 dark:text-slate-400 truncate">— {subtitle}</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {USE_AG_GRID && (
              <AgGridSearchInput
                value={serverSearchTerm}
                onCommit={(val) => {
                  if (val.length === 0 || val.length >= SEARCH_MIN_CHARS) {
                    setServerSearchTerm(val);
                  }
                }}
              />
            )}

            <Select value={partition} onValueChange={setPartition}>
              <SelectTrigger className="h-8 w-[130px] text-sm shrink-0"><SelectValue placeholder="Ομάδα" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλα</SelectItem>
                <SelectItem value="postgrad">Μεταπτυχιακοί</SelectItem>
                <SelectItem value="undergrad">Προπτυχιακοί</SelectItem>
                <SelectItem value="unknown">Άγνωστοι</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-8 shrink-0">
              <FileSpreadsheet className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Πρότυπο</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setUploadDialog(true)} className="h-8 shrink-0">
              <Upload className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Εισαγωγή</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!activeDatasetId} className="h-8 shrink-0">
              <Download className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Εξαγωγή</span>
            </Button>
            <Button size="sm" disabled={!activeDatasetId} onClick={() => { if (!activeDatasetId) return; setFormData({}); setAddDialog(true); }} className="h-8 shrink-0">
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Νέα</span>
            </Button>
            <Button variant="destructive" size="sm" className="h-8 shrink-0" disabled={deleteLoading} onClick={() => setDeleteAllConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Ολική Διαγραφή</span>
            </Button>
          </div>
        </div>

        {datasets.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowDatasets(v => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              <span className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                Datasets
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate">
                  ({datasets.length}{activeDataset ? ` • ενεργό: ${activeDataset.name}` : ''})
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showDatasets ? 'rotate-180' : ''}`} />
            </button>
            {showDatasets && (
            <div className="space-y-2 px-3 pb-3">
              {datasets.map(dataset => (
                <div key={dataset.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate text-slate-900 dark:text-slate-100">{dataset.name}</p>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{dataset.total_records || 0} εγγραφές • {dataset.status}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {dataset.status !== 'active' && (
                      <Button size="sm" onClick={() => handleActivateDataset(dataset.id)} className="h-9">
                        <CheckCircle2 className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Ενεργοποίηση</span>
                      </Button>
                    )}
                    {dataset.status === 'active' && <Badge className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-0">Ενεργό</Badge>}
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteDataset(dataset.id)} className="h-9 w-9 p-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {!activeDatasetId ? (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center text-slate-600 dark:text-slate-400">
            Δεν υπάρχει ενεργό dataset. Κάντε <strong>Εισαγωγή</strong> αρχείου ή ενεργοποιήστε ένα dataset.
          </div>
        ) : USE_AG_GRID ? (
          <RecordsAgGrid
            ref={agGridRef}
            activeDatasetId={activeDatasetId}
            partition={partition}
            serverSearchTerm={serverSearchTerm}
            filterModel={filterModel}
            sortModel={sortModel}
            columnDefs={agColumnDefs}
            context={agGridContext}
            onCellValueChanged={handleAgCellValueChanged}
            onSortModelChange={handleSortModelChange}
            onColumnOrderChange={handleAgColumnOrderChange}
            gridRef={agGridRef}
            height="calc(100vh - 150px)"
          />
        ) : (
          <DataGrid
            mode="infinite"
            height="calc(100vh - 150px)"
            data={people}
            columns={COLUMNS}
            searchable
            filterable
            sortable
            editable
            hasMore={!!peopleQuery.hasNextPage}
            isLoadingMore={peopleQuery.isFetchingNextPage}
            onLoadMore={() => peopleQuery.fetchNextPage()}
            fetchLatestRow={fetchLatestRow}
            onRowRefreshed={handleRowRefreshed}
            columnOrder={columnOrder}
            onColumnOrderChange={handleColumnOrderChange}
            serverFiltering={true}
            filterModel={filterModel}
            onFilterModelChange={handleFilterModelChange}
            sortModel={sortModel}
            onSortModelChange={handleSortModelChange}
            partition={partition}
            onSearchChange={(value) => {
              if (serverSearchDebounceRef.current) clearTimeout(serverSearchDebounceRef.current);
              serverSearchDebounceRef.current = setTimeout(() => setServerSearchTerm(value), 300);
            }}
            onCellUpdate={async ({ row, key, value }) => {
              await updateCellMutation.mutateAsync({ id: row.id, field: key, value, row_version: row.row_version || 1 });
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

        {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
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
                { key: 'direction', label: 'ΚΑΤ' },
                { key: 'X', label: 'X' },
                { key: 'F26_1', label: 'Φ26_1' },
                { key: 'F25', label: 'Φ25' },
                { key: 'phone', label: 'phone' },
                { key: 'T24', label: 'T24' },
                { key: 'F24', label: 'Φ24' },
                { key: 'F23', label: 'Φ23' },
                { key: 'T22', label: 'T22' },
                { key: 'father_n', label: 'ΟΝ_ΠΑΤΡΟΣ' },
                { key: 'father_name', label: 'ΟΝΟΜΑ ΠΑΤΕΡΑ' },
                { key: 'ElectoralDistrict', label: 'ElectoralDistrict' },
                { key: 'ElectoralTown', label: 'ElectoralTown' },
                { key: 'RelatedMember', label: 'RelatedMember' },
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
              <div className="col-span-2 space-y-2">
                <Label>ΠΑΡΑΤΗΡΗΣΕΙΣ</Label>
                <Textarea value={formData.details || ''} onChange={e => setFormData(f => ({ ...f, details: e.target.value }))} rows={2} />
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
                    updateMutation.mutate({ id: editDialog.person.id, data: formData, row_version: editDialog.person.row_version || 1 });
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

        {/* ── Missing person_id Dialog ──────────────────────────────────────── */}
        <Dialog open={missingPersonIdDialog} onOpenChange={(open) => { if (!uploadLoading) setMissingPersonIdDialog(open); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>⚠️ Λείπει το πεδίο ΑΤ (ID)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">Το αρχείο δεν περιέχει στήλη <strong>person_id / ΑΤ</strong>. Πώς θέλετε να συνεχίσετε;</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-medium text-amber-900">Επιλογή 1: Αγνόηση & Εισαγωγή</p>
                <p className="text-xs text-amber-800">Το σύστημα θα δημιουργήσει αυτόματα αύξοντα αριθμό ως person_id.</p>
                <Button className="w-full" variant="outline" onClick={handleMissingPersonIdIgnore} disabled={uploadLoading}>
                  {uploadLoading ? 'Εισαγωγή...' : 'Αγνόηση & Εισαγωγή με auto-ID'}
                </Button>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-medium text-blue-900">Επιλογή 2: Επιλογή στήλης</p>
                <Select value={personIdMapping} onValueChange={setPersonIdMapping}>
                  <SelectTrigger><SelectValue placeholder="Επιλέξτε στήλη..." /></SelectTrigger>
                  <SelectContent>{fileColumns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}</SelectContent>
                </Select>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleMissingPersonIdMapping} disabled={!personIdMapping || uploadLoading}>
                  {uploadLoading ? 'Εισαγωγή...' : 'Εισαγωγή με επιλεγμένη στήλη'}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setMissingPersonIdDialog(false); setPendingRows([]); }}>Ακύρωση</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Mixed Import Dialog ───────────────────────────────────────────── */}
        <Dialog open={mixedImportDialog} onOpenChange={(open) => { if (!uploadLoading) setMixedImportDialog(open); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>⚠️ Μερικές γραμμές χωρίς person_id</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Το αρχείο περιέχει <strong>{mixedMissingCount}</strong> γραμμές χωρίς person_id και{' '}
                <strong>{pendingRows.length - mixedMissingCount}</strong> γραμμές με person_id.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-blue-900">Αυτόματη δημιουργία ID (AUTO-1, AUTO-2...)</p>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleMixedAutoGenerate} disabled={uploadLoading}>
                  {uploadLoading ? 'Εισαγωγή...' : `Αυτόματη δημιουργία ID (${mixedMissingCount} γραμμές)`}
                </Button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-amber-900">Παράλειψη γραμμών χωρίς ID</p>
                <Button variant="outline" className="w-full" onClick={handleMixedSkipMissing} disabled={uploadLoading}>
                  Παράλειψη {mixedMissingCount} γραμμών
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setMixedImportDialog(false); setPendingRows([]); }} disabled={uploadLoading}>
                Ακύρωση
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete All Confirmation ────────────────────────────────────────── */}
        <Dialog open={deleteAllConfirmOpen} onOpenChange={setDeleteAllConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Trash2 className="h-5 w-5" /> Ολική Διαγραφή Όλων των Δεδομένων
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Θα διαγραφούν <strong>ΟΛΕΣ</strong> οι εγγραφές και <strong>ΟΛΑ</strong> τα Dataset. Η ενέργεια δεν μπορεί να αναιρεθεί.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                ⚠️ Δεν υπάρχει δυνατότητα επαναφοράς μετά την επιβεβαίωση.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteAllConfirmOpen(false)}>Ακύρωση</Button>
              <Button variant="destructive" onClick={handleDeleteAllPersons} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Διαγραφή...</> : 'Ναι, διαγραφή όλων'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Upload Dialog ─────────────────────────────────────────────────── */}
        <Dialog open={uploadDialog} onOpenChange={(open) => { if (!uploadLoading) setUploadDialog(open); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Εισαγωγή Αρχείου</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {!uploadLoading ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-medium mb-1">💡 Συμβουλή</p>
                    <p className="text-sm text-blue-800">
                      Χρησιμοποιήστε το <strong>«Πρότυπο»</strong> για να κατεβάσετε πρότυπο XLSX. Υποστηρίζονται .csv, .xlsx, .xls.
                    </p>
                  </div>
                  <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => setUploadFile(e.target.files[0])} />
                  {uploadFile && (
                    <p className="text-sm text-green-600 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Επιλέχθηκε: {uploadFile.name}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{uploadProgress.step}</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${uploadProgress.percent}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{uploadProgress.percent}% ολοκληρώθηκε — παρακαλώ περιμένετε...</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setUploadDialog(false); setUploadFile(null); }} disabled={uploadLoading}>Ακύρωση</Button>
              <Button onClick={handleFileUpload} disabled={uploadLoading || !uploadFile}>
                {uploadLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Εισαγωγή...</> : 'Εισαγωγή'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Progress Modals ───────────────────────────────────────────────── */}
        {deleteJobId && <DeleteProgressModal jobId={deleteJobId} onClose={handleDeleteJobClose} />}
        {importJobId && <ImportProgressModal jobId={importJobId} onClose={handleImportJobClose} />}
        {exportJobId && <ExportProgressModal jobId={exportJobId} datasetName={activeDataset?.name} onClose={() => setExportJobId(null)} />}
      </div>
    </PullToRefresh>
  );
}