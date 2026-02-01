import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

export default function NotFoundVoters() {
  const { data: notFoundVoters = [], isLoading, refetch } = useQuery({
    queryKey: ['not-found-voters'],
    queryFn: () => base44.entities.NotFoundVoter.list('-created_date', 1000)
  });

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
        subtitle={`${notFoundVoters.length} καταχωρήσεις`}
        icon={FileSpreadsheet}
        actions={
          <>
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
    </div>
  );
}