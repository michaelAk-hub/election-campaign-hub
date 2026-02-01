import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Play,
  Trash2,
  Download,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)' },
  { key: 'last_name', label: 'Επίθετο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'department', label: 'Τμήμα' },
  { key: 'admission_year', label: 'Εισδοχή' },
  { key: 'mobile_phone', label: 'Κινητό' },
  { key: 'contact_person_1', label: 'Άτομο 1' },
  { key: 'contact_person_2', label: 'Άτομο 2' },
  { key: 'voted', label: 'Ψήφισε' },
  { key: 'notes', label: 'Σημειώσεις' },
];

export default function SavedQueries() {
  const queryClient = useQueryClient();
  const [createDialog, setCreateDialog] = useState(false);
  const [runDialog, setRunDialog] = useState({ open: false, query: null });
  const [queryResults, setQueryResults] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'],
    filters: {}
  });

  const { data: savedQueries = [], isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => base44.entities.SavedQuery.list('-created_date')
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SavedQuery.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-queries']);
      setCreateDialog(false);
      setFormData({
        name: '',
        description: '',
        columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'],
        filters: {}
      });
      toast.success('Το ερώτημα αποθηκεύτηκε');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SavedQuery.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-queries']);
      toast.success('Το ερώτημα διαγράφηκε');
    }
  });

  const runQuery = (query) => {
    let results = [...people];
    
    // Apply filters
    if (query.filters) {
      Object.entries(query.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          if (key === 'voted') {
            results = results.filter(p => p.voted === (value === 'true'));
          } else {
            results = results.filter(p => 
              String(p[key] || '').toLowerCase().includes(String(value).toLowerCase())
            );
          }
        }
      });
    }

    setQueryResults(results);
    setRunDialog({ open: true, query });
  };

  const exportResults = () => {
    if (!runDialog.query || queryResults.length === 0) return;

    const cols = runDialog.query.columns || AVAILABLE_COLUMNS.map(c => c.key);
    const headers = cols.map(k => AVAILABLE_COLUMNS.find(c => c.key === k)?.label || k).join(',');
    const rows = queryResults.map(p => 
      cols.map(k => {
        let val = p[k];
        if (k === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runDialog.query.name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Αποθηκευμένα Ερωτήματα"
        subtitle="Δημιουργία και εκτέλεση προσαρμοσμένων ερωτημάτων"
        icon={Search}
        actions={
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Νέο Ερώτημα
          </Button>
        }
      />

      {savedQueries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Δεν υπάρχουν αποθηκευμένα ερωτήματα"
          description="Δημιουργήστε ένα νέο ερώτημα για να ξεκινήσετε"
          action={
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Νέο Ερώτημα
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedQueries.map(query => (
            <Card key={query.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  {query.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm('Διαγραφή αυτού του ερωτήματος;')) {
                        deleteMutation.mutate(query.id);
                      }
                    }}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {query.description && (
                  <p className="text-sm text-slate-500 mb-4">{query.description}</p>
                )}
                <div className="text-xs text-slate-400 mb-4">
                  {(query.columns || []).length} στήλες
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => runQuery(query)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Εκτέλεση
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Query Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Νέο Ερώτημα</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Όνομα *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Όνομα ερωτήματος"
              />
            </div>
            <div className="space-y-2">
              <Label>Περιγραφή</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Περιγραφή"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Στήλες</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={col.key}
                      checked={(formData.columns || []).includes(col.key)}
                      onCheckedChange={(checked) => {
                        const newCols = checked
                          ? [...(formData.columns || []), col.key]
                          : (formData.columns || []).filter(c => c !== col.key);
                        setFormData({...formData, columns: newCols});
                      }}
                    />
                    <Label htmlFor={col.key} className="text-sm">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Φίλτρα</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Τμήμα</Label>
                  <Input
                    value={formData.filters?.department || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      filters: {...formData.filters, department: e.target.value}
                    })}
                    placeholder="Φίλτρο τμήματος"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ψήφισε</Label>
                  <select
                    value={formData.filters?.voted || 'all'}
                    onChange={(e) => setFormData({
                      ...formData,
                      filters: {...formData.filters, voted: e.target.value}
                    })}
                    className="w-full h-10 px-3 rounded-md border"
                  >
                    <option value="all">Όλα</option>
                    <option value="true">Ναι</option>
                    <option value="false">Όχι</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => {
                if (!formData.name) {
                  toast.error('Εισάγετε όνομα');
                  return;
                }
                createMutation.mutate(formData);
              }}
              disabled={createMutation.isPending}
            >
              Αποθήκευση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Query Dialog */}
      <Dialog open={runDialog.open} onOpenChange={(open) => setRunDialog({ open, query: null })}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Αποτελέσματα: {runDialog.query?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-500">
              {queryResults.length} εγγραφές
            </span>
            <Button variant="outline" onClick={exportResults}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή
            </Button>
          </div>

          <div className="overflow-auto max-h-[50vh] border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {(runDialog.query?.columns || []).map(k => (
                    <th key={k} className="text-left p-3 font-semibold">
                      {AVAILABLE_COLUMNS.find(c => c.key === k)?.label || k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResults.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-slate-50">
                    {(runDialog.query?.columns || []).map(k => (
                      <td key={k} className="p-3">
                        {k === 'voted' ? (row[k] ? 'ΝΑΙ' : 'ΟΧΙ') : (row[k] || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {queryResults.length > 100 && (
            <p className="text-sm text-slate-500 text-center">
              Εμφανίζονται οι πρώτες 100 εγγραφές. Εξάγετε για να δείτε όλα τα αποτελέσματα.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}