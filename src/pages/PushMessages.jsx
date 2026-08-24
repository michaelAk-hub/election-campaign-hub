import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Send,
  Users,
  Vote,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

export default function PushMessages() {
  const queryClient = useQueryClient();
  const [sendDialog, setSendDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    target_group: 'both'
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['push-messages'],
    queryFn: () => base44.entities.PushMessage.list('-created_date', 100)
  });

  const { data: chreosiAccounts = [] } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: () => base44.entities.ChreosiAccount.list()
  });

  const { data: kanaliAccounts = [] } = useQuery({
    queryKey: ['kanali-accounts'],
    queryFn: () => base44.entities.KanaliAccount.list()
  });

  const sendMutation = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      let totalRecipients = 0;
      if (data.target_group === 'chreosi' || data.target_group === 'both') {
        totalRecipients += chreosiAccounts.filter(a => a.is_active).length;
      }
      if (data.target_group === 'kanali' || data.target_group === 'both') {
        totalRecipients += kanaliAccounts.filter(a => a.is_active).length;
      }
      return base44.entities.PushMessage.create({
        ...data,
        sender_email: user.email,
        total_recipients: totalRecipients,
        acknowledged_count: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['push-messages']);
      setSendDialog(false);
      setFormData({ title: '', body: '', target_group: 'both' });
      toast.success('Το μήνυμα στάλθηκε');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PushMessage.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['push-messages']);
      toast.success('Το μήνυμα ενημερώθηκε');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PushMessage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['push-messages']);
      toast.success('Το μήνυμα διαγράφηκε');
    }
  });

  const columns = [
    { key: 'title', label: 'Τίτλος' },
    { key: 'target_group', label: 'Παραλήπτες', render: (val) => {
      const icons = {
        chreosi: <Users className="h-3 w-3" />,
        kanali: <Vote className="h-3 w-3" />,
        both: <><Users className="h-3 w-3" /><Vote className="h-3 w-3" /></>
      };
      const labels = {
        chreosi: 'Χρεωστικοί',
        kanali: 'Κανάλι',
        both: 'Όλοι'
      };
      return (
        <div className="flex items-center gap-1">
          {icons[val]}
          <span>{labels[val]}</span>
        </div>
      );
    }},
    { key: 'total_recipients', label: 'Σύνολο' },
    { key: 'acknowledged_count', label: 'Αναγνώστηκε' },
    { key: 'is_active', label: 'Κατάσταση', render: (val) => (
      <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
        {val ? 'Ενεργό' : 'Ανενεργό'}
      </Badge>
    )},
    { key: 'created_date', label: 'Ημερομηνία', render: (val) => 
      val ? format(new Date(val), 'dd/MM/yyyy HH:mm', { locale: el }) : '-'
    }
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Μηνύματα"
        subtitle="Αποστολή ειδοποιήσεων στους χρήστες"
        icon={MessageSquare}
        actions={
          <Button onClick={() => setSendDialog(true)}>
            <Send className="h-4 w-4 mr-2" />
            Νέο Μήνυμα
          </Button>
        }
      />

      <DataGrid
        data={messages}
        columns={columns}
        pageSize={20}
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => updateMutation.mutate({
                id: row.id,
                data: { ...row, is_active: !row.is_active }
              })}
            >
              {row.is_active ? (
                <EyeOff className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              ) : (
                <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setMessageToDelete(row);
                setDeleteDialog(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        )}
        emptyMessage="Δεν υπάρχουν μηνύματα"
      />

      {/* Send Message Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποστολή Μηνύματος</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Τίτλος *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Τίτλος μηνύματος"
              />
            </div>
            <div className="space-y-2">
              <Label>Μήνυμα *</Label>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData({...formData, body: e.target.value})}
                placeholder="Περιεχόμενο μηνύματος"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Παραλήπτες</Label>
              <Select 
                value={formData.target_group} 
                onValueChange={(v) => setFormData({...formData, target_group: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Όλοι (Χρεωστικοί & Κανάλι)</SelectItem>
                  <SelectItem value="chreosi">Μόνο Χρεωστικοί</SelectItem>
                  <SelectItem value="kanali">Μόνο Κανάλι</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => {
                if (!formData.title || !formData.body) {
                  toast.error('Συμπληρώστε τίτλο και μήνυμα');
                  return;
                }
                sendMutation.mutate(formData);
              }}
              disabled={sendMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Αποστολή
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Επιβεβαίωση Διαγραφής</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Είστε σίγουροι ότι θέλετε να διαγράψετε το μήνυμα "{messageToDelete?.title}";
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Ακύρωση
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate(messageToDelete.id);
                setDeleteDialog(false);
                setMessageToDelete(null);
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Διαγραφή
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}