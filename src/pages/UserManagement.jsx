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
import { UserCog, UserPlus, Mail, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Εισάγετε email');
      return;
    }
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      toast.success('Η πρόσκληση στάλθηκε');
      setInviteDialog(false);
      setInviteEmail('');
      queryClient.invalidateQueries(['users']);
    } catch (error) {
      toast.error('Σφάλμα κατά την αποστολή');
    }
    setInviting(false);
  };

  const columns = [
    { key: 'full_name', label: 'Όνομα', render: (val) => val || '-' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Ρόλος', render: (val) => (
      <Badge variant={val === 'admin' ? 'default' : 'secondary'} className={val === 'admin' ? 'bg-purple-100 text-purple-700' : ''}>
        {val === 'admin' ? 'Διαχειριστής' : 'Οργανωτικός'}
      </Badge>
    )},
    { key: 'created_date', label: 'Εγγραφή', render: (val) => 
      val ? format(new Date(val), 'dd/MM/yyyy', { locale: el }) : '-'
    }
  ];

  if (isLoading) {
    return <LoadingSpinner />;
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