import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Phone, LogOut, User, Filter } from 'lucide-react';
import { toast } from 'sonner';

export default function ChreosiPortal() {
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [editingPerson, setEditingPerson] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);

    try {
      const accounts = await base44.entities.ChreosiAccount.filter({ 
        username: username.trim().replace(/\s+/g, ' ')
      });
      
      if (accounts.length > 0 && accounts[0].is_active) {
        // In production, validate password hash
        const sessionData = {
          session_token: Math.random().toString(36),
          username: accounts[0].username,
          portal_type: 'chreosi',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          is_active: true
        };
        
        const newSession = await base44.entities.PortalSession.create(sessionData);
        setSession(newSession);
        toast.success('Επιτυχής σύνδεση!');
      } else {
        toast.error('Λανθασμένα στοιχεία σύνδεσης');
      }
    } catch (error) {
      toast.error('Σφάλμα σύνδεσης');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (session) {
      await base44.entities.PortalSession.update(session.id, { is_active: false });
    }
    setSession(null);
    toast.success('Αποσυνδεθήκατε επιτυχώς');
  };

  const { data: assignedPeople = [] } = useQuery({
    queryKey: ['assigned-people', session?.username],
    queryFn: async () => {
      if (!session) return [];
      const all = await base44.entities.Person.list();
      return all.filter(p => 
        !p.voted && 
        (p.contact_person_1 === session.username || p.contact_person_2 === session.username)
      );
    },
    enabled: !!session,
    initialData: [],
  });

  const { data: checkmarks = [] } = useQuery({
    queryKey: ['checkmarks', session?.username],
    queryFn: async () => {
      if (!session) return [];
      return await base44.entities.ChreosiCheckmark.filter({ 
        chreosi_username: session.username 
      });
    },
    enabled: !!session,
    initialData: [],
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ id, notes }) => base44.entities.Person.update(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries(['assigned-people']);
      setIsEditDialogOpen(false);
      setEditingPerson(null);
      toast.success('Οι σημειώσεις ενημερώθηκαν');
    },
  });

  const toggleCheckmarkMutation = useMutation({
    mutationFn: async ({ personId, currentlyChecked }) => {
      const existing = checkmarks.find(c => c.person_record_id === personId);
      
      if (existing) {
        return await base44.entities.ChreosiCheckmark.update(existing.id, {
          checked: !currentlyChecked
        });
      } else {
        return await base44.entities.ChreosiCheckmark.create({
          chreosi_username: session.username,
          person_record_id: personId,
          checked: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['checkmarks']);
    },
  });

  const filteredPeople = assignedPeople.filter(person => {
    const matchesSearch = 
      person.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      person.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      person.mobile_phone?.includes(search);

    const matchesDepartment = departmentFilter === 'all' || person.department === departmentFilter;
    const matchesYear = yearFilter === 'all' || person.admission_year === yearFilter;

    return matchesSearch && matchesDepartment && matchesYear;
  });

  const departments = [...new Set(assignedPeople.map(p => p.department).filter(Boolean))];
  const years = [...new Set(assignedPeople.map(p => p.admission_year).filter(Boolean))];

  const isChecked = (personId) => {
    const checkmark = checkmarks.find(c => c.person_record_id === personId);
    return checkmark?.checked || false;
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center pb-8">
            <div className="w-16 h-16 bg-blue-900 rounded-full mx-auto mb-4 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Πύλη Χρέωσης</CardTitle>
            <p className="text-slate-600 text-sm mt-2">Σύνδεση στην πλατφόρμα</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Όνομα Χρήστη</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Εισάγετε το όνομά σας"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Κωδικός Πρόσβασης</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Εισάγετε τον κωδικό σας"
                  required
                  className="mt-1"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-blue-900 hover:bg-blue-800"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Σύνδεση...' : 'Σύνδεση'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Πύλη Χρέωσης</h1>
              <p className="text-xs text-slate-500">Καλώς ήρθατε, {session.username}</p>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Αποσύνδεση
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-900">{assignedPeople.length}</p>
                <p className="text-sm text-slate-600 mt-1">Ανατεθειμένα Άτομα</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {checkmarks.filter(c => c.checked).length}
                </p>
                <p className="text-sm text-slate-600 mt-1">Σημειωμένα</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">{filteredPeople.length}</p>
                <p className="text-sm text-slate-600 mt-1">Αποτελέσματα Φίλτρου</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Αναζήτηση (όνομα, επίθετο, τηλέφωνο)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
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
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Έτος" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα τα Έτη</SelectItem>
                  {years.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* People List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPeople.map(person => (
            <Card key={person.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isChecked(person.id)}
                      onChange={() => toggleCheckmarkMutation.mutate({
                        personId: person.id,
                        currentlyChecked: isChecked(person.id)
                      })}
                      className="w-5 h-5 text-blue-900 rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {person.last_name} {person.first_name}
                        </h3>
                        <div className="mt-2 space-y-1">
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">Τμήμα:</span> {person.department}
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">Έτος:</span> {person.admission_year}
                          </p>
                          {person.mobile_phone && (
                            <a 
                              href={`tel:${person.mobile_phone}`}
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                            >
                              <Phone className="w-4 h-4" />
                              {person.mobile_phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    {person.notes && (
                      <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-sm text-amber-900">{person.notes}</p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => {
                        setEditingPerson(person);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      Επεξεργασία Σημειώσεων
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredPeople.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-500">Δεν βρέθηκαν ανατεθειμένα άτομα</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Notes Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Επεξεργασία Σημειώσεων</DialogTitle>
          </DialogHeader>
          {editingPerson && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              updateNotesMutation.mutate({
                id: editingPerson.id,
                notes: formData.get('notes')
              });
            }}>
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {editingPerson.last_name} {editingPerson.first_name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {editingPerson.department} • {editingPerson.admission_year}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Σημειώσεις</label>
                  <Textarea
                    name="notes"
                    defaultValue={editingPerson.notes || ''}
                    rows={4}
                    className="mt-1"
                    placeholder="Προσθέστε σημειώσεις..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Ακύρωση
                  </Button>
                  <Button type="submit" className="bg-blue-900">
                    Αποθήκευση
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}