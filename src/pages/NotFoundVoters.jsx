import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { FileSpreadsheet, Download, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

export default function NotFoundVoters() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: notFoundVoters = [], isLoading, refetch } = useQuery({
    queryKey: ['not-found-voters'],
    queryFn: () => base44.entities.NotFoundVoter.list('-created_date', 1000)
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids) => {
      await Promise.all(ids.map(id => base44.entities.NotFoundVoter.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['not-found-voters']);
      setSelectedIds([]);
      toast.success('Οι επιλεγμένες καταχωρήσεις διαγράφηκαν');
    },
    onError: () => {
      toast.error('Σφάλμα κατά τη διαγραφή');
    }
  });

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) {
      toast.error('Δεν έχετε επιλέξει καταχωρήσεις');
      return;
    }
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(selectedIds);
    setShowDeleteDialog(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === notFoundVoters.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notFoundVoters.map(v => v.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExport = () => {
    const headers = 'ID που Υποβλήθηκε,Αιτία,Χρήστης Κανάλι,Ημερομηνία';
    const rows = notFoundVoters.map(v => 
      [
        `"${v.submitted_id || ''}"`,
        `"${v.reason_text || ''}"`,
        `"${v.kanali_username || ''}"`,
        `"${v.created_date ? format(new Date(v.created_date), 'dd/MM/yyyy HH:mm', { locale: el }) : ''}"`
      ].join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `αποτυχημένες_ψήφοι_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

  const columns = [
    { 
      key: '_select', 
      label: (
        <Checkbox 
          checked={selectedIds.length === notFoundVoters.length && notFoundVoters.length > 0}
          onCheckedChange={toggleSelectAll}
        />
      ), 
      render: (_, row) => (
        <Checkbox 
          checked={selectedIds.includes(row.id)}
          onCheckedChange={() => toggleSelect(row.id)}
        />
      ),
      width: '50px'
    },
    { key: 'submitted_id', label: 'ID που Υποβλήθηκε' },
    { key: 'reason_text', label: 'Αιτία', render: (val) => {
      const isAlreadyVoted = val?.includes('Ήδη');
      return (
        <Badge 
          variant="outline" 
          className={isAlreadyVoted 
            ? 'border-amber-300 text-amber-700 bg-amber-50' 
            : 'border-red-300 text-red-700 bg-red-50'
          }
        >
          {val}
        </Badge>
      );
    }},
    { key: 'kanali_username', label: 'Χρήστης Κανάλι' },
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
        title="Αποτυχημένες Ψήφοι"
        subtitle={`${notFoundVoters.length} καταχωρήσεις${selectedIds.length > 0 ? ` • ${selectedIds.length} επιλεγμένες` : ''}`}
        icon={FileSpreadsheet}
        actions={
          <>
            {selectedIds.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={handleDeleteClick}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Διαγραφή ({selectedIds.length})
              </Button>
            )}
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Ανανέωση
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή
            </Button>
          </>
        }
      />

      <DataGrid
        data={notFoundVoters}
        columns={columns}
        pageSize={25}
        emptyMessage="Δεν υπάρχουν αποτυχημένες καταχωρήσεις"
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <DialogTitle className="text-xl">Επιβεβαίωση Διαγραφής</DialogTitle>
            </div>
            <DialogDescription className="text-base pt-2">
              {selectedIds.length === 1 
                ? 'Είστε σίγουροι ότι θέλετε να διαγράψετε 1 καταχώρηση;'
                : `Είστε σίγουροι ότι θέλετε να διαγράψετε ${selectedIds.length} καταχωρήσεις;`
              }
              <br />
              <span className="text-red-600 font-medium">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
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