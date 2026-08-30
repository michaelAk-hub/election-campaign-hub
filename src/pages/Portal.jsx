import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  MessageSquare,
  Loader2,
  Trash2
} from 'lucide-react';
import NotificationCenter from '../components/notifications/NotificationCenter';
import PullToRefresh from '../components/common/PullToRefresh';
import { DEFAULT_PORTAL_FIELDS, PERSON_FIELD_BY_KEY } from '../lib/personFields';
import { toast } from 'sonner';

// Format a Person field value for read-only display in the portal card.
function formatFieldValue(key, val) {
  if (val === null || val === undefined || val === '') return '';
  const f = PERSON_FIELD_BY_KEY[key];
  if (f?.type === 'boolean' || key === 'voted') return (val === true || val === 'true') ? 'ΝΑΙ' : 'ΟΧΙ';
  return String(val);
}

// Fields with bespoke rendering (name → heading, phone → call button,
// notes → editable box); everything else shows as a read-only badge.
const SPECIAL_FIELD_KEYS = new Set(['last_name', 'first_name', 'mobile_phone', 'phone', 'notes']);

function normalizeUsername(str) {
  return str?.trim().replace(/\s+/g, ' ') || '';
}

// Chreosi Portal Component — backend-driven, no client-side Person table scan
function ChreosiPortal({ username }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [votedTab, setVotedTab] = useState('all'); // 'all' | 'not_voted' | 'voted'
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesValue, setNotesValue] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [savingPersonalNote, setSavingPersonalNote] = useState(false);

  const sessionToken = localStorage.getItem('portal_session') || '';

  const { data: portalData, isLoading, refetch } = useQuery({
    queryKey: ['chreosi-portal-people', username, search, deptFilter, yearFilter, votedTab],
    queryFn: async () => {
      const res = await base44.functions.invoke('chreosiPortalPeople', {
        session_token: sessionToken,
        username,
        search,
        dept_filter: deptFilter,
        year_filter: yearFilter,
        voted_tab: votedTab,
      });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Load failed');
      return d;
    },
    enabled: !!sessionToken && !!username,
  });

  const people = portalData?.people || [];
  const account = portalData?.account || null;
  const availableDepts = portalData?.availableDepts || [];
  const availableYears = portalData?.availableYears || [];

  // Sync personalNote when account loads
  React.useEffect(() => {
    if (account) setPersonalNote(account.personal_note || '');
  }, [account?.id]);

  const savePersonalNote = async () => {
    setSavingPersonalNote(true);
    try {
      const res = await base44.functions.invoke('chreosiPortalActions', {
        action: 'save_personal_note',
        session_token: sessionToken,
        note: personalNote,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Save failed');
      toast.success('Οι προσωπικές σημειώσεις αποθηκεύτηκαν');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Σφάλμα αποθήκευσης');
    } finally {
      setSavingPersonalNote(false);
    }
  };

  // Checkmark state managed locally for optimistic UI
  const [checkmarkMap, setCheckmarkMap] = React.useState(new Map());

  React.useEffect(() => {
    // Build checkmark map from portalData if included, or keep local state
    if (portalData?.checkmarks) {
      setCheckmarkMap(new Map(portalData.checkmarks.map(c => [c.person_record_id, c.checked])));
    }
  }, [portalData?.checkmarks]);

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }) => {
      const res = await base44.functions.invoke('chreosiPortalActions', {
        action: 'update_person_note',
        session_token: sessionToken,
        person_id: id,
        notes,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Save failed');
    },
    onSuccess: () => {
      refetch();
      setEditingNotes(null);
      toast.success('Οι σημειώσεις αποθηκεύτηκαν');
    },
    onError: (err) => toast.error(err.message || 'Σφάλμα αποθήκευσης'),
  });

  const toggleCheckmarkMutation = useMutation({
    mutationFn: async ({ personId, checked }) => {
      const res = await base44.functions.invoke('chreosiPortalActions', {
        action: 'toggle_checkmark',
        session_token: sessionToken,
        person_id: personId,
        checked,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || 'Toggle failed');
    },
    onMutate: async ({ personId, checked }) => {
      // Optimistic update
      setCheckmarkMap(prev => {
        const next = new Map(prev);
        next.set(personId, checked);
        return next;
      });
    },
    onError: (_err, { personId, checked }) => {
      // Revert on error
      setCheckmarkMap(prev => {
        const next = new Map(prev);
        next.set(personId, !checked);
        return next;
      });
      toast.error('Σφάλμα ενημέρωσης');
    },
  });

  const noAccess = account && (!account.allowed_prediction_symbols?.length || !account.allowed_voted_statuses?.length);

  // Which live fields this account may see. Empty => historical fixed layout.
  const visibleFields = (account?.visible_fields?.length ? account.visible_fields : DEFAULT_PORTAL_FIELDS);
  const visSet = new Set(visibleFields);
  const showNotes = visSet.has('notes');
  const personHeading = (p) => {
    const parts = [];
    if (visSet.has('last_name')) parts.push(p.last_name);
    if (visSet.has('first_name')) parts.push(p.first_name);
    const name = parts.filter(Boolean).join(' ');
    return name || (p.person_id ? `#${p.person_id}` : 'Εγγραφή');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {noAccess && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Δεν έχετε πρόσβαση σε εγγραφές. Επικοινωνήστε με τον διαχειριστή.</AlertDescription>
        </Alert>
      )}

      {/* Voted tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        {[
          { value: 'all', label: 'Όλοι' },
          { value: 'not_voted', label: 'Δεν Ψήφισαν' },
          { value: 'voted', label: 'Ψήφισαν' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setVotedTab(tab.value)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              votedTab === tab.value
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Τμήμα" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλα τα τμήματα</SelectItem>
            {availableDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Έτος" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλα τα έτη</SelectItem>
            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Personal Note */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
        <h3 className="font-semibold text-amber-900 dark:text-amber-300 mb-2 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Προσωπικές Σημειώσεις
        </h3>
        <Textarea
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          placeholder="Γράψτε τις προσωπικές σας σημειώσεις εδώ..."
          rows={3}
          className="mb-3 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-600"
        />
        <div className="flex justify-end">
          <Button onClick={savePersonalNote} disabled={savingPersonalNote} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
            {savingPersonalNote ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Αποθήκευση
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>{people.length} άτομα</span>
      </div>

      <div className="space-y-3">
        {people.map(person => {
          const phoneKey = (visSet.has('mobile_phone') && person.mobile_phone) ? 'mobile_phone'
            : (visSet.has('phone') && person.phone) ? 'phone' : null;
          const phoneVal = phoneKey ? person[phoneKey] : null;
          return (
          <Card key={person.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Checkbox
                  checked={checkmarkMap.get(person.id) || false}
                  onCheckedChange={(checked) => toggleCheckmarkMutation.mutate({ personId: person.id, checked })}
                  className="mt-1 h-7 w-7 rounded-md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {personHeading(person)}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {visibleFields.filter(k => !SPECIAL_FIELD_KEYS.has(k)).map(k => {
                          if (k === 'voted') {
                            return person.voted
                              ? <Badge key={k} className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ψήφισε</Badge>
                              : <Badge key={k} variant="outline">Δεν ψήφισε</Badge>;
                          }
                          const v = formatFieldValue(k, person[k]);
                          if (!v) return null;
                          const label = PERSON_FIELD_BY_KEY[k]?.label || k;
                          return (
                            <Badge key={k} variant="outline">
                              <span className="text-slate-400 dark:text-slate-500 mr-1">{label}:</span>{v}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                    {phoneVal && (
                      <a
                        href={`tel:${phoneVal}`}
                        className="flex items-center gap-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Phone className="h-4 w-4" />
                        <span className="text-sm">{phoneVal}</span>
                      </a>
                    )}
                  </div>
                  {showNotes && (
                    <div className="mt-3">
                      <div
                        className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg -ml-2"
                        onClick={() => { setEditingNotes(person); setNotesValue(person.notes || ''); }}
                      >
                        {person.notes
                          ? <p className="dark:text-slate-300">{person.notes}</p>
                          : <p className="text-slate-400 dark:text-slate-500 italic">Κλικ για προσθήκη σημειώσεων...</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}

        {people.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <User className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <p>Δεν βρέθηκαν άτομα</p>
          </div>
        )}
      </div>

      {/* Edit Notes Dialog */}
      <Dialog open={!!editingNotes} onOpenChange={() => setEditingNotes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Σημειώσεις{editingNotes ? ` - ${personHeading(editingNotes)}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Γράψτε σημειώσεις..." rows={5} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingNotes(null)}>Ακύρωση</Button>
            <Button onClick={() => updateNotesMutation.mutate({ id: editingNotes.id, notes: notesValue })} disabled={updateNotesMutation.isPending}>Αποθήκευση</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Kanali Type A Portal Component
function KanaliTypeAPortal({ username }) {
  const navigate = useNavigate();
  const [inputId, setInputId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const submitMutation = useMutation({
    mutationFn: async (submittedId) => {
      const sessionToken = localStorage.getItem('portal_session');
      const response = await base44.functions.invoke('submitKanaliVote', {
        submittedId,
        username,
        sessionToken
      });
      if (response.data.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setInputId('');
      if (result.status === 'MARKED_VOTED') {
        toast.success('Επιτυχής καταχώρηση!');
      } else {
        toast.error(result.reason);
      }
    },
    onError: (error) => {
      const msg = error.message || '';
      if (msg.includes('Invalid or expired session') || msg.includes('Session expired')) {
        toast.error('Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.');
        ['portal_session', 'portal_type', 'portal_username', 'kanali_type'].forEach(k => localStorage.removeItem(k));
        navigate(createPageUrl('PortalLogin'));
      } else {
        toast.error('Σφάλμα: ' + (msg || 'Άγνωστο σφάλμα'));
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
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <Vote className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle>Καταχώρηση Ψήφου</CardTitle>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            Εισάγετε τον Μοναδικό αριθμό του ψηφοφόρου
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>ID Ψηφοφόρου</Label>
              <Input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="Εισάγετε Μοναδικό Αριθμό"
              className="text-center text-lg font-mono"
              inputMode="numeric"
              pattern="[0-9]*"
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
                  ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-900' 
                  : 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-900'
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

// Kanali Type B Portal — fills in the shared form and submits it for later
// identification. The operator never sees matches or vote status.
function KanaliTypeBPortal({ username }) {
  const sessionToken = localStorage.getItem('portal_session') || '';
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['kanali-b-form', username],
    queryFn: async () => {
      const res = await base44.functions.invoke('kanaliBFormGet', { username, sessionToken });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!sessionToken && !!username,
  });
  const fields = data?.fields || [];

  const setVal = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const renderInput = (f) => {
    const v = values[f.field_key] ?? '';
    if (f.input_type === 'dropdown') {
      return (
        <Select value={String(v)} onValueChange={(val) => setVal(f.field_key, val)}>
          <SelectTrigger><SelectValue placeholder="Επιλέξτε..." /></SelectTrigger>
          <SelectContent>
            {(f.options || []).map((opt) => <SelectItem key={String(opt)} value={String(opt)}>{String(opt)}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (f.input_type === 'yesno') {
      return (
        <Select value={String(v)} onValueChange={(val) => setVal(f.field_key, val)}>
          <SelectTrigger><SelectValue placeholder="Επιλέξτε..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ΝΑΙ">Ναι</SelectItem>
            <SelectItem value="ΟΧΙ">Όχι</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    const type = f.input_type === 'number' ? 'number' : f.input_type === 'date' ? 'date' : 'text';
    return (
      <Input
        type={type}
        inputMode={f.input_type === 'number' ? 'numeric' : undefined}
        value={v}
        onChange={(e) => setVal(f.field_key, e.target.value)}
      />
    );
  };

  const submit = async () => {
    const missing = fields.filter((f) => f.required && !String(values[f.field_key] ?? '').trim()).map((f) => f.label || f.field_key);
    if (missing.length) { toast.error('Συμπληρώστε: ' + missing.join(', ')); return; }
    if (!Object.values(values).some((v) => String(v ?? '').trim())) { toast.error('Συμπληρώστε τουλάχιστον ένα πεδίο'); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('submitKanaliBForm', { username, sessionToken, values });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Καταχωρήθηκε');
      setValues({}); // clear for the next submission
    } catch (e) {
      toast.error('Σφάλμα: ' + (e.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }
  if (fields.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Η φόρμα δεν έχει ρυθμιστεί ακόμη. Επικοινωνήστε με τον διαχειριστή.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle>Καταχώρηση Στοιχείων</CardTitle>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Συμπληρώστε όσα στοιχεία γνωρίζετε</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((f) => (
            <div key={f.field_key} className="space-y-1.5">
              <Label>{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
              {renderInput(f)}
            </div>
          ))}
          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Καταχώρηση...</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Καταχώρηση</>}
          </Button>
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
  const pushExpireTimerRef = React.useRef(null);

  // Immediate disappear when shown push message reaches expiry
  useEffect(() => {
    if (pushExpireTimerRef.current) clearTimeout(pushExpireTimerRef.current);
    if (!pushMessage || !pushMessage.expires_at) return;
    const msUntilExpiry = new Date(pushMessage.expires_at).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      setPushMessage(null);
      return;
    }
    pushExpireTimerRef.current = setTimeout(() => {
      setPushMessage(null);
    }, msUntilExpiry);
    return () => {
      if (pushExpireTimerRef.current) clearTimeout(pushExpireTimerRef.current);
    };
  }, [pushMessage?.id, pushMessage?.expires_at]);

  useEffect(() => {
    let unsubscribePushMessages = null;

    const checkSession = async () => {
      const token = localStorage.getItem('portal_session');
      const portalType = localStorage.getItem('portal_type');
      const username = localStorage.getItem('portal_username');
      const kanaliType = localStorage.getItem('kanali_type');

      if (!token || !portalType || !username) {
        navigate(createPageUrl('PortalLogin'));
        return;
      }

      // Server-side session validation — localStorage is only a cache, not proof of auth
      const validationResponse = await base44.functions.invoke('validatePortalSession', {
        sessionToken: token,
        username,
        portalType
      });

      if (!validationResponse.data?.valid) {
        ['portal_session', 'portal_type', 'portal_username', 'kanali_type'].forEach(k => localStorage.removeItem(k));
        navigate(createPageUrl('PortalLogin'));
        return;
      }

      const validated = validationResponse.data;
      setSession({
        token,
        portalType: validated.portalType,
        username: validated.username,
        kanaliType: validated.kanaliType || kanaliType
      });
      setLoading(false);

      // Bug 4: use validated canonical values, not raw localStorage
      const validatedUsername = validated.username;

      // Fetch the first unacknowledged push message targeted at this portal user.
      // All targeting/expiry/ack filtering runs server-side (portal-authed).
      const checkMessages = async () => {
        const token = localStorage.getItem('portal_session');
        const { data } = await base44.functions.invoke('portalPushMessages', {
          sessionToken: token,
          username: validatedUsername,
        });
        setPushMessage(prev => {
          const next = data?.message || null;
          // Keep the current one if it's still the same (avoid flicker); otherwise update.
          if (prev && next && prev.id === next.id) return prev;
          return next;
        });
      };

      await checkMessages();

      // No realtime in the shim — poll so new broadcasts / disables appear without a refresh.
      const pollId = setInterval(checkMessages, 20000);
      unsubscribePushMessages = () => clearInterval(pollId);
    };

    checkSession();

    return () => {
      if (unsubscribePushMessages) unsubscribePushMessages();
    };
  }, [navigate]);

  const handleLogout = async () => {
    const token = localStorage.getItem('portal_session');
    const username = localStorage.getItem('portal_username');
    if (token && username) {
      await base44.functions.invoke('portalLogout', { sessionToken: token, username }).catch(() => {});
    }
    ['portal_session', 'portal_type', 'portal_username', 'kanali_type'].forEach(k => localStorage.removeItem(k));
    navigate(createPageUrl('PortalLogin'));
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await base44.functions.invoke('chreosiPortalActions', {
        action: 'deactivate_self',
        session_token: session.token,
      });
    } catch (err) {
      console.error('Deactivate self error:', err);
    } finally {
      ['portal_session', 'portal_type', 'portal_username', 'kanali_type'].forEach(k => localStorage.removeItem(k));
      navigate(createPageUrl('PortalLogin'));
    }
  };

  const acknowledgePushMessage = async () => {
    if (!pushMessage || !session) return;
    await base44.functions.invoke('portalAcknowledgePushMessage', {
      sessionToken: session.token,
      username: session.username,
      messageId: pushMessage.id
    });
    setPushMessage(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Vote className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {session.portalType === 'chreosi' ? 'Χρεωστικός' : 'Κανάλι'}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{session.username}</p>
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
          ) : String(session.kanaliType).toUpperCase() === 'A' ? (
            <KanaliTypeAPortal username={session.username} />
          ) : String(session.kanaliType).toUpperCase() === 'B' ? (
            <KanaliTypeBPortal username={session.username} />
          ) : (
           <div className="text-center py-12">
             <p className="text-slate-500 dark:text-slate-400">Ο τύπος B θα είναι διαθέσιμος σύντομα.</p>
           </div>
          )}
        </PullToRefresh>
      </main>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <DialogTitle className="text-xl">Διαγραφή Λογαριασμού</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Είστε σίγουροι ότι θέλετε να απενεργοποιήσετε μόνιμα τον λογαριασμό σας; Δεν θα μπορείτε να συνδεθείτε ξανά.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deletingAccount} className="w-full">
              Ακύρωση
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deletingAccount} className="w-full">
              {deletingAccount ? 'Απενεργοποίηση...' : 'Διαγραφή Λογαριασμού'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push Message Modal */}
      <Dialog open={!!pushMessage} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {pushMessage?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 dark:text-slate-400">{pushMessage?.body}</p>
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