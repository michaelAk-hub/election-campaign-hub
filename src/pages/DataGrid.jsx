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
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import EditableDataGrid from '../components/ui/EditableDataGrid';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DataGrid() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sortField, setSortField] = useState('person_id');
  const [sortDir, setSortDir] = useState('asc');
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

  const filteredAndSortedPeople = useMemo(() => {
    let result = [...people];
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(person => 
        person.first_name?.toLowerCase().includes(searchLower) ||
        person.last_name?.toLowerCase().includes(searchLower) ||
        person.person_id?.toLowerCase().includes(searchLower) ||
        person.mobile_phone?.includes(search)
      );
    }
    
    // Column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        if (key === 'voted') {
          result = result.filter(p => value === 'voted' ? p.voted : !p.voted);
        } else {
          result = result.filter(p => String(p[key]) === value);
        }
      }
    });
    
    // Sort
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        
        if (sortField === 'voted') {
          return sortDir === 'asc' ? (aVal === bVal ? 0 : aVal ? 1 : -1) : (aVal === bVal ? 0 : aVal ? -1 : 1);
        }
        
        const cmp = String(aVal).localeCompare(String(bVal), 'el');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    
    return result;
  }, [people, search, filters, sortField, sortDir]);

  const getUniqueValues = (key) => {
    return [...new Set(people.map(p => p[key]).filter(Boolean))].sort((a, b) => 
      String(a).localeCompare(String(b), 'el')
    );
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  const handleCellUpdate = async (rowId, data) => {
    setUpdatingRowId(rowId);
    updateMutation.mutate({ id: rowId, data });
  };

  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label).join(',');
    const rows = filteredAndSortedPeople.map(p => 
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

      {/* Filters and Sorting */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Αναζήτηση (όνομα, επίθετο, ΑΤ, τηλέφωνο)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Sort controls */}
            <Select value={sortField} onValueChange={(v) => setSortField(v)}>
              <SelectTrigger className="w-[200px]">
                {sortDir === 'asc' ? <ArrowUp className="w-4 h-4 mr-2" /> : <ArrowDown className="w-4 h-4 mr-2" />}
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map(col => (
                  <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            >
              {sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </Button>
          </div>

          {/* Column Filters */}
          <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-lg">
            {/* Department Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Τμήμα</label>
              <Select value={filters.department || 'all'} onValueChange={(v) => handleFilterChange('department', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues('department').map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Admission Year Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Εισδοχή</label>
              <Select value={filters.admission_year || 'all'} onValueChange={(v) => handleFilterChange('admission_year', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues('admission_year').map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Level Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Επίπεδο</label>
              <Select value={filters.academic_level || 'all'} onValueChange={(v) => handleFilterChange('academic_level', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues('academic_level').map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Member Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Μέλος</label>
              <Select value={filters.member || 'all'} onValueChange={(v) => handleFilterChange('member', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues('member').map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voted Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Ψήφισε</label>
              <Select value={filters.voted || 'all'} onValueChange={(v) => handleFilterChange('voted', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  <SelectItem value="voted">ΝΑΙ</SelectItem>
                  <SelectItem value="not_voted">ΟΧΙ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Prediction Symbol Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">Σύμβολο Πρόβλεψης</label>
              <Select value={filters.prediction_symbol || 'all'} onValueChange={(v) => handleFilterChange('prediction_symbol', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues('prediction_symbol').map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({})}
              className="self-end"
            >
              <X className="h-4 w-4 mr-1" />
              Καθαρισμός
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600">
            <p>Εμφάνιση {filteredAndSortedPeople.length} από {people.length} εγγραφές</p>
            <p className="text-xs text-slate-500">💡 Κάντε κλικ σε οποιοδήποτε κελί για επεξεργασία</p>
          </div>
        </CardContent>
      </Card>

      <EditableDataGrid
        data={filteredAndSortedPeople}
        columns={COLUMNS}
        onUpdate={handleCellUpdate}
        isUpdating={updatingRowId}
      />
    </div>
  );
}