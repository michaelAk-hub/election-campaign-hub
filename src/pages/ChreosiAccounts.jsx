import React, { useState, useCallback, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '../components/common/PageHeader';
import ChreosiPrintDialog from '../components/chreosi/ChreosiPrintDialog';
import ChreosiCreateDialog from '../components/chreosi/ChreosiCreateDialog';
import ChreosiDuplicatesDialog from '../components/chreosi/ChreosiDuplicatesDialog';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  UserPlus, Pencil, Key, UserX, UserCheck, Copy, Trash2, AlertTriangle,
  MessageSquare, Send, RefreshCw, Printer, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, GitMerge, Loader2, CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { PERSON_FIELDS } from '../lib/personFields';

const VOTED_STATUS_OPTIONS = [
  { value: 'false', label: 'Δεν Ψήφισαν' },
  { value: 'true', label: 'Ψήφισαν' },
];

const PAGE_SIZE = 25;

// ──────────────────────────────────────────────
// Mobile action sheet modal
// ──────────────────────────────────────────────
function MobileActionSheet({ row, open, onClose, onEdit, onResetPassword, onDelete, onSendSms }) {
  if (!open || !row) return null;
  const actions = [
    { icon: Pencil, label: 'Επεξεργασία', action: () => { onEdit(row); onClose(); } },
    { icon: Key, label: 'Επαναφορά Κωδικού', action: () => { onResetPassword(row); onClose(); } },
    { icon: MessageSquare, label: 'Αποστολή SMS', action: () => { onSendSms(row); onClose(); } },
    { icon: Trash2, label: 'Διαγραφή', action: () => { onDelete(row); onClose(); }, danger: true },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl w-full max-w-sm p-4 space-y-2" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-2 pb-1 border-b border-slate-100 dark:border-slate-700 truncate">{row.username}</p>
        {actions.map((item, i) => (
          <button key={i} onClick={item.action}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
        <button onClick={onClose} className="w-full text-center text-sm text-slate-400 py-2">Κλείσιμο</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Desktop row actions dropdown
// ──────────────────────────────────────────────
function RowActionsMenu({ row, onEdit, onResetPassword, onDelete, onSendSms, onMobileOpen }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = (e) => {
    // On touch devices, show mobile sheet instead
    if (window.matchMedia('(max-width: 768px)').matches) {
      onMobileOpen(row);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX - 160 });
    setOpen(v => !v);
  };

  return (
    <>
      <button ref={btnRef} onClick={handleOpen} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
        <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1"
        >
          {[
            { icon: Pencil, label: 'Επεξεργασία', action: () => { onEdit(row); setOpen(false); } },
            { icon: Key, label: 'Επαναφορά Κωδικού', action: () => { onResetPassword(row); setOpen(false); } },
            { icon: MessageSquare, label: 'Αποστολή SMS', action: () => { onSendSms(row); setOpen(false); } },
            { icon: Trash2, label: 'Διαγραφή', action: () => { onDelete(row); setOpen(false); }, danger: true },
          ].map((item, i) => (
            <button
              key={i}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-left ${item.danger ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}
              onClick={item.action}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function ChreosiAccounts() {
  const sessionToken = localStorage.getItem('app_session_token') || '';

  // ── Data state ──
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('username');
  const [sortDir, setSortDir] = useState('asc');
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState([]);
  const [allFilteredIds, setAllFilteredIds] = useState(null); // null = not loaded, array = loaded
  const [loadingAllIds, setLoadingAllIds] = useState(false);

  // ── Mobile action sheet ──
  const [mobileActionRow, setMobileActionRow] = useState(null);

  // ── Dialog state ──
  const [editDialog, setEditDialog] = useState({ open: false, account: null });
  const [formData, setFormData] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, ids: [], label: '' });
  const [createDialog, setCreateDialog] = useState(false);
  const [duplicatesDialog, setDuplicatesDialog] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [printDialog, setPrintDialog] = useState(false);
  const [printAccounts, setPrintAccounts] = useState([]);
  const [printPeople, setPrintPeople] = useState([]);
  const [bulkSymbolDialog, setBulkSymbolDialog] = useState(false);
  const [bulkSymbols, setBulkSymbols] = useState([]);
  const [bulkVoted, setBulkVoted] = useState([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [smsDialog, setSmsDialog] = useState({ open: false, username: null });
  const [smsTitle, setSmsTitle] = useState('Στοιχεία πρόσβασης');
  const [smsPortalUrl, setSmsPortalUrl] = useState('https://votecontrol.info/PortalLogin');
  const [smsTemplate, setSmsTemplate] = useState('Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}');
  const [smsIncludeTitleLine, setSmsIncludeTitleLine] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // ──────────────────────────────────────────────
  // Load accounts from backend
  // ──────────────────────────────────────────────
  const loadAccounts = useCallback(async (overridePage) => {
    const p = overridePage ?? page;
    setLoading(true);
    setAllFilteredIds(null); // reset select-all cache on any load
    try {
      const res = await base44.functions.invoke('chreosiListAccounts', {
        session_token: sessionToken,
        search,
        page: p,
        pageSize: PAGE_SIZE,
        sortField,
        sortDir,
      });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Load failed');
      setRows(d.rows || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
      setAvailableSymbols(d.availableSymbols || []);
    } catch (err) {
      toast.error(err.message || 'Σφάλμα φόρτωσης');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, search, page, sortField, sortDir]);

  useEffect(() => {
    loadAccounts();
  }, [page, sortField, sortDir]);

  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
    setAllFilteredIds(null);
    loadAccounts(0);
  }, [search]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortField !== col) return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-400" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" /> : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
  };

  // ──────────────────────────────────────────────
  // Selection helpers
  // ──────────────────────────────────────────────
  const selectedSet = new Set(selectedIds);
  const selectedAccounts = rows.filter(r => selectedSet.has(r.id));
  const allPageSelected = rows.length > 0 && rows.every(r => selectedSet.has(r.id));
  const somePageSelected = rows.some(r => selectedSet.has(r.id));
  const allFilteredSelected = allFilteredIds !== null && allFilteredIds.length > 0 && allFilteredIds.every(id => selectedSet.has(id));

  const toggleSelectAll = () => {
    if (allPageSelected) setSelectedIds(prev => prev.filter(id => !rows.find(r => r.id === id)));
    else setSelectedIds(prev => [...new Set([...prev, ...rows.map(r => r.id)])]);
  };

  const handleSelectAllFiltered = async () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      setSelectedIds([]);
      setAllFilteredIds(null);
      return;
    }
    if (allFilteredIds !== null) {
      // Already loaded — select them all
      setSelectedIds(allFilteredIds);
      return;
    }
    setLoadingAllIds(true);
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'get_all_filtered_ids',
        data: { search },
      });
      if (!res.data?.ok) throw new Error('Failed to load IDs');
      const ids = res.data.ids;
      setAllFilteredIds(ids);
      setSelectedIds(ids);
    } catch (err) {
      toast.error('Σφάλμα φόρτωσης');
    } finally {
      setLoadingAllIds(false);
    }
  };

  // ──────────────────────────────────────────────
  // Edit / Reset / Delete — all go through backend
  // ──────────────────────────────────────────────
  const handleEdit = (account) => {
    setFormData({ ...account });
    setEditDialog({ open: true, account });
  };

  const handleSaveEdit = async () => {
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'update',
        accountId: editDialog.account.id,
        data: {
          display_name: formData.display_name,
          phone: formData.phone,
          is_active: formData.is_active,
          allowed_prediction_symbols: formData.allowed_prediction_symbols || [],
          allowed_voted_statuses: formData.allowed_voted_statuses || [],
          visible_fields: formData.visible_fields || [],
          personal_note: formData.personal_note,
        },
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Update failed');
      toast.success('Ο λογαριασμός ενημερώθηκε');
      setEditDialog({ open: false, account: null });
      loadAccounts();
    } catch (err) {
      toast.error(err.message || 'Σφάλμα ενημέρωσης');
    }
  };

  const handleResetPassword = async (row) => {
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'reset_password',
        accountId: row.id,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Reset failed');
      const newPw = res.data.newPassword;
      toast.success(`Νέος κωδικός: ${newPw}`);
      navigator.clipboard.writeText(newPw).catch(() => {});
      loadAccounts();
    } catch (err) {
      toast.error(err.message || 'Σφάλμα επαναφοράς');
    }
  };

  const handleDelete = (row) => setDeleteDialog({ open: true, ids: [row.id], label: row.username });
  const handleBulkDelete = () => setDeleteDialog({ open: true, ids: selectedIds, label: `${selectedIds.length} λογαριασμοί` });

  const confirmDelete = async () => {
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'bulk_delete',
        accountIds: deleteDialog.ids,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Delete failed');
      toast.success('Διαγράφηκαν');
    } catch (err) {
      toast.error(err.message || 'Σφάλμα διαγραφής');
    }
    setDeleteDialog({ open: false, ids: [], label: '' });
    setSelectedIds([]);
    setAllFilteredIds(null);
    loadAccounts();
  };

  const handleBulkActivate = async (active) => {
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'bulk_set_active',
        accountIds: selectedIds,
        data: { is_active: active },
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Failed');
      toast.success(`${selectedIds.length} λογαριασμοί ${active ? 'ενεργοποιήθηκαν' : 'απενεργοποιήθηκαν'}`);
    } catch (err) {
      toast.error(err.message || 'Σφάλμα');
    }
    setSelectedIds([]);
    setAllFilteredIds(null);
    loadAccounts();
  };

  // ──────────────────────────────────────────────
  // Bulk symbol/voted update — backend only
  // ──────────────────────────────────────────────
  const handleBulkSettingsApply = async () => {
    setIsBulkUpdating(true);
    try {
      const res = await base44.functions.invoke('chreosiAccountActions', {
        session_token: sessionToken,
        action: 'bulk_settings',
        accountIds: selectedIds,
        data: {
          allowed_prediction_symbols: bulkSymbols,
          allowed_voted_statuses: bulkVoted,
        },
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Bulk update failed');
      const { updated, failed } = res.data;
      setBulkSymbolDialog(false);
      setSelectedIds([]);
      setAllFilteredIds(null);
      loadAccounts();
      if (failed?.length > 0) toast.warning(`Ολοκληρώθηκε με σφάλματα: ${failed.length}`);
      else toast.success(`Ενημερώθηκαν ${updated} λογαριασμοί`);
    } catch (err) {
      toast.error(err.message || 'Σφάλμα');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // ──────────────────────────────────────────────
  // SMS send
  // ──────────────────────────────────────────────
  const handleSendSms = async () => {
    const { username } = smsDialog;
    const usernames = username ? [username] : selectedAccounts.map(a => a.username);
    if (!usernames.length) { toast.error('Επίλεξε τουλάχιστον 1 λογαριασμό'); return; }
    setSmsSending(true); setSmsResult(null);
    const resp = await base44.functions.invoke('sendChreosiCredentialsSms', {
      session_token: sessionToken,
      mode: 'selected', usernames, onlyActive: true,
      title: smsTitle, portalUrl: smsPortalUrl, template: smsTemplate,
      includeTitleLine: smsIncludeTitleLine, throttleMs: 150,
    });
    setSmsResult(resp.data);
    if (resp.data?.ok) toast.success(`SMS: ${resp.data.sent} εστάλησαν`);
    else toast.error(resp.data?.error || 'Αποτυχία');
    setSmsSending(false);
  };

  // ──────────────────────────────────────────────
  // Print: load people via backend (no client-side Person loading)
  // ──────────────────────────────────────────────
  const handleOpenPrint = async () => {
    setLoadingPrint(true);
    try {
      const res = await base44.functions.invoke('chreosiPrintData', {
        session_token: sessionToken,
        accountIds: selectedIds,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Failed to load print data');
      setPrintAccounts(res.data.accounts || []);
      setPrintPeople(res.data.people || []);
      setPrintDialog(true);
    } catch (err) {
      toast.error('Αποτυχία φόρτωσης δεδομένων εκτύπωσης');
    } finally {
      setLoadingPrint(false);
    }
  };

  // ──────────────────────────────────────────────
  // Duplicates
  // ──────────────────────────────────────────────
  const handleCheckDuplicates = async () => {
    try {
      const res = await base44.functions.invoke('chreosiAnalyze', { session_token: sessionToken });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error);
      if (!d.hasDuplicates) { toast.success('Δεν βρέθηκαν διπλά'); return; }
      setDuplicateGroups(d.duplicateGroups || []);
      setDuplicatesDialog(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const noRecordsWarning = (arr, voted) => arr.length === 0 || voted.length === 0;

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Χρεωστικοί"
        subtitle={`${total} λογαριασμοί`}
        icon={UserPlus}
        actions={
          <div className="flex flex-wrap gap-2">
            {selectedIds.length > 0 && (
              <Button variant="outline" onClick={() => { setSmsResult(null); setSmsDialog({ open: true, username: null }); }}>
                <MessageSquare className="h-4 w-4 mr-2" />
                SMS ({selectedIds.length})
              </Button>
            )}
            <Button variant="outline" onClick={handleCheckDuplicates}>
              <GitMerge className="h-4 w-4 mr-2" />
              Διπλά
            </Button>
            <Button onClick={() => setCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Δημιουργία
            </Button>
          </div>
        }
      />

      {/* Search + bulk bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Αναζήτηση..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <span className="text-sm text-slate-600 dark:text-slate-300">{selectedIds.length} επιλεγμένα</span>
            {/* Select all across pages */}
            {total > PAGE_SIZE && (
              <Button variant="outline" size="sm" onClick={handleSelectAllFiltered} disabled={loadingAllIds}>
                {loadingAllIds
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <CheckSquare className="h-4 w-4 mr-2" />}
                {allFilteredSelected ? 'Αποεπιλογή Όλων' : `Επιλογή Όλων (${total})`}
              </Button>
            )}
            {selectedIds.length === 1 && (
              <Button variant="outline" size="sm" onClick={() => handleEdit(rows.find(r => r.id === selectedIds[0]) || { id: selectedIds[0] })}>
                <Pencil className="h-4 w-4 mr-2" />Επεξεργασία
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleOpenPrint} disabled={loadingPrint}>
              {loadingPrint ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
              Εκτύπωση
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkActivate(true)}>
              <UserCheck className="h-4 w-4 mr-2" />Ενεργ.
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkActivate(false)}>
              <UserX className="h-4 w-4 mr-2" />Απενεργ.
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkSymbols([]); setBulkVoted([]); setBulkSymbolDialog(true); }}>
              <Pencil className="h-4 w-4 mr-2" />Ρυθμίσεις
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Διαγραφή
            </Button>
          </div>
        )}
        {selectedIds.length === 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">{total} εγγραφές</span>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-950 dark:border-slate-700">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900">
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </TableHead>
                {[
                  { key: 'username', label: 'Όνομα Χρήστη' },
                  { key: 'plain_password', label: 'Κωδικός' },
                  { key: 'display_name', label: 'Εμφανιζόμενο Όνομα' },
                  { key: 'phone', label: 'Τηλέφωνο' },
                  { key: 'allowed_prediction_symbols', label: 'Σύμβολα', sortable: false },
                  { key: 'allowed_voted_statuses', label: 'Ψήφος', sortable: false },
                  { key: 'is_active', label: 'Κατάσταση' },
                ].map(col => (
                  <TableHead
                    key={col.key}
                    className={`font-semibold text-slate-700 dark:text-slate-200 ${col.sortable !== false ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none' : ''}`}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      {col.sortable !== false && <SortIcon col={col.key} />}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-16">Ενέργ.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500 dark:text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500 dark:text-slate-400">Δεν βρέθηκαν εγγραφές</TableCell></TableRow>
              ) : (
                rows.map(row => {
                  const selected = selectedSet.has(row.id);
                  const noVis = (!row.allowed_prediction_symbols?.length || !row.allowed_voted_statuses?.length);
                  return (
                    <TableRow key={row.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800 ${selected ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={e => {
                            if (e.target.checked) setSelectedIds(p => [...p, row.id]);
                            else setSelectedIds(p => p.filter(id => id !== row.id));
                          }}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-1">
                          {row.username}
                          {noVis && <span title="Δεν βλέπει εγγραφές" className="text-amber-500 text-xs">⚠</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{row.plain_password || '—'}</span>
                          {row.plain_password && (
                            <button className="text-slate-400 hover:text-slate-600" onClick={() => { navigator.clipboard.writeText(row.plain_password); toast.success('Αντιγράφηκε'); }}>
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.display_name || '—'}</TableCell>
                      <TableCell className="text-sm">{row.phone || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.allowed_prediction_symbols?.length > 0
                            ? row.allowed_prediction_symbols.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)
                            : <span className="text-xs text-red-400">Κανένα</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.allowed_voted_statuses?.length > 0
                            ? row.allowed_voted_statuses.map(v => <Badge key={v} variant="outline" className="text-xs">{v === 'false' ? 'Δεν Ψήφ.' : 'Ψήφ.'}</Badge>)
                            : <span className="text-xs text-red-400">Κανένα</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? 'default' : 'secondary'} className={row.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                          {row.is_active ? 'Ενεργός' : 'Ανενεργός'}
                        </Badge>
                      </TableCell>
                      <TableCell className="relative overflow-visible" onClick={e => e.stopPropagation()}>
                        <RowActionsMenu
                          row={row}
                          onEdit={handleEdit}
                          onResetPassword={handleResetPassword}
                          onDelete={handleDelete}
                          onSendSms={(r) => { setSmsResult(null); setSmsDialog({ open: true, username: r.username }); }}
                          onMobileOpen={setMobileActionRow}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Σελίδα {page + 1} από {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Mobile action sheet ── */}
      <MobileActionSheet
        row={mobileActionRow}
        open={!!mobileActionRow}
        onClose={() => setMobileActionRow(null)}
        onEdit={handleEdit}
        onResetPassword={handleResetPassword}
        onDelete={handleDelete}
        onSendSms={(r) => { setSmsResult(null); setSmsDialog({ open: true, username: r.username }); }}
      />

      {/* ── Dialogs ── */}

      {/* Create */}
      <ChreosiCreateDialog
        open={createDialog}
        onClose={() => setCreateDialog(false)}
        onDone={() => { setCreateDialog(false); loadAccounts(); }}
        sessionToken={sessionToken}
      />

      {/* Duplicates */}
      <ChreosiDuplicatesDialog
        open={duplicatesDialog}
        onClose={() => setDuplicatesDialog(false)}
        duplicateGroups={duplicateGroups}
        sessionToken={sessionToken}
        onDone={() => { setDuplicatesDialog(false); loadAccounts(); }}
      />

      {/* Delete confirm */}
      <Dialog open={deleteDialog.open} onOpenChange={o => !o && setDeleteDialog({ open: false, ids: [], label: '' })}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
              <DialogTitle>Επιβεβαίωση Διαγραφής</DialogTitle>
            </div>
            <DialogDescription>
              Διαγραφή: <strong>{deleteDialog.label}</strong>
              <br /><span className="text-red-600 font-medium">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, ids: [], label: '' })}>Ακύρωση</Button>
            <Button variant="destructive" onClick={confirmDelete}><Trash2 className="h-4 w-4 mr-2" />Διαγραφή</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk settings */}
      <Dialog open={bulkSymbolDialog} onOpenChange={setBulkSymbolDialog}>
        <DialogContent className="flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Ρυθμίσεις σε {selectedIds.length} Χρήστες</DialogTitle>
            <DialogDescription>Θα αντικαταστήσουν τις τρέχουσες ρυθμίσεις</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 py-2">
            <div>
              <Label className="text-sm font-medium mb-2 block">Σύμβολα Πρόβλεψης</Label>
              <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                {availableSymbols.map(symbol => (
                  <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded">
                    <input type="checkbox" checked={bulkSymbols.includes(symbol)} onChange={e => setBulkSymbols(e.target.checked ? [...bulkSymbols, symbol] : bulkSymbols.filter(s => s !== symbol))} />
                    <span className="text-sm">{symbol}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Κατάσταση Ψήφου</Label>
              <div className="flex gap-3">
                {VOTED_STATUS_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <input type="checkbox" checked={bulkVoted.includes(opt.value)} onChange={e => setBulkVoted(e.target.checked ? [...bulkVoted, opt.value] : bulkVoted.filter(v => v !== opt.value))} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {noRecordsWarning(bulkSymbols, bulkVoted) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Ο χρήστης δεν θα βλέπει καμία εγγραφή.</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSymbolDialog(false)}>Ακύρωση</Button>
            <Button disabled={isBulkUpdating} onClick={handleBulkSettingsApply}>
              {isBulkUpdating ? 'Αποθήκευση...' : 'Εφαρμογή'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialog.open} onOpenChange={o => !o && setEditDialog({ open: false, account: null })}>
        <DialogContent className="flex flex-col max-h-[90vh]">
          <DialogHeader><DialogTitle>Επεξεργασία Λογαριασμού</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <div className="space-y-2"><Label>Όνομα Χρήστη</Label><Input value={formData.username || ''} disabled /></div>
            <div className="space-y-2"><Label>Εμφανιζόμενο Όνομα</Label><Input value={formData.display_name || ''} onChange={e => setFormData({...formData, display_name: e.target.value})} /></div>
            <div className="space-y-2"><Label>Τηλέφωνο</Label><Input value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
            <div className="flex items-center gap-3"><Switch checked={formData.is_active || false} onCheckedChange={v => setFormData({...formData, is_active: v})} /><Label>Ενεργός</Label></div>
            <div className="space-y-2">
              <Label>Σύμβολα Πρόβλεψης</Label>
              <div className="border dark:border-slate-700 rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                {availableSymbols.map(symbol => {
                  const sel = (formData.allowed_prediction_symbols || []).includes(symbol);
                  return (
                    <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded">
                      <input type="checkbox" checked={sel} onChange={e => {
                        const cur = formData.allowed_prediction_symbols || [];
                        setFormData({...formData, allowed_prediction_symbols: e.target.checked ? [...cur, symbol] : cur.filter(s => s !== symbol)});
                      }} className="rounded" />
                      <span className="text-sm">{symbol}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Κατάσταση Ψήφου</Label>
              <div className="flex gap-3">
                {VOTED_STATUS_OPTIONS.map(opt => {
                  const sel = (formData.allowed_voted_statuses || []).includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                      <input type="checkbox" checked={sel} onChange={e => {
                        const cur = formData.allowed_voted_statuses || [];
                        setFormData({...formData, allowed_voted_statuses: e.target.checked ? [...cur, opt.value] : cur.filter(v => v !== opt.value)});
                      }} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              {noRecordsWarning(formData.allowed_prediction_symbols || [], formData.allowed_voted_statuses || []) && (
                <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Ο χρήστης δεν θα βλέπει καμία εγγραφή.</AlertDescription></Alert>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ορατά Πεδία στο Portal</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setFormData({ ...formData, visible_fields: PERSON_FIELDS.map(f => f.key) })}
                  >Όλα</button>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:underline"
                    onClick={() => setFormData({ ...formData, visible_fields: [] })}
                  >Κανένα</button>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Επιλέξτε ποια πεδία της ζωντανής καρτέλας θα βλέπει ο χρήστης. Αν δεν επιλεγεί κανένα, ισχύει η προεπιλογή. Επεξεργάσιμο παραμένει μόνο το πεδίο «Σημειώσεις».
              </p>
              <div className="border dark:border-slate-700 rounded-md p-3 grid grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto">
                {PERSON_FIELDS.map(f => {
                  const sel = (formData.visible_fields || []).includes(f.key);
                  return (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={e => {
                          const cur = formData.visible_fields || [];
                          setFormData({ ...formData, visible_fields: e.target.checked ? [...cur, f.key] : cur.filter(k => k !== f.key) });
                        }}
                        className="rounded"
                      />
                      <span className="text-sm truncate" title={f.label}>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2"><Label>Προσωπικές Σημειώσεις</Label><Textarea value={formData.personal_note || ''} onChange={e => setFormData({...formData, personal_note: e.target.value})} rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, account: null })}>Ακύρωση</Button>
            <Button onClick={handleSaveEdit}>Αποθήκευση</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={smsDialog.open} onOpenChange={o => !o && setSmsDialog({ open: false, username: null })}>
        <DialogContent className="max-w-xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Αποστολή SMS</DialogTitle>
            <DialogDescription>
              {smsDialog.username ? `Αποστολή σε: ${smsDialog.username}` : `Αποστολή σε ${selectedIds.length} επιλεγμένους`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 py-2">
            <div className="space-y-1"><Label>Τίτλος</Label><Input value={smsTitle} onChange={e => setSmsTitle(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={smsIncludeTitleLine} onCheckedChange={setSmsIncludeTitleLine} /><Label>Βάλε τίτλο στο SMS</Label></div>
            <div className="space-y-1"><Label>Portal URL</Label><Input value={smsPortalUrl} onChange={e => setSmsPortalUrl(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Template <span className="text-xs text-slate-400">(&#123;USERNAME&#125; &#123;PASSWORD&#125; &#123;PORTAL_URL&#125; &#123;NAME&#125;)</span></Label>
              <Textarea value={smsTemplate} onChange={e => setSmsTemplate(e.target.value)} rows={4} className="font-mono text-sm" />
            </div>
            {smsResult && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex gap-4">
                  <span className="text-green-600">✓ {smsResult.sent}</span>
                  <span className="text-red-600">✗ {smsResult.failed}</span>
                  <span className="text-amber-600">⊘ {smsResult.skipped}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDialog({ open: false, username: null })}>Κλείσιμο</Button>
            <Button onClick={handleSendSms} disabled={smsSending}>
              {smsSending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Αποστολή...</> : <><Send className="h-4 w-4 mr-2" />Αποστολή</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print */}
      <ChreosiPrintDialog
        open={printDialog}
        onClose={() => setPrintDialog(false)}
        accounts={printAccounts}
        people={printPeople}
      />
    </div>
  );
}