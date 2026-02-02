import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import EditableDataGrid from '../components/ui/EditableDataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Database,
  Plus,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Phone
} from 'lucide-react';
import { toast } from 'sonner';

const COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)' },
  { key: 'ucid', label: 'UCID' },
  { key: 'last_name', label: 'Επίθετο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'department', label: 'Τμήμα' },
  { key: 'admission_year', label: 'Εισδοχή' },
  { key: 'academic_level', label: 'Επίπεδο' },
  { key: 'mobile_phone', label: 'Κινητό' },
  { key: 'contact_person_1', label: 'Άτομο 1' },
  { key: 'contact_person_2', label: 'Άτομο 2' },
  { key: 'member', label: 'Μέλος' },
  { key: 'election_cycle', label: 'Σύμβολο Πρόβλεψης' },
  { key: 'voted', label: 'Ψήφισε', type: 'boolean' },
  { key: 'notes', label: 'Σημειώσεις', type: 'textarea' }
];

export default function Records() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState({ open: false, person: null });
  const [addDialog, setAddDialog] = useState(false);
  const [formData, setFormData] = useState({});

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Person.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setAddDialog(false);
      setFormData({});
      toast.success('Η εγγραφή δημιουργήθηκε');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setEditDialog({ open: false, person: null });
      toast.success('Η εγγραφή ενημερώθηκε');
    }
  });

  const handleCellUpdate = async (id, field, value) => {
    try {
      await base44.entities.Person.update(id, { [field]: value });
      queryClient.invalidateQueries(['people']);
      toast.success('Ενημερώθηκε');
    } catch (error) {
      toast.error('Σφάλμα κατά την ενημέρωση');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      toast.success('Η εγγραφή διαγράφηκε');
    }
  });

  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label).join(',');
    const rows = people.map(p => 
      COLUMNS.map(c => {
        let val = p[c.key];
        if (c.key === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `εγγραφές_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

  const openEditDialog = (person) => {
    setFormData({ ...person });
    setEditDialog({ open: true, person });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Εγγραφές"
        subtitle={`${people.length.toLocaleString('el-GR')} συνολικά εγγραφές`}
        icon={Database}
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή
            </Button>
            <Button onClick={() => { setFormData({}); setAddDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Νέα Εγγραφή
            </Button>
          </>
        }
      />

      <EditableDataGrid
        data={people}
        columns={COLUMNS}
        onCellUpdate={handleCellUpdate}
        pageSize={50}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={addDialog || editDialog.open} onOpenChange={(open) => {
        if (!open) {
          setAddDialog(false);
          setEditDialog({ open: false, person: null });
          setFormData({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editDialog.person ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>ΑΤ (ID) *</Label>
              <Input
                value={formData.person_id || ''}
                onChange={(e) => setFormData({...formData, person_id: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>UCID</Label>
              <Input
                value={formData.ucid || ''}
                onChange={(e) => setFormData({...formData, ucid: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Επίθετο</Label>
              <Input
                value={formData.last_name || ''}
                onChange={(e) => setFormData({...formData, last_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Όνομα</Label>
              <Input
                value={formData.first_name || ''}
                onChange={(e) => setFormData({...formData, first_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Τμήμα</Label>
              <Input
                value={formData.department || ''}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Έτος Εισδοχής</Label>
              <Input
                value={formData.admission_year || ''}
                onChange={(e) => setFormData({...formData, admission_year: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Κινητό</Label>
              <Input
                value={formData.mobile_phone || ''}
                onChange={(e) => setFormData({...formData, mobile_phone: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Ακαδημαϊκό Επίπεδο</Label>
              <Input
                value={formData.academic_level || ''}
                onChange={(e) => setFormData({...formData, academic_level: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Άτομο 1</Label>
              <Input
                value={formData.contact_person_1 || ''}
                onChange={(e) => setFormData({...formData, contact_person_1: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Άτομο 2</Label>
              <Input
                value={formData.contact_person_2 || ''}
                onChange={(e) => setFormData({...formData, contact_person_2: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Μέλος</Label>
              <Input
                value={formData.member || ''}
                onChange={(e) => setFormData({...formData, member: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Σύμβολο Πρόβλεψης</Label>
              <Input
                value={formData.election_cycle || ''}
                onChange={(e) => setFormData({...formData, election_cycle: e.target.value})}
              />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={formData.voted || false}
                onCheckedChange={(v) => setFormData({...formData, voted: v})}
              />
              <Label>Ψήφισε</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Σημειώσεις</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddDialog(false);
              setEditDialog({ open: false, person: null });
              setFormData({});
            }}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => {
                if (!formData.person_id) {
                  toast.error('Το πεδίο ΑΤ (ID) είναι υποχρεωτικό');
                  return;
                }
                if (editDialog.person) {
                  updateMutation.mutate({ id: editDialog.person.id, data: formData });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editDialog.person ? 'Αποθήκευση' : 'Δημιουργία'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}