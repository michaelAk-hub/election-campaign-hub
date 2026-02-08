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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Vote,
  MoreHorizontal,
  Key,
  UserX,
  UserCheck,
  Download,
  Copy,
  CheckCircle2,
  Plus
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

function generateUsername() {
  return 'kanali_' + Math.random().toString(36).substring(2, 8);
}

export default function KanaliAccounts() {
  const queryClient = useQueryClient();
  const [createDialog, setCreateDialog] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [numAccounts, setNumAccounts] = useState(5);
  const [accountType, setAccountType] = useState('A');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['kanali-accounts'],
    queryFn: () => base44.entities.KanaliAccount.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.KanaliAccount.create(data),
    onSuccess: () => queryClient.invalidateQueries(['kanali-accounts'])
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.KanaliAccount.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['kanali-accounts']);
      toast.success('Ο λογαριασμός ενημερώθηκε');
    }
  });

  const handleCreateAccounts = async () => {
    const newAccounts = [];
    for (let i = 0; i < numAccounts; i++) {
      const username = generateUsername();
      const password = generatePassword();
      await createMutation.mutateAsync({
        username,
        password_hash: password, // In production, hash this
        user_type: accountType,
        is_active: true
      });
      newAccounts.push({ username, password, type: accountType });
    }

    setCreatedAccounts(newAccounts);
    toast.success(`Δημιουργήθηκαν ${newAccounts.length} νέοι λογαριασμοί`);
  };

  const handleExportCreated = () => {
    const csv = '\uFEFF' + 'Όνομα Χρήστη,Κωδικός,Τύπος\n' + 
      createdAccounts.map(a => `"${a.username}","${a.password}","${a.type}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `κανάλι_${new Date().toISOString().split('T')[0]}.csv`;
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
    { key: 'user_type', label: 'Τύπος', render: (val) => (
      <Badge variant="outline" className={val === 'A' ? 'border-blue-300 text-blue-700' : 'border-purple-300 text-purple-700'}>
        Τύπος {val}
      </Badge>
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
        title="Κανάλι"
        subtitle={`${accounts.length} λογαριασμοί`}
        icon={Vote}
        actions={
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Δημιουργία Λογαριασμών
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Τύπος A</p>
                <p className="text-2xl font-bold">{accounts.filter(a => a.user_type === 'A').length}</p>
              </div>
              <Badge variant="outline" className="border-blue-300 text-blue-700">A</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Τύπος B</p>
                <p className="text-2xl font-bold">{accounts.filter(a => a.user_type === 'B').length}</p>
              </div>
              <Badge variant="outline" className="border-purple-300 text-purple-700">B</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <DropdownMenuItem onClick={async () => {
                const newPassword = generatePassword();
                await updateMutation.mutateAsync({
                  id: row.id,
                  data: { ...row, password_hash: newPassword }
                });
                
                // Send notification
                await base44.entities.Notification.create({
                  recipient_type: 'kanali',
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
            <DialogTitle>Δημιουργία Λογαριασμών Κανάλι</DialogTitle>
            <DialogDescription>
              Επιλέξτε τον αριθμό και τον τύπο των λογαριασμών που θέλετε να δημιουργήσετε.
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
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Αριθμός Λογαριασμών</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={numAccounts}
                  onChange={(e) => setNumAccounts(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>Τύπος Λογαριασμού</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Τύπος A - Καταχώρηση Ψήφου</SelectItem>
                    <SelectItem value="B">Τύπος B - (Μελλοντική χρήση)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
    </div>
  );
}