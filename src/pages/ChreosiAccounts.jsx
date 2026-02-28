import React, { useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertTriangle
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
      await new Promise(r => setTimeout(r, 200));
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
    { key: 'is_active', label: 'Κατάσταση', render: (val) => (
      <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
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
          <Button onClick={() => setCreateDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Δημιουργία Χρεωστικών
          </Button>
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
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                setFormData({ ...row });
                setEditDialog({ open: true, account: row });
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Επεξεργασία
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                const newPassword = generatePassword();
                await updateMutation.mutateAsync({
                  id: row.id,
                  data: { ...row, password_hash: newPassword }
                });
                
                // Send notification
                await base44.entities.Notification.create({
                  recipient_type: 'chreosi',
                  recipient_username: row.username,
                  type: 'warning',
                  category: 'password_change',
                  title: 'Ο κωδικός σας άλλαξε',
                  message: `Ο κωδικός πρόσβασής σας επαναφέρθηκε. Νέος κωδικός: ${newPassword}`
                });
                
                toast.success(`Νέος κωδικός: ${newPassword}`);
                navigator.clipboard.writeText(newPassword);
              }}>
                <Key className="h-4 w-4 mr-2" />
                Επαναφορά Κωδικού
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                updateMutation.mutate({
                  id: row.id,
                  data: { ...row, is_active: !row.is_active }
                });
              }}>
                {row.is_active ? (
                  <><UserX className="h-4 w-4 mr-2" />Απενεργοποίηση</>
                ) : (
                  <><UserCheck className="h-4 w-4 mr-2" />Ενεργοποίηση</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setDeleteDialog({ open: true, ids: [row.id], single: true, username: row.username })}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, ids: [], single: false, username: '' })}>
        <DialogContent>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Δημιουργία Χρεωστικών</DialogTitle>
            <DialogDescription>
              Θα δημιουργηθούν λογαριασμοί για όλα τα μοναδικά άτομα επικοινωνίας που δεν έχουν ήδη λογαριασμό.
            </DialogDescription>
          </DialogHeader>
          
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
                      <div key={i} className="p-2 bg-slate-50 rounded flex justify-between">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ορισμός Συμβόλων σε {selectedIds.length} Χρήστες</DialogTitle>
            <DialogDescription>
              Επιλέξτε τα σύμβολα που θα ανατεθούν σε όλους τους επιλεγμένους χρήστες.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
              {availableSymbols.length === 0 ? (
                <p className="text-sm text-slate-500">Δεν βρέθηκαν σύμβολα</p>
              ) : (
                availableSymbols.map(symbol => {
                  const selected = bulkSymbols.includes(symbol);
                  return (
                    <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
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
                setIsBulkUpdating(true);
                for (const id of selectedIds) {
                  const account = accounts.find(a => a.id === id);
                  await base44.entities.ChreosiAccount.update(id, { ...account, allowed_prediction_symbols: bulkSymbols });
                  await new Promise(r => setTimeout(r, 150));
                }
                queryClient.invalidateQueries(['chreosi-accounts']);
                setIsBulkUpdating(false);
                setBulkSymbolDialog(false);
                setSelectedIds([]);
                toast.success(`Ενημερώθηκαν ${selectedIds.length} λογαριασμοί`);
              }}
            >
              {isBulkUpdating ? 'Αποθήκευση...' : 'Εφαρμογή'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => {
        if (!open) setEditDialog({ open: false, account: null });
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Επεξεργασία Λογαριασμού</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
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
              <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                {availableSymbols.length === 0 ? (
                  <p className="text-sm text-slate-500">Δεν βρέθηκαν σύμβολα</p>
                ) : (
                  availableSymbols.map(symbol => {
                    const selected = (formData.allowed_prediction_symbols || []).includes(symbol);
                    return (
                      <label key={symbol} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
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