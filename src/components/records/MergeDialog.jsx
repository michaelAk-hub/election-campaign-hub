import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, ArrowRight } from 'lucide-react';

const NEW = '__new__';
const SKIP = '__skip__';
const sessionToken = () => localStorage.getItem('app_session_token');
const norm = (s) => String(s ?? '').trim().toLowerCase();

// Merge one scratch table into the live roll (mapping + conflict fill rule).
export default function MergeDialog({ open, onOpenChange, scratchDatasetId, scratchName, scratchColumns = [], onDone }) {
  const queryClient = useQueryClient();
  const [liveCols, setLiveCols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [targetMode, setTargetMode] = useState('append'); // 'append' | 'new'
  const [newName, setNewName] = useState('');
  const [activate, setActivate] = useState(true);
  const [primary, setPrimary] = useState('live'); // 'live' | 'scratch'
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const rows = await base44.entities.ColumnDef.filter({ table_key: 'live' }, 'sort_order', 1000, 0);
        const cols = (rows || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setLiveCols(cols);
        // Default mapping: match each scratch column to a live field by key/label.
        const byKey = new Map(cols.map(c => [c.key, c]));
        const byNorm = new Map();
        for (const c of cols) { byNorm.set(norm(c.key), c); if (c.label) byNorm.set(norm(c.label), c); }
        const m = {};
        for (const sc of scratchColumns) {
          const match = byKey.get(sc.key) || byNorm.get(norm(sc.key)) || byNorm.get(norm(sc.label));
          m[sc.key] = match ? match.key : NEW;
        }
        setMapping(m);
      } catch (e) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [open, scratchDatasetId]);

  const setTarget = (scol, val) => setMapping(m => ({ ...m, [scol]: val }));

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await base44.functions.invoke('mergeScratchToLive', {
        session_token: sessionToken(),
        scratch_dataset_id: scratchDatasetId,
        target: { mode: targetMode, name: newName.trim() || undefined, activate },
        mapping,
        conflict: { primary },
      });
      if (data?.error) throw new Error(data.error);
      toast.success(`Συγχώνευση: ${data.inserted} νέες, ${data.merged} ενημερώθηκαν`);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['columnDefs', 'live'] });
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error('Αποτυχία συγχώνευσης: ' + (e.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Συγχώνευση «{scratchName}» στον ζωντανό πίνακα</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Target */}
            <div>
              <div className="font-medium mb-1">Προορισμός</div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={targetMode === 'append'} onChange={() => setTargetMode('append')} />
                  Προσθήκη στον ενεργό ζωντανό πίνακα
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={targetMode === 'new'} onChange={() => setTargetMode('new')} />
                  Νέος ζωντανός πίνακας:
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7 w-48" placeholder="όνομα" disabled={targetMode !== 'new'} />
                </label>
                {targetMode === 'new' && (
                  <label className="flex items-center gap-2 ml-6 text-xs text-slate-500">
                    <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                    Ενεργοποίηση αμέσως (γίνεται ο ενεργός πίνακας)
                  </label>
                )}
              </div>
            </div>

            {/* Conflict rule */}
            <div>
              <div className="font-medium mb-1">Για ΑΤ που υπάρχουν ήδη</div>
              <p className="text-xs text-slate-500 mb-1.5">
                Ο κύριος πίνακας κρατά τις τιμές του· τα κενά κελιά συμπληρώνονται από τον δευτερεύοντα.
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={primary === 'live'} onChange={() => setPrimary('live')} />
                  Κύριος: Ζωντανός
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={primary === 'scratch'} onChange={() => setPrimary('scratch')} />
                  Κύριος: Πρόχειρος
                </label>
              </div>
            </div>

            {/* Column mapping */}
            <div>
              <div className="font-medium mb-1">Αντιστοίχιση στηλών → πεδία ζωντανού</div>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Στήλη πρόχειρου</th>
                      <th className="px-2 w-6" />
                      <th className="text-left px-3 py-1.5 font-medium">Πεδίο ζωντανού</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scratchColumns.map((sc) => (
                      <tr key={sc.key} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="px-3 py-1.5 truncate max-w-[220px]" title={sc.label || sc.key}>{sc.label || sc.key}</td>
                        <td className="px-2 text-slate-300"><ArrowRight className="h-3.5 w-3.5" /></td>
                        <td className="px-3 py-1.5">
                          <Select value={mapping[sc.key] || NEW} onValueChange={(v) => setTarget(sc.key, v)}>
                            <SelectTrigger className="h-7 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NEW}>➕ Νέο πεδίο ζωντανού</SelectItem>
                              <SelectItem value={SKIP}>— Παράλειψη —</SelectItem>
                              {liveCols.map((c) => (
                                <SelectItem key={c.key} value={c.key}>{c.label || c.key}{c.mandatory ? ' ★' : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-1">Ο πρόχειρος πίνακας παραμένει ως έχει μετά τη συγχώνευση.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Ακύρωση</Button>
          <Button onClick={run} disabled={busy || loading}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Συγχώνευση...</> : 'Συγχώνευση'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
