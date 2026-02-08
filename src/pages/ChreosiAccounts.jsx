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
  CheckCircle2
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

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: () => base44.entities.ChreosiAccount.list()
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

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
        password_hash: password, // In production, hash this
        display_name: username,
        is_active: true
      });
      newAccounts.push({ username, password });
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

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