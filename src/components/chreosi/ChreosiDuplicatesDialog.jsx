import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ChreosiDuplicatesDialog({ open, onClose, duplicateGroups = [], sessionToken, onDone }) {
  const [mergeState, setMergeState] = useState({}); // groupIdx -> { keeperId, mergeIds: [] }
  const [merging, setMerging] = useState(false);
  const [doneGroups, setDoneGroups] = useState([]);

  const pendingGroups = duplicateGroups.filter((_, i) => !doneGroups.includes(i));

  const setKeeper = (groupIdx, accountId) => {
    setMergeState(prev => {
      const current = prev[groupIdx] || { keeperId: null, mergeIds: [] };
      const group = duplicateGroups[groupIdx];
      return {
        ...prev,
        [groupIdx]: {
          keeperId: accountId,
          // Auto-select all non-keeper as merge targets
          mergeIds: group.accounts.filter(a => a.id !== accountId).map(a => a.id),
        }
      };
    });
  };

  const toggleMergeId = (groupIdx, accountId) => {
    setMergeState(prev => {
      const current = prev[groupIdx] || { keeperId: null, mergeIds: [] };
      const already = current.mergeIds.includes(accountId);
      return {
        ...prev,
        [groupIdx]: {
          ...current,
          mergeIds: already
            ? current.mergeIds.filter(id => id !== accountId)
            : [...current.mergeIds, accountId],
        }
      };
    });
  };

  const handleMergeGroup = async (groupIdx) => {
    const state = mergeState[groupIdx];
    if (!state?.keeperId || !state.mergeIds?.length) {
      toast.error('Επιλέξτε τον κύριο λογαριασμό και τους λογαριασμούς για συγχώνευση');
      return;
    }
    setMerging(true);
    try {
      const res = await base44.functions.invoke('chreosiMergeDuplicates', {
        session_token: sessionToken,
        keeperId: state.keeperId,
        mergeIds: state.mergeIds,
      });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Merge failed');
      toast.success(`Συγχωνεύτηκαν ${d.mergedCount} λογαριασμοί`);
      setDoneGroups(prev => [...prev, groupIdx]);
    } catch (err) {
      toast.error(err.message || 'Σφάλμα συγχώνευσης');
    } finally {
      setMerging(false);
    }
  };

  const allResolved = pendingGroups.length === 0 && duplicateGroups.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Συγχώνευση Διπλών Λογαριασμών</DialogTitle>
          <DialogDescription>
            {pendingGroups.length} εκκρεμείς ομάδες · {doneGroups.length} επιλυμένες
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-6 py-2 pr-1">
          {allResolved ? (
            <div className="text-center py-10">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-green-700">Όλες οι διπλές ομάδες επιλύθηκαν!</p>
            </div>
          ) : (
            duplicateGroups.map((group, groupIdx) => {
              const isDone = doneGroups.includes(groupIdx);
              const state = mergeState[groupIdx] || { keeperId: null, mergeIds: [] };
              return (
                <div key={groupIdx} className={`border rounded-xl p-4 space-y-3 ${isDone ? 'opacity-50 bg-slate-50 dark:bg-slate-800' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-sm">Ομάδα {groupIdx + 1} — {group.accounts.length} ίδια ονόματα</span>
                    </div>
                    {isDone && <Badge variant="secondary" className="text-green-600 bg-green-50">Επιλύθηκε</Badge>}
                  </div>

                  {!isDone && (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Επιλέξτε ποιος είναι ο κύριος λογαριασμός (keeper). Οι υπόλοιποι θα συγχωνευτούν μέσα του.</p>
                      <div className="space-y-2">
                        {group.accounts.map(acc => {
                          const isKeeper = state.keeperId === acc.id;
                          const isMerging = state.mergeIds.includes(acc.id);
                          return (
                            <div key={acc.id} className={`border rounded-lg p-3 flex items-center gap-3 ${isKeeper ? 'border-blue-400 bg-blue-50' : ''}`}>
                              <input
                                type="radio"
                                name={`keeper-${groupIdx}`}
                                checked={isKeeper}
                                onChange={() => setKeeper(groupIdx, acc.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{acc.username}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{acc.display_name || '—'} · {acc.phone || 'χωρίς τηλ.'} · {acc.is_active ? 'Ενεργός' : 'Ανενεργός'}</div>
                                {acc.allowed_prediction_symbols?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {acc.allowed_prediction_symbols.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                                  </div>
                                )}
                              </div>
                              {isKeeper && <Badge className="bg-blue-600 text-white text-xs">KEEPER</Badge>}
                              {!isKeeper && state.keeperId && (
                                <label className="flex items-center gap-1 text-xs text-red-600 cursor-pointer">
                                  <input type="checkbox" checked={isMerging} onChange={() => toggleMergeId(groupIdx, acc.id)} />
                                  Συγχώνευση
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {state.keeperId && state.mergeIds.length > 0 && (
                        <Alert>
                          <AlertDescription className="text-xs">
                            Ο keeper <strong>{group.accounts.find(a => a.id === state.keeperId)?.username}</strong> θα λάβει: ένωση συμβόλων + κατάστασης ψήφου, τηλέφωνο αν λείπει, ενεργοποίηση αν κάποιος είναι ενεργός, αθροιστικές σημειώσεις. Τα Person records θα ξαναγραφτούν.
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        size="sm"
                        disabled={!state.keeperId || !state.mergeIds.length || merging}
                        onClick={() => handleMergeGroup(groupIdx)}
                      >
                        {merging ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Συγχώνευση
                      </Button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={onClose}>Κλείσιμο</Button>
          {allResolved && (
            <Button onClick={onDone} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Ολοκλήρωση
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}