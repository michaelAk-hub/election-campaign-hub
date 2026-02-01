import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Plus, 
  Download, 
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowUpDown
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function DataGrid() {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [votedFilter, setVotedFilter] = useState('all');
  const [editingPerson, setEditingPerson] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sortField, setSortField] = useState('last_name');
  const [sortDirection, setSortDirection] = useState('asc');

  const queryClient = useQueryClient();

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Person.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setIsDialogOpen(false);
      setEditingPerson(null);
      toast.success('Η εγγραφή δημιουργήθηκε επιτυχώς');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setIsDialogOpen(false);
      setEditingPerson(null);
      toast.success('Η εγγραφή ενημερώθηκε επιτυχώς');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      toast.success('Η εγγραφή διαγράφηκε επιτυχώς');
    },
  });

  const filteredAndSortedPeople = useMemo(() => {
    let filtered = people.filter(person => {
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

    filtered.sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const comparison = aVal.toString().localeCompare(bVal.toString(), 'el');
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [people, search, departmentFilter, votedFilter, sortField, sortDirection]);

  const departments = [...new Set(people.map(p => p.department).filter(Boolean))];

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSave = (formData) => {
    if (editingPerson?.id) {
      updateMutation.mutate({ id: editingPerson.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const exportToExcel = () => {
    toast.success('Εξαγωγή σε Excel (προς υλοποίηση)');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Δεδομένα Ψηφοφόρων</h1>
          <p className="text-slate-600 mt-1">Διαχείριση και επεξεργασία εγγραφών</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Εξαγωγή Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingPerson({})} className="bg-blue-900">
                <Plus className="w-4 h-4 mr-2" />
                Νέα Εγγραφή
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <PersonForm 
                person={editingPerson} 
                onSave={handleSave}
                onCancel={() => {
                  setIsDialogOpen(false);
                  setEditingPerson(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
            <p>Εμφάνιση {filteredAndSortedPeople.length} από {people.length} εγγραφές</p>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead onClick={() => handleSort('person_id')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    ΑΤ <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead onClick={() => handleSort('last_name')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    Επίθετο <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead onClick={() => handleSort('first_name')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    Όνομα <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead>Τμήμα</TableHead>
                <TableHead>Έτος</TableHead>
                <TableHead>Κινητό</TableHead>
                <TableHead>Ψήφισε</TableHead>
                <TableHead>Άτομο 1</TableHead>
                <TableHead>Άτομο 2</TableHead>
                <TableHead className="text-right">Ενέργειες</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                    Φόρτωση...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedPeople.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                    Δεν βρέθηκαν εγγραφές
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedPeople.map((person) => (
                  <TableRow key={person.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium">{person.person_id}</TableCell>
                    <TableCell>{person.last_name}</TableCell>
                    <TableCell>{person.first_name}</TableCell>
                    <TableCell>{person.department}</TableCell>
                    <TableCell>{person.admission_year}</TableCell>
                    <TableCell>{person.mobile_phone}</TableCell>
                    <TableCell>
                      {person.voted ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Ναι
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-800 border-slate-200">
                          <XCircle className="w-3 h-3 mr-1" />
                          Όχι
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{person.contact_person_1}</TableCell>
                    <TableCell className="text-sm text-slate-600">{person.contact_person_2}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingPerson(person);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτήν την εγγραφή;')) {
                              deleteMutation.mutate(person.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function PersonForm({ person, onSave, onCancel }) {
  const [formData, setFormData] = useState(person || {});

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{person?.id ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή'}</DialogTitle>
      </DialogHeader>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>ΑΤ (ID) *</Label>
          <Input
            value={formData.person_id || ''}
            onChange={(e) => setFormData({ ...formData, person_id: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>UCID</Label>
          <Input
            value={formData.ucid || ''}
            onChange={(e) => setFormData({ ...formData, ucid: e.target.value })}
          />
        </div>
        <div>
          <Label>Όνομα</Label>
          <Input
            value={formData.first_name || ''}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Επίθετο</Label>
          <Input
            value={formData.last_name || ''}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Τμήμα</Label>
          <Input
            value={formData.department || ''}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          />
        </div>
        <div>
          <Label>Έτος Εισδοχής</Label>
          <Input
            value={formData.admission_year || ''}
            onChange={(e) => setFormData({ ...formData, admission_year: e.target.value })}
          />
        </div>
        <div>
          <Label>Κινητό</Label>
          <Input
            value={formData.mobile_phone || ''}
            onChange={(e) => setFormData({ ...formData, mobile_phone: e.target.value })}
          />
        </div>
        <div>
          <Label>Επίπεδο</Label>
          <Input
            value={formData.academic_level || ''}
            onChange={(e) => setFormData({ ...formData, academic_level: e.target.value })}
          />
        </div>
        <div>
          <Label>Άτομο Επικοινωνίας 1</Label>
          <Input
            value={formData.contact_person_1 || ''}
            onChange={(e) => setFormData({ ...formData, contact_person_1: e.target.value })}
          />
        </div>
        <div>
          <Label>Άτομο Επικοινωνίας 2</Label>
          <Input
            value={formData.contact_person_2 || ''}
            onChange={(e) => setFormData({ ...formData, contact_person_2: e.target.value })}
          />
        </div>
        <div>
          <Label>Μέλος</Label>
          <Input
            value={formData.member || ''}
            onChange={(e) => setFormData({ ...formData, member: e.target.value })}
          />
        </div>
        <div>
          <Label>Εκλογικός Κύκλος</Label>
          <Input
            value={formData.election_cycle || ''}
            onChange={(e) => setFormData({ ...formData, election_cycle: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.voted || false}
              onChange={(e) => setFormData({ ...formData, voted: e.target.checked })}
              className="w-4 h-4"
            />
            Ψήφισε
          </Label>
        </div>
        <div className="col-span-2">
          <Label>Σημειώσεις</Label>
          <Input
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Ακύρωση
        </Button>
        <Button type="submit" className="bg-blue-900">
          Αποθήκευση
        </Button>
      </div>
    </form>
  );
}