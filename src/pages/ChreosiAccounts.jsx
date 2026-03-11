import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserPlus,
  MoreHorizontal,
  Pencil,
  Key,
  UserX,
  UserCheck,
  Download,
  Copy,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  MessageSquare,
  Send,
  RefreshCw,
  Printer
} from 'lucide-react';
import { toast } from 'sonner';

function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function normalizeUsername(str) {
  return str?.trim().replace(/\s+/g, ' ') || '';
}

export default function ChreosiAccounts() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState({ open: false, account: null });
  const [createDialog, setCreateDialog] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [formData, setFormData] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, ids: [], single: false, username: '' });
  const [bulkSymbolDialog, setBulkSymbolDialog] = useState(false);
  const [bulkSymbols, setBulkSymbols] = useState([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [smsDialog, setSmsDialog] = useState({ open: false, mode: 'selected', username: null });
  const [smsTitle, setSmsTitle] = useState("Στοιχεία πρόσβασης");
  const [smsPortalUrl, setSmsPortalUrl] = useState("https://votecontrol.info/PortalLogin");
  const [smsTemplate, setSmsTemplate] = useState("Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}");
  const [smsIncludeTitleLine, setSmsIncludeTitleLine] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [smsSearch, setSmsSearch] = useState("");
  const [printDialog, setPrintDialog] = useState(false);
  const [printColumns, setPrintColumns] = useState(['department','admission_year','last_name','first_name','mobile_phone','notes']);
  const [isPrinting, setIsPrinting] = useState(false);

  const PRINT_COLUMN_OPTIONS = [
    { key: 'department', label: 'Τμήμα' },
    { key: 'admission_year', label: 'Έτος Εισδοχής' },
    { key: 'last_name', label: 'Επίθετο' },
    { key: 'first_name', label: 'Όνομα' },
    { key: 'mobile_phone', label: 'Κινητό' },
    { key: 'notes', label: 'Σημειώσεις' },
  ];

  const handlePrint = async () => {
    const account = accounts.find(a => a.id === selectedIds[0]);
    if (!account || printColumns.length === 0) return;
    setIsPrinting(true);
    try {
      const response = await base44.functions.invoke('generateChreosiStatementPDF', {
        accountId: account.id,
        selectedColumns: printColumns
      });
      // response.data is arraybuffer when content-type is application/pdf
      // but axios returns it as... let's fetch directly
      const resp = await fetch(`/api/functions/generateChreosiStatementPDF`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('app_session_token')}` },
        body: JSON.stringify({ accountId: account.id, selectedColumns: printColumns })
      });
      if (!resp.ok) throw new Error('Σφάλμα δημιουργίας PDF');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chreosi_${account.username}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPrintDialog(false);
      toast.success('Το PDF δημιουργήθηκε επιτυχώς');
    } catch (e) {
      toast.error(e.message || 'Σφάλμα εκτύπωσης');
    }
    setIsPrinting(false);
  };

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;

      while (hasMore) {
        const batch = await base44.entities.ChreosiAccount.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;

      while (hasMore) {
        const batch = await base44.entities.Person.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const availableSymbols = React.useMemo(() => {
    const symbols = new Set(people.map(p => p.prediction_symbol).filter(Boolean));
    return [...symbols].sort();
  }, [people]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ChreosiAccount.create(data),
    onSuccess: () => queryClient.invalidateQueries(['chreosi-accounts'])
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChreosiAccount.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['chreosi-accounts']);
      setEditDialog({ open: false, account: null });
      toast.success('Ο λογαριασμός ενημερώθηκε');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ChreosiAccount.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['chreosi-accounts']);
      setSelectedIds([]);
      toast.success('Ο λογαριασμός διαγράφηκε');
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.ChreosiAccount.delete(id);
        await new Promise(r => setTimeout(r, 150));
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries(['chreosi-accounts']);
      setSelectedIds([]);
      toast.success(`Διαγράφηκαν ${ids.length} λογαριασμοί`);
    }
  });

  const bulkActivateMutation = useMutation({
    mutationFn: async ({ ids, active }) => {
      for (const id of ids) {
        const account = accounts.find(a => a.id === id);
        await base44.entities.ChreosiAccount.update(id, { ...account, is_active: active });
        await new Promise(r => setTimeout(r, 150));
      }
    },
    onSuccess: (_, { ids, active }) => {
      queryClient.invalidateQueries(['chreosi-accounts']);
      setSelectedIds([]);
      toast.success(`${ids.length} λογαριασμοί ${active ? 'ενεργοποιήθηκαν' : 'απενεργοποιήθηκαν'}`);
    }
  });

  // SMS popup helpers
  const smsNormalize = (s) => (s || "").toString().trim().toLowerCase();

  const visibleSmsAccounts = React.useMemo(() => {
    const q = smsNormalize(smsSearch);
    if (!q) return accounts;
    return accounts.filter(a =>
      smsNormalize(a.username).includes(q) ||
      smsNormalize(a.display_name).includes(q) ||
      smsNormalize(a.phone).includes(q)
    );
  }, [accounts, smsSearch]);

  const selectedSet = new Set(selectedIds);
  const selectedAccounts = accounts.filter(a => selectedSet.has(a.id));
  const smsNoPhoneCount = selectedAccounts.filter(a => !(a.phone || "").trim()).length;

  const toggleSmsOne = (id, checked) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (checked) s.add(id); else s.delete(id);
      return Array.from(s);
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      visibleSmsAccounts.forEach(a => s.add(a.id));
      return Array.from(s);
    });
  };

  const clearVisible = () => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      visibleSmsAccounts.forEach(a => s.delete(a.id));
      return Array.from(s);
    });
  };

  const getSelectedUsernames = () => {
    return [...new Set(
      selectedAccounts.map(a => (a.username || '').trim().replace(/\s+/g, ' ')).filter(Boolean)
    )];
  };

  const handleSendSms = async () => {
    const { mode, username } = smsDialog;
    if (mode === 'selected' && selectedIds.length === 0 && !username) {
      toast.error("Επίλεξε τουλάχιστον 1 Χρεωστικό ή βάλε 'Όλοι οι ενεργοί'.");
      return;
    }

    setSmsSending(true);
    setSmsResult(null);

    const usernames = username ? [username] : getSelectedUsernames();

    const payload = {
      mode: mode === 'all_active' ? 'all_active' : 'selected',
      usernames,
      onlyActive: true,
      title: smsTitle,
      portalUrl: smsPortalUrl,
      template: smsTemplate,
      includeTitleLine: smsIncludeTitleLine,
      throttleMs: 150,
    };

    const resp = await base44.functions.invoke("sendChreosiCredentialsSms", payload);
    const data = resp.data;
    setSmsResult(data);

    if (data?.ok) {
      toast.success(`SMS: ${data.sent} εστάλησαν, ${data.failed} απέτυχαν, ${data.skipped} παραλείφθηκαν`);
      queryClient.invalidateQueries(['chreosi-accounts']);
    } else {
      toast.error(data?.error || "Αποτυχία αποστολής");
    }
    setSmsSending(false);
  };

  const handleCreateAccounts = async () => {
    // Get unique contact persons
    const contactPersons = new Set();
    people.forEach(p => {
      if (p.contact_person_1) contactPersons.add(normalizeUsername(p.contact_person_1));
      if (p.contact_person_2) contactPersons.add(normalizeUsername(p.contact_person_2));
    });

    // Filter out existing usernames
    const existingUsernames = new Set(accounts.map(a => normalizeUsername(a.username)));
    const newUsernames = [...contactPersons].filter(u => u && !existingUsernames.has(u));

    if (newUsernames.length === 0) {
      toast.info('Δεν βρέθηκαν νέα άτομα για δημιουργία λογαριασμών');
      return;
    }

    const newAccounts = [];
    for (const username of newUsernames) {
      const password = generatePassword();
      await createMutation.mutateAsync({
        username,
        password_hash: password,
        display_name: username,
        is_active: true
      });
      newAccounts.push({ username, password });
      await new Promise(r => setTimeout(r, 600));
    }

    setCreatedAccounts(newAccounts);
    toast.success(`Δημιουργήθηκαν ${newAccounts.length} νέοι λογαριασμοί`);
  };

  const handleExportCreated = () => {
    const csv = '\uFEFF' + 'Όνομα Χρήστη,Κωδικός\n' + 
      createdAccounts.map(a => `"${a.username}","${a.password}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `χρεωστικοί_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const copyCredentials = () => {
    const text = createdAccounts.map(a => `${a.username}: ${a.password}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Αντιγράφηκαν στο πρόχειρο');
  };

  const columns = [
    { key: 'username', label: 'Όνομα Χρήστη' },
    { key: 'password_hash', label: 'Κωδικός', render: (val) => (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{val || '-'}</span>
        {val && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(val);
              toast.success('Αντιγράφηκε');
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    )},
    { key: 'display_name', label: 'Εμφανιζόμενο Όνομα' },
    { key: 'phone', label: 'Τηλέφωνο' },
    { key: 'allowed_prediction_symbols', label: 'Σύμβολα', render: (val) => (
      <div className="flex flex-wrap gap-1">
        {(val && val.length > 0) ? val.map(s => (
          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
        )) : <span className="text-xs text-slate-400">Όλα</span>}
      </div>
    )},
    { key: 'personal_note', label: 'Προσωπικές Σημειώσεις', render: (val) => (
      <span className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 max-w-xs">
        {val || <span className="italic text-slate-400 dark:text-slate-500">—</span>}
      </span>
    )},
    { key: 'is_active', label: 'Κατάσταση', render: (val) => (
      <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'dark:bg-slate-700 dark:text-slate-300'}>
        {val ? 'Ενεργός' : 'Ανενεργός'}
      </Badge>
    )}
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Χρεωστικοί"
        subtitle={`${accounts.length} λογαριασμοί`}
        icon={UserPlus}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setSmsResult(null); setSmsDialog({ open: true, mode: 'selected', username: null }); }}
              disabled={selectedIds.length === 0}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              SMS ({selectedIds.length})
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSmsResult(null); setSmsDialog({ open: true, mode: 'all_active', username: null }); }}
            >
              <Send className="h-4 w-4 mr-2" />
              SMS σε όλους
            </Button>
            <Button onClick={() => setCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Δημιουργία Χρεωστικών
            </Button>
          </div>
        }
      />

      <DataGrid
        data={accounts}
        columns={columns}
        pageSize={20}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={
          <>
            {selectedIds.length === 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const account = accounts.find(a => a.id === selectedIds[0]);
                    if (account) {
                      setFormData({ ...account });
                      setEditDialog({ open: true, account });
                    }
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Επεξεργασία
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintDialog(true)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Εκτύπωση
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkActivateMutation.mutate({ ids: selectedIds, active: true })}
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Ενεργοποίηση
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkActivateMutation.mutate({ ids: selectedIds, active: false })}
            >
              <UserX className="h-4 w-4 mr-2" />
              Απενεργοποίηση
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setBulkSymbols([]); setBulkSymbolDialog(true); }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Ορισμός Συμβόλων
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialog({ open: true, ids: selectedIds, single: false, username: '' })}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Διαγραφή
            </Button>
          </>
        }

      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, ids: [], single: false, username: '' })}>
        <DialogContent className="flex flex-col max-h-[95vh]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <DialogTitle className="text-xl">Επιβεβαίωση Διαγραφής</DialogTitle>
            </div>
            <DialogDescription className="text-base pt-2">
              {deleteDialog.single ? (
                <>
                  Είστε σίγουροι ότι θέλετε να διαγράψετε τον λογαριασμό <strong>{deleteDialog.username}</strong>;
                </>
              ) : (
                deleteDialog.ids.length === 1 
                  ? 'Είστε σίγουροι ότι θέλετε να διαγράψετε 1 λογαριασμό;'
                  : `Είστε σίγουροι ότι θέλετε να διαγράψετε ${deleteDialog.ids.length} λογαριασμούς;`
              )}
              <br />
              <span className="text-red-600 font-medium">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, ids: [], single: false, username: '' })}
            >
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog.single) {
                  deleteMutation.mutate(deleteDialog.ids[0]);
                } else {
                  bulkDeleteMutation.mutate(deleteDialog.ids);
                }
                setDeleteDialog({ open: false, ids: [], single: false, username: '' });
              }}
              disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Διαγραφή
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Accounts Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="flex flex-col max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Δημιουργία Χρεωστικών</DialogTitle>
            <DialogDescription>
              Θα δημιουργηθούν λογαριασμοί για όλα τα μοναδικά άτομα επικοινωνίας που δεν έχουν ήδη λογαριασμό.
            </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1">
            {createdAccounts.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Δημιουργήθηκαν {createdAccounts.length} λογαριασμοί!</span>
              </div>
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Διαπιστευτήρια</CardTitle>
                </CardHeader>
                <CardContent className="max-h-60 overflow-y-auto">
                  <div className="space-y-2 text-sm font-mono">
                    {createdAccounts.map((a, i) => (
                      <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800 rounded flex justify-between">
                        <span>{a.username}</span>
                        <span className="text-slate-500">{a.password}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <Button variant="outline" onClick={copyCredentials}>
                  <Copy className="h-4 w-4 mr-2" />
                  Αντιγραφή
                </Button>
                <Button variant="outline" onClick={handleExportCreated}>
                  <Download className="h-4 w-4 mr-2" />
                  Εξαγωγή CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-slate-600 mb-4">
                Βρέθηκαν {new Set([...people.flatMap(p => 
                  [p.contact_person_1, p.contact_person_2].filter(Boolean).map(normalizeUsername)
                )]).size} μοναδικά άτομα επικοινωνίας.
              </p>
              <p className="text-slate-500 text-sm">
                {accounts.length} λογαριασμοί υπάρχουν ήδη.
              </p>
            </div>
            )}
            </div>

            <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDialog(false);
              setCreatedAccounts([]);
            }}>
              Κλείσιμο
            </Button>
            {createdAccounts.length === 0 && (
              <Button onClick={handleCreateAccounts} disabled={createMutation.isPending}>
                Δημιουργία
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Symbol Assignment Dialog */}
      <Dialog open={bulkSymbolDialog} onOpenChange={setBulkSymbolDialog}>
        <DialogContent className="flex flex-col max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Ορισμός Συμβόλων σε {selectedIds.length} Χρήστες</DialogTitle>
            <DialogDescription>
              Επιλέξτε τα σύμβολα που θα ανατεθούν σε όλους τους επιλεγμένους χρήστες.
            </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 overflow-y-auto flex-1">
            <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
              {availableSymbols.length === 0 ? (
                <p className="text-sm text-slate-500">Δεν βρέθηκαν σύμβολα</p>
              ) : (
                availableSymbols.map(symbol => {
                  const selected = bulkSymbols.includes(symbol);
                  return (
                    <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          setBulkSymbols(e.target.checked
                            ? [...bulkSymbols, symbol]
                            : bulkSymbols.filter(s => s !== symbol));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">{symbol}</span>
                    </label>
                  );
                })
              )}
            </div>
            {bulkSymbols.length === 0 && (
              <p className="text-xs text-amber-600">⚠️ Κανένα σύμβολο — οι χρήστες θα βλέπουν όλες τις εγγραφές.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSymbolDialog(false)}>Ακύρωση</Button>
            <Button
              disabled={isBulkUpdating}
              onClick={async () => {
                if (selectedIds.length === 0) return;
                setIsBulkUpdating(true);
                try {
                  let start = 0;
                  let totalUpdated = 0;
                  let allFailed = [];

                  while (start < selectedIds.length) {
                    const resp = await base44.functions.invoke('bulkUpdateChreosiSymbols', {
                      accountIds: selectedIds,
                      symbolsToAssign: bulkSymbols,
                      start,
                      max: 80,
                      delayMs: 350
                    });

                    if (!resp?.data?.ok) {
                      throw new Error(resp?.data?.error || 'Bulk update failed');
                    }

                    totalUpdated += resp.data.updated || 0;
                    if (resp.data.failed?.length) allFailed = allFailed.concat(resp.data.failed);
                    start = resp.data.nextStart ?? selectedIds.length;
                  }

                  queryClient.invalidateQueries(['chreosi-accounts']);
                  setBulkSymbolDialog(false);
                  setSelectedIds([]);

                  if (allFailed.length > 0) {
                    toast.warning(`Ολοκληρώθηκε με σφάλματα: ${allFailed.length} λογαριασμοί δεν ενημερώθηκαν`);
                  } else {
                    toast.success(`Ενημερώθηκαν ${totalUpdated} λογαριασμοί`);
                  }
                } catch (e) {
                  toast.error(e?.message || 'Σφάλμα στην ομαδική ενημέρωση');
                } finally {
                  setIsBulkUpdating(false);
                }
              }}
            >
              {isBulkUpdating ? 'Αποθήκευση...' : 'Εφαρμογή'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Credentials Dialog */}
      <Dialog open={smsDialog.open} onOpenChange={(open) => { if (!open) { setSmsDialog({ open: false, mode: 'selected', username: null }); setSmsSearch(""); } }}>
        <DialogContent className="max-w-2xl max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Αποστολή SMS Credentials</DialogTitle>
            <DialogDescription>
              {smsDialog.username
                ? `Αποστολή σε: ${smsDialog.username}`
                : smsDialog.mode === 'all_active'
                  ? 'Αποστολή σε όλους τους ενεργούς χρήστες'
                  : `Αποστολή σε ${selectedIds.length} επιλεγμένους χρήστες`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 overflow-y-auto flex-1">
            {/* Audience info */}
            {!smsDialog.username && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-800 dark:border-slate-700 border px-3 py-2 text-sm flex gap-4">
                {smsDialog.mode === 'all_active' ? (
                  <span className="text-slate-700">Κοινό: <strong>Όλοι οι ενεργοί</strong></span>
                ) : (
                  <>
                    <span className="text-slate-700">Επιλεγμένοι: <strong>{selectedIds.length}</strong></span>
                    <span className="text-amber-600">
                      Χωρίς τηλ.: <strong>
                        {accounts.filter(a => selectedIds.includes(a.id) && !a.phone).length}
                      </strong> (θα παραλειφθούν)
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Τίτλος (UI/Logs)</Label>
              <Input value={smsTitle} onChange={(e) => setSmsTitle(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={smsIncludeTitleLine} onCheckedChange={setSmsIncludeTitleLine} id="include-title" />
              <Label htmlFor="include-title" className="cursor-pointer">Βάλε τον τίτλο ως 1η γραμμή στο SMS</Label>
            </div>
            <div className="space-y-1">
              <Label>Portal Login URL</Label>
              <Input value={smsPortalUrl} onChange={(e) => setSmsPortalUrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Template <span className="text-xs text-slate-400">({"{USERNAME} {PASSWORD} {PORTAL_URL} {NAME}"})</span></Label>
              <Textarea
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">Το SMS θα περιέχει τον ήδη υπάρχοντα κωδικό του χρήστη (δεν γίνεται αλλαγή κωδικού).</p>
            </div>

            {/* Account selection (shown when not single-user mode) */}
            {!smsDialog.username && smsDialog.mode === 'selected' && (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Επιλογή Χρεωστικών</p>
                    <p className="text-xs text-slate-500">
                      Επιλεγμένοι: <b>{selectedIds.length}</b> • Χωρίς τηλέφωνο: <b>{smsNoPhoneCount}</b> (θα γίνουν skipped)
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>Επιλογή όλων</Button>
                    <Button type="button" variant="outline" size="sm" onClick={clearVisible}>Καθαρισμός</Button>
                  </div>
                </div>
                <Input
                  placeholder="Αναζήτηση (username / όνομα / τηλέφωνο)"
                  value={smsSearch}
                  onChange={(e) => setSmsSearch(e.target.value)}
                />
                <div className="max-h-56 overflow-auto border dark:border-slate-700 rounded p-1 space-y-0.5">
                  {visibleSmsAccounts.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400 p-2">Δεν βρέθηκαν χρήστες.</div>
                  ) : (
                    visibleSmsAccounts.map((a) => {
                      const checked = selectedSet.has(a.id);
                      const hasPhone = !!(a.phone || "").trim();
                      return (
                        <label key={a.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleSmsOne(a.id, e.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">{a.username}</span>
                              {!a.is_active && <span className="text-xs text-red-500">(inactive)</span>}
                              {!hasPhone && <span className="text-xs text-amber-500">(no phone)</span>}
                            </div>
                            <div className="text-xs text-slate-400 truncate">{a.display_name || '—'} • {a.phone || '—'}</div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-slate-400">Χρήστες χωρίς τηλέφωνο δεν θα λάβουν SMS (skipped).</p>
              </div>
            )}

            {smsResult && (
              <div className="rounded-lg border dark:border-slate-700 p-3 text-sm space-y-1">
                <div className="flex gap-4 font-medium">
                  <span className="text-green-600">✓ Εστάλησαν: {smsResult.sent}</span>
                  <span className="text-red-600">✗ Απέτυχαν: {smsResult.failed}</span>
                  <span className="text-amber-600">⊘ Παραλείφθηκαν: {smsResult.skipped}</span>
                </div>
                {smsResult.results?.filter(r => r.status !== 'sent').map((r, i) => (
                  <div key={i} className="text-xs text-slate-500">{r.username}: {r.error || r.reason}</div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDialog({ open: false, mode: 'selected', username: null })}>
              Κλείσιμο
            </Button>
            <Button onClick={handleSendSms} disabled={smsSending}>
              {smsSending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Αποστολή...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Αποστολή SMS</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={printDialog} onOpenChange={setPrintDialog}>
        <DialogContent className="flex flex-col max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Εκτύπωση Χρεωστικού</DialogTitle>
            <DialogDescription>
              Επιλέξτε τις στήλες που θέλετε να συμπεριληφθούν στην εκτύπωση.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 overflow-y-auto flex-1">
            {PRINT_COLUMN_OPTIONS.map(col => (
              <label key={col.key} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg">
                <input
                  type="checkbox"
                  checked={printColumns.includes(col.key)}
                  onChange={(e) => {
                    setPrintColumns(prev =>
                      e.target.checked ? [...prev, col.key] : prev.filter(c => c !== col.key)
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm font-medium">{col.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialog(false)}>Ακύρωση</Button>
            <Button
              onClick={handlePrint}
              disabled={isPrinting || printColumns.length === 0}
            >
              {isPrinting ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Δημιουργία...</>
              ) : (
                <><Printer className="h-4 w-4 mr-2" />Εκτύπωση PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => {
        if (!open) setEditDialog({ open: false, account: null });
      }}>
        <DialogContent className="flex flex-col max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Επεξεργασία Λογαριασμού</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label>Όνομα Χρήστη</Label>
              <Input value={formData.username || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Εμφανιζόμενο Όνομα</Label>
              <Input
                value={formData.display_name || ''}
                onChange={(e) => setFormData({...formData, display_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Τηλέφωνο</Label>
              <Input
                value={formData.phone || ''}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.is_active || false}
                onCheckedChange={(v) => setFormData({...formData, is_active: v})}
              />
              <Label>Ενεργός</Label>
            </div>
            <div className="space-y-2">
              <Label>Επιτρεπόμενα Σύμβολα Πρόβλεψης</Label>
              <div className="border dark:border-slate-700 rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                {availableSymbols.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Δεν βρέθηκαν σύμβολα</p>
                ) : (
                  availableSymbols.map(symbol => {
                    const selected = (formData.allowed_prediction_symbols || []).includes(symbol);
                    return (
                      <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = formData.allowed_prediction_symbols || [];
                            const updated = e.target.checked
                              ? [...current, symbol]
                              : current.filter(s => s !== symbol);
                            setFormData({...formData, allowed_prediction_symbols: updated});
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-medium">{symbol}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {(formData.allowed_prediction_symbols || []).length === 0 && (
                <p className="text-xs text-amber-600">⚠️ Κανένα σύμβολο δεν επιλέχθηκε — ο χρήστης θα βλέπει όλες τις εγγραφές.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Προσωπικές Σημειώσεις</Label>
              <Textarea
                value={formData.personal_note || ''}
                onChange={(e) => setFormData({...formData, personal_note: e.target.value})}
                rows={4}
                placeholder="Δεν υπάρχουν σημειώσεις..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, account: null })}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => updateMutation.mutate({ id: editDialog.account.id, data: formData })}
              disabled={updateMutation.isPending}
            >
              Αποθήκευση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}