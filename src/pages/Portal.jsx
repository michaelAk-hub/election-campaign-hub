import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Vote,
  Phone,
  Search,
  LogOut,
  User,
  CheckCircle2,
  AlertCircle,
  Filter,
  MessageSquare,
  X,
  Loader2,
  Trash2
} from 'lucide-react';
import NotificationCenter from '../components/notifications/NotificationCenter';
import PullToRefresh from '../components/common/PullToRefresh';
import { toast } from 'sonner';

function normalizeUsername(str) {
  return str?.trim().replace(/\s+/g, ' ') || '';
}

// Chreosi Portal Component
function ChreosiPortal({ username }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesValue, setNotesValue] = useState('');

  const normalizedUsername = normalizeUsername(username);

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['chreosi-people', normalizedUsername],
    queryFn: async () => {
      // Step 1: Load account to get allowed symbols
      const accounts = await base44.entities.ChreosiAccount.filter({ username: normalizedUsername });
      const account = accounts[0] || null;
      const allowedSymbols = account?.allowed_prediction_symbols;

      console.log("=== PORTAL DEBUG ===");
      console.log("Username:", normalizedUsername);
      console.log("Account:", account);
      console.log("Allowed Symbols:", allowedSymbols);

      if (!allowedSymbols || allowedSymbols.length === 0) return [];

      // Step 2: Fetch all persons
      let all = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const batch = await base44.entities.Person.list(null, pageSize, page * pageSize);
        all = all.concat(batch);
        if (batch.length < pageSize) break;
        page++;
      }

      // Step 3: Filter by assignment + not voted + allowed symbols
      return all.filter(p => {
        if (p.voted) return false;
        const cp1 = normalizeUsername(p.contact_person_1);
        const cp2 = normalizeUsername(p.contact_person_2);
        if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) return false;
        return allowedSymbols.includes(p.prediction_symbol);
      });
    }
  });

  const { data: checkmarks = [] } = useQuery({
    queryKey: ['checkmarks', normalizedUsername],
    queryFn: () => base44.entities.ChreosiCheckmark.filter({ chreosi_username: normalizedUsername })
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ id, notes }) => base44.entities.Person.update(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries(['chreosi-people']);
      setEditingNotes(null);
      toast.success('Οι σημειώσεις αποθηκεύτηκαν');
    }
  });

  const toggleCheckmarkMutation = useMutation({
    mutationFn: async ({ personId, checked }) => {
      const existing = checkmarks.find(c => c.person_record_id === personId);
      if (existing) {
        return base44.entities.ChreosiCheckmark.update(existing.id, { checked });
      } else {
        return base44.entities.ChreosiCheckmark.create({
          chreosi_username: normalizedUsername,
          person_record_id: personId,
          checked
        });
      }
    },
    onMutate: async ({ personId, checked }) => {
      await queryClient.cancelQueries(['checkmarks', normalizedUsername]);
      const previous = queryClient.getQueryData(['checkmarks', normalizedUsername]);
      queryClient.setQueryData(['checkmarks', normalizedUsername], (old = []) => {
        const existing = old.find(c => c.person_record_id === personId);
        if (existing) {
          return old.map(c => c.person_record_id === personId ? { ...c, checked } : c);
        }
        return [...old, { chreosi_username: normalizedUsername, person_record_id: personId, checked, id: `temp-${personId}` }];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['checkmarks', normalizedUsername], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(['checkmarks', normalizedUsername]);
    }
  });

  // assignedPeople is already filtered by the query
  const assignedPeople = people;

  // Apply filters
  const filteredPeople = assignedPeople.filter(p => {
    const matchSearch = !search || 
      (p.first_name?.toLowerCase().includes(search.toLowerCase())) ||
      (p.last_name?.toLowerCase().includes(search.toLowerCase())) ||
      (p.mobile_phone?.includes(search));
    const matchDept = deptFilter === 'all' || p.department === deptFilter;
    const matchYear = yearFilter === 'all' || p.admission_year === yearFilter;
    return matchSearch && matchDept && matchYear;
  });

  const departments = [...new Set(assignedPeople.map(p => p.department).filter(Boolean))];
  const years = [...new Set(assignedPeople.map(p => p.admission_year).filter(Boolean))];

  const checkmarkMap = new Map(checkmarks.map(c => [c.person_record_id, c.checked]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Αναζήτηση..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Τμήμα" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλα τα τμήματα</SelectItem>
            {departments.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Έτος" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλα τα έτη</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 mb-4">
        <span>{filteredPeople.length} άτομα</span>
        <span>Σύνολο ανατεθημένων: {assignedPeople.length}</span>
      </div>

      <div className="space-y-3">
        {filteredPeople.map(person => (
          <Card key={person.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Checkbox
                  checked={checkmarkMap.get(person.id) || false}
                  onCheckedChange={(checked) => 
                    toggleCheckmarkMutation.mutate({ personId: person.id, checked })
                  }
                  className="mt-1 h-7 w-7 rounded-md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {person.last_name} {person.first_name}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline">{person.department}</Badge>
                        <Badge variant="outline">{person.admission_year}</Badge>
                      </div>
                    </div>
                    {person.mobile_phone && (
                      <a
                        href={`tel:${person.mobile_phone}`}
                        className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Phone className="h-4 w-4" />
                        <span className="text-sm">{person.mobile_phone}</span>
                      </a>
                    )}
                  </div>
                  <div className="mt-3">
                    <div 
                      className="text-sm text-slate-600 cursor-pointer hover:bg-slate-50 p-2 rounded-lg -ml-2"
                      onClick={() => {
                        setEditingNotes(person);
                        setNotesValue(person.notes || '');
                      }}
                    >
                      {person.notes ? (
                        <p>{person.notes}</p>
                      ) : (
                        <p className="text-slate-400 italic">Κλικ για προσθήκη σημειώσεων...</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredPeople.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <User className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p>Δεν βρέθηκαν άτομα</p>
          </div>
        )}
      </div>

      {/* Edit Notes Dialog */}
      <Dialog open={!!editingNotes} onOpenChange={() => setEditingNotes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Σημειώσεις - {editingNotes?.last_name} {editingNotes?.first_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Γράψτε σημειώσεις..."
              rows={5}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingNotes(null)}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => updateNotesMutation.mutate({ 
                id: editingNotes.id, 
                notes: notesValue 
              })}
              disabled={updateNotesMutation.isPending}
            >
              Αποθήκευση
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Kanali Type A Portal Component
function KanaliTypeAPortal({ username }) {
  const queryClient = useQueryClient();
  const [inputId, setInputId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const submitMutation = useMutation({
    mutationFn: async (submittedId) => {
      // Find person by ID
      const people = await base44.entities.Person.filter({ person_id: submittedId });
      
      let status, reason;
      let personRecordId = null;

      if (people.length === 0) {
        status = 'NOT_FOUND';
        reason = 'Δεν βρέθηκε εγγραφή με αυτό το ID';
        await base44.entities.NotFoundVoter.create({
          submitted_id: submittedId,
          reason_text: reason,
          kanali_username: username
        });
      } else if (people[0].voted) {
        status = 'ALREADY_VOTED';
        reason = 'Ήδη ήταν Ψήφισε = ΝΑΙ';
        personRecordId = people[0].id;
        await base44.entities.NotFoundVoter.create({
          submitted_id: submittedId,
          reason_text: reason,
          kanali_username: username
        });
      } else {
        status = 'MARKED_VOTED';
        reason = 'Η ψήφος καταχωρήθηκε επιτυχώς';
        personRecordId = people[0].id;
        await base44.entities.Person.update(people[0].id, { 
          voted: true,
          voted_at: new Date().toISOString()
        });
      }

      // Log submission
      await base44.entities.KanaliSubmission.create({
        kanali_username: username,
        submitted_id: submittedId,
        status,
        reason_text: reason,
        person_record_id: personRecordId
      });

      return { status, reason };
    },
    onSuccess: (result) => {
      setLastResult(result);
      setInputId('');
      if (result.status === 'MARKED_VOTED') {
        toast.success('Επιτυχής καταχώρηση!');
      } else {
        toast.error(result.reason);
      }
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputId.trim()) {
      toast.error('Εισάγετε ID');
      return;
    }
    submitMutation.mutate(inputId.trim());
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Vote className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle>Καταχώρηση Ψήφου</CardTitle>
          <p className="text-slate-500 text-sm mt-2">
            Εισάγετε το ID του ψηφοφόρου
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>ID Ψηφοφόρου</Label>
              <Input
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                placeholder="Εισάγετε ID"
                className="text-center text-lg font-mono"
                autoFocus
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Επεξεργασία...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Καταχώρηση
                </>
              )}
            </Button>
          </form>

          {lastResult && (
            <Alert 
              className={`mt-6 ${
                lastResult.status === 'MARKED_VOTED' 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {lastResult.status === 'MARKED_VOTED' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={
                lastResult.status === 'MARKED_VOTED' ? 'text-emerald-700' : 'text-red-700'
              }>
                {lastResult.reason}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main Portal Component
export default function Portal() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('portal_session');
      const portalType = localStorage.getItem('portal_type');
      const username = localStorage.getItem('portal_username');
      const kanaliType = localStorage.getItem('kanali_type');

      if (!token || !portalType || !username) {
        navigate(createPageUrl('PortalLogin'));
        return;
      }

      setSession({ token, portalType, username, kanaliType });
      setLoading(false);

      // Check for push messages
      const checkMessages = async () => {
        const targetGroups = portalType === 'chreosi' ? ['chreosi', 'both'] : ['kanali', 'both'];
        const messages = await base44.entities.PushMessage.filter({ is_active: true });
        const relevantMessages = messages.filter(m => targetGroups.includes(m.target_group));
        
        for (const msg of relevantMessages) {
          const acks = await base44.entities.PushMessageAck.filter({
            message_id: msg.id,
            username
          });
          if (acks.length === 0) {
            setPushMessage(msg);
            break;
          }
        }
      };

      await checkMessages();

      // Subscribe to new push messages in real-time
      const unsubscribe = base44.entities.PushMessage.subscribe((event) => {
        if (event.type === 'create' || event.type === 'update') {
          checkMessages();
        }
      });

      return unsubscribe;
    };

    const cleanup = checkSession();
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then(fn => fn && fn());
      }
    };
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('portal_session');
    localStorage.removeItem('portal_type');
    localStorage.removeItem('portal_username');
    localStorage.removeItem('kanali_type');
    navigate(createPageUrl('PortalLogin'));
  };

  const acknowledgePushMessage = async () => {
    if (!pushMessage || !session) return;
    await base44.entities.PushMessageAck.create({
      message_id: pushMessage.id,
      recipient_type: session.portalType,
      username: session.username,
      acknowledged_at: new Date().toISOString()
    });
    // Update acknowledged count
    await base44.entities.PushMessage.update(pushMessage.id, {
      acknowledged_count: (pushMessage.acknowledged_count || 0) + 1
    });
    setPushMessage(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Vote className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-slate-900">
                {session.portalType === 'chreosi' ? 'Χρεωστικός' : 'Κανάλι'}
              </span>
              <p className="text-xs text-slate-500">{session.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter 
              userType={session.portalType} 
              username={session.username}
            />
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Αποσύνδεση
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <PullToRefresh onRefresh={async () => { window.location.reload(); }}>
          {session.portalType === 'chreosi' ? (
            <ChreosiPortal username={session.username} />
          ) : session.kanaliType === 'A' ? (
            <KanaliTypeAPortal username={session.username} />
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-500">Ο τύπος B θα είναι διαθέσιμος σύντομα.</p>
            </div>
          )}
        </PullToRefresh>
      </main>

      {/* Push Message Modal */}
      <Dialog open={!!pushMessage} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              {pushMessage?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600">{pushMessage?.body}</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={acknowledgePushMessage}>
              Εντάξει
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}