import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { PERSON_FIELD_BY_KEY } from '../../lib/personFields';

const DISPLAY_ORDER = ['person_id', 'last_name', 'first_name', 'department', 'admission_year', 'mobile_phone', 'father_name'];

function pctClass(p) {
  if (p >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (p >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

// Phase 4: shows ranked live-table candidates for one Type B submission and lets
// the admin/organotikos mark the right person voted (closing the submission).
export default function KanaliBMatchDialog({ open, onClose, submission, fields, sessionToken, onResolved }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    if (!open || !submission) return;
    setResult(null);
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('kanaliBFindMatches', { session_token: sessionToken, submission_id: submission.id });
        if (res.data?.error) throw new Error(res.data.error);
        setResult(res.data);
      } catch (e) {
        toast.error('Σφάλμα αναζήτησης: ' + (e.message || ''));
        onClose?.();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submission?.id]);

  const submittedPairs = (fields || [])
    .map((f) => ({ label: f.label || f.field_key, value: submission?.values?.[f.field_key] }))
    .filter((p) => p.value !== undefined && p.value !== null && String(p.value).trim() !== '');

  const markVoted = async (candidate) => {
    if (candidate.voted) return;
    setResolvingId(candidate.id);
    try {
      const res = await base44.functions.invoke('kanaliBResolve', {
        session_token: sessionToken, submission_id: submission.id, person_id: candidate.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data.status === 'MARKED_VOTED') toast.success('Καταχωρήθηκε η ψήφος');
      else toast.message('Ο ψηφοφόρος ήταν ήδη καταχωρημένος');
      onResolved?.();
      onClose?.();
    } catch (e) {
      toast.error('Σφάλμα: ' + (e.message || ''));
    } finally {
      setResolvingId(null);
    }
  };

  const candidates = result?.candidates || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Πιθανές αντιστοιχίσεις</DialogTitle>
          <DialogDescription>
            Επιλέξτε τον σωστό ψηφοφόρο για να καταχωρηθεί η ψήφος.
          </DialogDescription>
        </DialogHeader>

        {/* What the operator submitted */}
        <div className="flex flex-wrap gap-1.5 pb-2 border-b dark:border-slate-700">
          {submittedPairs.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
              <span className="text-slate-400">{p.label}:</span>
              <span className="text-slate-800 dark:text-slate-100 font-medium">{String(p.value)}</span>
            </span>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 py-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">Δεν βρέθηκαν πιθανές αντιστοιχίσεις</div>
          ) : (
            <>
              {result?.belowThreshold && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Καμία αντιστοίχιση πάνω από 50% — εμφανίζονται οι πιο κοντινές.
                </p>
              )}
              {candidates.map((c) => (
                <div key={c.id} className="border dark:border-slate-700 rounded-lg p-3 flex items-start gap-3">
                  <Badge className={`${pctClass(c.percent)} shrink-0 text-sm`}>{c.percent}%</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {c.display.last_name} {c.display.first_name}
                      {c.voted && <Badge className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ψήφισε</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {DISPLAY_ORDER.filter((k) => !['last_name', 'first_name'].includes(k)).map((k) => {
                        const v = c.display[k];
                        if (v === null || v === undefined || String(v).trim() === '') return null;
                        const label = PERSON_FIELD_BY_KEY[k]?.label || k;
                        if (k === 'mobile_phone') {
                          return (
                            <a key={k} href={`tel:${v}`} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5">
                              <Phone className="h-3 w-3" />{String(v)}
                            </a>
                          );
                        }
                        return (
                          <span key={k} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
                            <span className="text-slate-400">{label}:</span>
                            <span className="text-slate-700 dark:text-slate-200">{String(v)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={c.voted || resolvingId === c.id}
                    onClick={() => markVoted(c)}
                  >
                    {resolvingId === c.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    {c.voted ? 'Ήδη ψήφισε' : 'Καταχώρηση Ψήφου'}
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
