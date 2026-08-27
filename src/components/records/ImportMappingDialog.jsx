import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ArrowRight } from 'lucide-react';

const NEW = '__new__';
const SKIP = '__skip__';

// Map-on-import: each file column → an existing column, a new field, or skip.
export default function ImportMappingDialog({
  open, onOpenChange, headers = [], defaultMapping = {}, existingColumns = [], total = 0, busy, onConfirm,
}) {
  const [mapping, setMapping] = useState({});

  useEffect(() => { if (open) setMapping({ ...defaultMapping }); }, [open, JSON.stringify(defaultMapping)]);

  const setTarget = (header, target) => setMapping(m => ({ ...m, [header]: target }));

  const counts = headers.reduce((acc, h) => {
    const t = mapping[h];
    if (t === NEW) acc.created++;
    else if (t === SKIP || !t) acc.skipped++;
    else acc.mapped++;
    return acc;
  }, { created: 0, mapped: 0, skipped: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Αντιστοίχιση στηλών — {total} εγγραφές</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          Επιλέξτε πού πηγαίνει κάθε στήλη του αρχείου: σε υπάρχουσα στήλη, ως νέο πεδίο, ή παράλειψη.
        </p>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mt-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Στήλη αρχείου</th>
                <th className="px-2 w-6" />
                <th className="text-left px-3 py-2 font-medium">Προορισμός</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-700 dark:text-slate-200 truncate max-w-[220px]" title={h}>{h}</td>
                  <td className="px-2 text-slate-300"><ArrowRight className="h-3.5 w-3.5" /></td>
                  <td className="px-3 py-1.5">
                    <Select value={mapping[h] || NEW} onValueChange={(v) => setTarget(h, v)}>
                      <SelectTrigger className="h-7 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW}>➕ Νέο πεδίο</SelectItem>
                        <SelectItem value={SKIP}>— Παράλειψη —</SelectItem>
                        {existingColumns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>{c.label || c.key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {counts.mapped} σε υπάρχουσες · {counts.created} νέα πεδία · {counts.skipped} παράλειψη
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Ακύρωση</Button>
          <Button onClick={() => onConfirm(mapping)} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Εισαγωγή...</> : 'Εισαγωγή'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
