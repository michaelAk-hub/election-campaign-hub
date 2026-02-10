import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { UserCog, UserPlus, Mail, Shield, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  React.useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin'
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      setSelectedIds([]);
      toast.success('Ο χρήστης διαγράφηκε');
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.User.delete(id);
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries(['users']);
      setSelectedIds([]);
      toast.success(`Διαγράφηκαν ${ids.length} χρήστες`);
    }
  });

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Εισάγετε email');
      return;
    }
    setInviting(true);
    try {
      const response = await base44.functions.invoke('createInvitation', {
        email: inviteEmail,
        role: inviteRole
      });
      
      if (response.data.success) {
        toast.success('Η πρόσκληση στάλθηκε με email');
        setInviteDialog(false);
        setInviteEmail('');
      } else {
        toast.error(response.data.error || 'Σφάλμα κατά την αποστολή');
      }
    } catch (error) {
      toast.error('Σφάλμα κατά την αποστολή');
    }
    setInviting(false);
  };

  const columns = [
    { key: 'full_name', label: 'Όνομα', render: (val) => val || '-' },
    { key: 'email', label: 'Email' },
    { key: 'password', label: 'Κωδικός', render: (val) => (
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
    { key: 'role', label: 'Ρόλος', render: (val) => (
      <Badge variant={val === 'admin' ? 'default' : 'secondary'} className={val === 'admin' ? 'bg-purple-100 text-purple-700' : ''}>
        {val === 'admin' ? 'Διαχειριστής' : 'Οργανωτικός'}
      </Badge>
    )},
    { key: 'created_date', label: 'Εγγραφή', render: (val) => 
      val ? format(new Date(val), 'dd/MM/yyyy', { locale: el }) : '-'
    }
  ];

  if (!currentUser || isLoading) {
    return <LoadingSpinner />;
  }

  if (currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Δεν Επιτρέπεται η Πρόσβαση</h2>
          <p className="text-slate-500">Μόνο οι διαχειριστές μπορούν να διαχειριστούν χρήστες</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Διαχείριση Χρηστών"
        subtitle={`${users.length} χρήστες συστήματος`}
        icon={UserCog}
        actions={
          <Button onClick={() => setInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Πρόσκληση Χρήστη
          </Button>
        }
      />

      <DataGrid
        data={users}
        columns={columns}
        pageSize={20}
        emptyMessage="Δεν υπάρχουν χρήστες"
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε ${selectedIds.length} χρήστες;`)) {
                  bulkDeleteMutation.mutate(selectedIds);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Διαγραφή ({selectedIds.length})
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
              <DropdownMenuItem 
                onClick={() => {
                  if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε τον χρήστη ${row.email}?`)) {
                    deleteMutation.mutate(row.id);
                  }
                }}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Invite Dialog */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Πρόσκληση Χρήστη</DialogTitle>
            <DialogDescription>
              Στείλτε πρόσκληση σε νέο χρήστη για πρόσβαση στο σύστημα
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ρόλος</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-slate-400" />
                      Οργανωτικός
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-600" />
                      Διαχειριστής
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Οι διαχειριστές έχουν πλήρη πρόσβαση. Οι οργανωτικοί έχουν πρόσβαση στα δεδομένα χωρίς διαχείριση χρηστών.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialog(false)}>
              Ακύρωση
            </Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Αποστολή...' : 'Αποστολή Πρόσκλησης'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}