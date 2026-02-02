import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Download, 
  Filter,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import EditableDataGrid from '../components/ui/EditableDataGrid';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DataGrid() {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [votedFilter, setVotedFilter] = useState('all');
  const [updatingRowId, setUpdatingRowId] = useState(null);

  const queryClient = useQueryClient();

  const { data: people = [], isLoading, refetch } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-updated_date', 10000),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setUpdatingRowId(null);
      toast.success('Αποθηκεύτηκε');
    },
    onError: () => {
      setUpdatingRowId(null);
      toast.error('Σφάλμα αποθήκευσης');
    }
  });

  const filteredPeople = useMemo(() => {
    return people.filter(person => {
      const matchesSearch = 
        person.first_name?.toLowerCase().includes(search.toLowerCase()) ||
        person.last_name?.toLowerCase().includes(search.toLowerCase()) ||
        person.person_id?.toLowerCase().includes(search.toLowerCase()) ||
        person.mobile_phone?.includes(search);

      const matchesDepartment = departmentFilter === 'all' || person.department === departmentFilter;
      const matchesVoted = votedFilter === 'all' || 
        (votedFilter === 'voted' && person.voted) ||
        (votedFilter === 'not_voted' && !person.voted);

      return matchesSearch && matchesDepartment && matchesVoted;
    });
  }, [people, search, departmentFilter, votedFilter]);

  const departments = [...new Set(people.map(p => p.department).filter(Boolean))];

  const handleCellUpdate = async (rowId, data) => {
    setUpdatingRowId(rowId);
    updateMutation.mutate({ id: rowId, data });
  };

  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label).join(',');
    const rows = filteredPeople.map(p => 
      COLUMNS.map(c => {
        let val = p[c.key];
        if (c.type === 'boolean') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `δεδομενα_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

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
    { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης' },
    { 
      key: 'voted', 
      label: 'Ψήφισε', 
      type: 'boolean',
      render: (val) => (
        <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
          {val ? 'ΝΑΙ' : 'ΟΧΙ'}
        </Badge>
      )
    },
    { key: 'notes', label: 'Σημειώσεις', type: 'textarea' }
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Πλέγμα Δεδομένων"
        subtitle={`${people.length.toLocaleString('el-GR')} εγγραφές - Επεξεργάσιμο σαν Google Sheets`}
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Ανανέωση
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή CSV
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Αναζήτηση (όνομα, επίθετο, ΑΤ, τηλέφωνο)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Τμήμα" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλα τα Τμήματα</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={votedFilter} onValueChange={setVotedFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Κατάσταση" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλοι</SelectItem>
                <SelectItem value="voted">Ψήφισαν</SelectItem>
                <SelectItem value="not_voted">Δεν Ψήφισαν</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <p>Εμφάνιση {filteredPeople.length} από {people.length} εγγραφές</p>
            <p className="text-xs text-slate-500">💡 Κάντε κλικ σε οποιοδήποτε κελί για επεξεργασία</p>
          </div>
        </CardContent>
      </Card>

      <EditableDataGrid
        data={filteredPeople}
        columns={COLUMNS}
        onUpdate={handleCellUpdate}
        isUpdating={updatingRowId}
      />
    </div>
  );
}