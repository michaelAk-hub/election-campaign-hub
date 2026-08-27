import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Lock, Trash2, ChevronUp, ChevronDown, Plus, Loader2, AlertTriangle } from 'lucide-react';

const TYPE_LABELS = { text: 'Κείμενο', number: 'Αριθμός', date: 'Ημερομηνία', boolean: 'Ναι/Όχι', select: 'Λίστα' };
const TYPES = ['text', 'number', 'date', 'boolean', 'select'];

const sessionToken = () => localStorage.getItem('app_session_token');
const call = async (op, extra = {}) => {
  const { data } = await base44.functions.invoke('schemaAdmin', { session_token: sessionToken(), op, ...extra });
  if (data?.error) throw new Error(data.error);
  return data?.result;
};

// MS-Access-style Design View for the shared column schema (ColumnDef).
// Governs all tables (live + scratch). Mandatory fields are locked.
export default function SchemaDesignDialog({ open, onOpenChange, onSchemaChanged }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState('text');
  const [adding, setAdding] = useState(false);
  const [blockDialog, setBlockDialog] = useState(null); // { field, type, offending }

  const load = useCallback(async () => {
    setLoading(true);
    try { setFields(await call('list')); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const notifyChanged = () => onSchemaChanged?.();

  const handleLabelBlur = async (field, label) => {
    if (label === field.label || field.mandatory) return;
    try {
      await call('updateField', { id: field.id, label });
      setFields(f => f.map(x => x.id === field.id ? { ...x, label } : x));
      notifyChanged();
    } catch (e) { toast.error(e.message); load(); }
  };

  const handleTypeChange = async (field, type, force = false) => {
    if (type === field.type) return;
    setBusyId(field.id);
    try {
      const res = await call('updateField', { id: field.id, type, force });
      if (res?.blocked) {
        setBlockDialog({ field, type, offending: res.offending || [] });
        return;
      }
      setFields(f => f.map(x => x.id === field.id ? { ...x, type } : x));
      setBlockDialog(null);
      notifyChanged();
      toast.success('Ο τύπος ενημερώθηκε');
    } catch (e) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (field) => {
    setBusyId(field.id);
    try {
      const { withValue } = await call('countFieldData', { id: field.id });
      const ok = window.confirm(
        `Διαγραφή του πεδίου «${field.label || field.key}».\n\n` +
        `Θα διαγραφούν οριστικά τα δεδομένα αυτού του πεδίου σε ${withValue} εγγραφές. Συνέχεια;`
      );
      if (!ok) { setBusyId(null); return; }
      await call('deleteField', { id: field.id });
      setFields(f => f.filter(x => x.id !== field.id));
      notifyChanged();
      toast.success('Το πεδίο διαγράφηκε');
    } catch (e) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setFields(next);
    try { await call('reorder', { order: next.map(f => f.id) }); notifyChanged(); }
    catch (e) { toast.error(e.message); load(); }
  };

  const handleAdd = async () => {
    if (!newKey.trim() && !newLabel.trim()) return;
    setAdding(true);
    try {
      const key = (newKey.trim() || newLabel.trim()).replace(/[^\w]/g, '_');
      const created = await call('addField', { key, label: newLabel.trim() || key, type: newType });
      setFields(f => [...f, created]);
      setNewLabel(''); setNewKey(''); setNewType('text');
      notifyChanged();
      toast.success('Το πεδίο προστέθηκε');
    } catch (e) { toast.error(e.message); }
    finally { setAdding(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Σχεδίαση Πινάκων — Πεδία & Τύποι</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-2">
            Ισχύει για όλους τους πίνακες (ζωντανό + πρόχειρους). Τα υποχρεωτικά πεδία
            <Lock className="inline h-3 w-3 mx-1" />είναι κλειδωμένα.
          </p>

          {loading ? (
            <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Όνομα</th>
                    <th className="text-left px-3 py-2 font-medium">Κλειδί</th>
                    <th className="text-left px-3 py-2 font-medium">Τύπος</th>
                    <th className="px-3 py-2 font-medium w-28">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => (
                    <tr key={f.id} className="border-t border-slate-100 dark:border-slate-700/50">
                      <td className="px-3 py-1.5">
                        {f.mandatory ? (
                          <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                            <Lock className="h-3 w-3 text-slate-400" /> {f.label || f.key}
                          </span>
                        ) : (
                          <Input
                            defaultValue={f.label || ''}
                            className="h-7"
                            onBlur={(e) => handleLabelBlur(f, e.target.value)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 font-mono text-xs">{f.key}</td>
                      <td className="px-3 py-1.5">
                        {f.mandatory ? (
                          <Badge variant="secondary" className="font-normal">{TYPE_LABELS[f.type] || f.type}</Badge>
                        ) : (
                          <Select value={f.type} onValueChange={(v) => handleTypeChange(f, v)} disabled={busyId === f.id}>
                            <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          {f.mandatory ? (
                            <span className="w-7 inline-flex justify-center"><Lock className="h-3.5 w-3.5 text-slate-300" /></span>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDelete(f)} disabled={busyId === f.id}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add new field */}
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-slate-500">Όνομα (εμφάνιση)</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-8" placeholder="π.χ. Παρατηρήσεις" />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-slate-500">Κλειδί (προαιρετικό)</label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} className="h-8" placeholder="auto" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block">Τύπος</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={adding || (!newLabel.trim() && !newKey.trim())} className="h-8">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Προσθήκη</>}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Κλείσιμο</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Type-change blocked: existing values don't convert */}
      <Dialog open={!!blockDialog} onOpenChange={(o) => { if (!o) setBlockDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Δεν είναι δυνατή η αλλαγή τύπου
            </DialogTitle>
          </DialogHeader>
          {blockDialog && (
            <div className="space-y-3 text-sm">
              <p>
                Ορισμένες τιμές του πεδίου «{blockDialog.field.label || blockDialog.field.key}» δεν
                μετατρέπονται σε <strong>{TYPE_LABELS[blockDialog.type]}</strong>:
              </p>
              <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr><th className="text-left px-2 py-1">Εγγραφή</th><th className="text-left px-2 py-1">Τιμή</th></tr>
                  </thead>
                  <tbody>
                    {blockDialog.offending.map((o, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="px-2 py-1">{[o.last_name, o.first_name].filter(Boolean).join(' ') || o.person_id || o.id}</td>
                        <td className="px-2 py-1 font-mono">{String(o.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                Διορθώστε αυτές τις τιμές πρώτα, ή εφαρμόστε αναγκαστικά (οι μη έγκυρες τιμές μπορεί να χαθούν).
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialog(null)}>Ακύρωση</Button>
            <Button
              variant="destructive"
              onClick={() => handleTypeChange(blockDialog.field, blockDialog.type, true)}
              disabled={busyId === blockDialog?.field?.id}
            >
              Εφαρμογή αναγκαστικά
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
