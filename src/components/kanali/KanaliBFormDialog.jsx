import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { PERSON_FIELDS, PERSON_FIELD_BY_KEY } from '../../lib/personFields';

const INPUT_TYPES = [
  { value: 'text', label: 'Κείμενο' },
  { value: 'number', label: 'Αριθμός' },
  { value: 'date', label: 'Ημερομηνία' },
  { value: 'dropdown', label: 'Λίστα επιλογών' },
  { value: 'yesno', label: 'Ναι/Όχι' },
];

// The shared Kanali Τύπος B form builder. Admins define which Person fields the
// operator fills in, their input type, whether they are required, and how they
// participate in matching (hard filter vs fuzzy weight).
export default function KanaliBFormDialog({ open, onClose, sessionToken }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addKey, setAddKey] = useState('');

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke('kanaliBFormGet', { session_token: sessionToken });
      if (data?.error) throw new Error(data.error);
      setFields((data.fields || []).map((f) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label || f.field_key,
        input_type: f.input_type || 'text',
        required: !!f.required,
        weight: Number(f.weight) || 1,
        match_role: f.match_role || 'fuzzy',
        options: Array.isArray(f.options) ? f.options : [],
      })));
    } catch (e) {
      toast.error('Αποτυχία φόρτωσης φόρμας: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const usedKeys = new Set(fields.map((f) => f.field_key));
  const available = PERSON_FIELDS.filter((f) => !usedKeys.has(f.key));

  const addField = () => {
    if (!addKey) return;
    const pf = PERSON_FIELD_BY_KEY[addKey];
    setFields((prev) => [...prev, {
      field_key: addKey, label: pf?.label || addKey, input_type: 'text',
      required: false, weight: 1, match_role: 'fuzzy', options: [],
    }]);
    setAddKey('');
  };

  const update = (i, patch) => setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i) => setFields((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i, dir) => setFields((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const loadDropdownOptions = async (i, key) => {
    try {
      const { data } = await base44.functions.invoke('personGridFilterValues', {
        session_token: sessionToken, columnKey: key, searchText: '', partition: 'all',
      });
      if (data?.requiresSearch) { toast.message('Πολλές τιμές — δεν φορτώθηκε λίστα'); return; }
      update(i, { options: data?.values || [] });
      toast.success(`Φορτώθηκαν ${(data?.values || []).length} τιμές`);
    } catch (e) {
      toast.error('Αποτυχία φόρτωσης τιμών');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = fields.map((f, i) => ({ ...f, weight: Math.max(1, Number(f.weight) || 1), sort_order: i }));
      const { data } = await base44.functions.invoke('kanaliBFormSave', { session_token: sessionToken, fields: payload });
      if (data?.error) throw new Error(data.error);
      toast.success('Η φόρμα αποθηκεύτηκε');
      onClose?.();
    } catch (e) {
      toast.error('Αποτυχία αποθήκευσης: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Φόρμα Τύπου B</DialogTitle>
          <DialogDescription>
            Η κοινή φόρμα που συμπληρώνουν οι χρήστες Τύπου B. Επιλέξτε πεδία, τύπο εισαγωγής, βαρύτητα και ρόλο αντιστοίχισης
            (σκληρό φίλτρο = πρέπει να ταιριάζει ακριβώς· ασαφές = μετράει στο ποσοστό).
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-3 py-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
              {fields.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                  Δεν υπάρχουν πεδία ακόμη. Προσθέστε πεδία από την λίστα παρακάτω.
                </p>
              )}
              {fields.map((f, i) => (
                <div key={f.field_key} className="border dark:border-slate-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 shrink-0">{f.field_key}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                      <button className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                      <button className="p-1 text-red-500 hover:text-red-700" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Ετικέτα</Label>
                      <Input value={f.label} onChange={(e) => update(i, { label: e.target.value })} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Τύπος εισαγωγής</Label>
                      <Select value={f.input_type} onValueChange={(v) => update(i, { input_type: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INPUT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Ρόλος αντιστοίχισης</Label>
                      <Select value={f.match_role} onValueChange={(v) => update(i, { match_role: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hard">Σκληρό φίλτρο (ακριβές)</SelectItem>
                          <SelectItem value="fuzzy">Ασαφές (βαρύτητα)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Βαρύτητα</Label>
                      <Input type="number" min={1} value={f.weight} onChange={(e) => update(i, { weight: e.target.value })} className="h-8" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={f.required} onCheckedChange={(v) => update(i, { required: v })} />
                      <span className="text-sm">Υποχρεωτικό</span>
                    </label>
                    {f.input_type === 'dropdown' && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => loadDropdownOptions(i, f.field_key)}>
                        Φόρτωση τιμών {f.options?.length ? `(${f.options.length})` : ''}
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1">
                <Select value={addKey} onValueChange={setAddKey}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Προσθήκη πεδίου..." /></SelectTrigger>
                  <SelectContent>
                    {available.length === 0
                      ? <div className="px-2 py-1.5 text-sm text-slate-400">Όλα τα πεδία προστέθηκαν</div>
                      : available.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={addField} disabled={!addKey}><Plus className="h-4 w-4 mr-1" />Προσθήκη</Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose?.()}>Ακύρωση</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
