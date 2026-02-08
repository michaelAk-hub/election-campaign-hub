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
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';
import EditableDataGrid from '../components/ui/EditableDataGrid';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DataGrid() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
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

    // Search across all fields
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(person => 
        Object.values(person).some(val => 
          val && String(val).toLowerCase().includes(searchLower)
        )
      );
    }

    // Apply column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        if (key === 'voted') {
          result = result.filter(p => 
            value === 'voted' ? p.voted === true : p.voted === false
          );
        } else {
          result = result.filter(p => String(p[key]) === value);
        }
      }
    });

    // Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] ?? '';
        const bVal = b[sortConfig.key] ?? '';
        
        if (typeof aVal === 'boolean') {
          return sortConfig.direction === 'asc' 
            ? (aVal === bVal ? 0 : aVal ? 1 : -1)
            : (aVal === bVal ? 0 : aVal ? -1 : 1);
        }
        
        const cmp = String(aVal).localeCompare(String(bVal), 'el');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [people, search, filters, sortConfig]);

  const getUniqueValues = (key) => {
    const values = [...new Set(people.map(p => p[key]).filter(Boolean))];
    return values.sort((a, b) => String(a).localeCompare(String(b), 'el'));
  };

  const handleCellUpdate = async (rowId, data) => {
    setUpdatingRowId(rowId);
    updateMutation.mutate({ id: rowId, data });
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setSortConfig({ key: null, direction: 'asc' });
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
            {(Object.keys(filters).length > 0 || search || sortConfig.key) && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Καθαρισμός Φίλτρων
              </Button>
            )}
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
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Αναζήτηση σε όλες τις στήλες..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Column Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {COLUMNS.slice(0, 12).map(col => {
                if (col.type === 'textarea') return null;
                
                const uniqueValues = col.type === 'boolean' 
                  ? ['voted', 'not_voted']
                  : getUniqueValues(col.key);
                
                if (uniqueValues.length === 0) return null;

                return (
                  <div key={col.key} className="space-y-1">
                    <label className="text-xs text-slate-600 font-medium">{col.label}</label>
                    <Select 
                      value={filters[col.key] || 'all'} 
                      onValueChange={(v) => handleFilterChange(col.key, v)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Όλα</SelectItem>
                        {col.type === 'boolean' ? (
                          <>
                            <SelectItem value="voted">ΝΑΙ</SelectItem>
                            <SelectItem value="not_voted">ΟΧΙ</SelectItem>
                          </>
                        ) : (
                          uniqueValues.map(v => (
                            <SelectItem key={v} value={String(v)}>{String(v)}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-sm text-slate-600 font-medium">Ταξινόμηση:</span>
              <Select 
                value={sortConfig.key || 'none'} 
                onValueChange={(v) => v === 'none' ? setSortConfig({ key: null, direction: 'asc' }) : handleSort(v)}
              >
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Επιλέξτε στήλη" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Χωρίς Ταξινόμηση</SelectItem>
                  {COLUMNS.map(col => (
                    <SelectItem key={col.key} value={col.key}>
                      {col.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sortConfig.key && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  className="h-9"
                >
                  {sortConfig.direction === 'asc' ? (
                    <><ArrowUp className="h-4 w-4 mr-1" /> Αύξουσα</>
                  ) : (
                    <><ArrowDown className="h-4 w-4 mr-1" /> Φθίνουσα</>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-600 pt-4 border-t">
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