import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'chreosi_create_settings';
const VOTED_STATUS_OPTIONS = [
  { value: 'false', label: 'Δεν Ψήφισαν' },
  { value: 'true', label: 'Ψήφισαν' },
];

function loadLastSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { symbols: [], voted: [] };
    return JSON.parse(raw);
  } catch { return { symbols: [], voted: [] }; }
}
function saveLastSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function exportCsv(results) {
  const BOM = '\uFEFF';
  const headers = 'username,display_name,plain_password,action,symbols,voted_statuses,error\n';
  const rows = results.map(r =>
    [r.username, r.display_name, r.plain_password, r.action, r.symbols, r.voted_statuses, r.error || '']
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob([BOM + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chreosi_create_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

export default function ChreosiCreateDialog({ open, onClose, onDone, sessionToken }) {
  const [step, setStep] = useState('idle'); // idle | analyzing | analysis | settings | running | done | error
  const [analysis, setAnalysis] = useState(null);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [selectedVoted, setSelectedVoted] = useState([]);
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const [analyzeError, setAnalyzeError] = useState('');
  const pollRef = useRef(null);

  // Load saved settings on open
  useEffect(() => {
    if (open) {
      const saved = loadLastSettings();
      setSelectedSymbols(saved.symbols || []);
      setSelectedVoted(saved.voted || []);
      setAnalysis(null);
      setAnalyzeError('');
      setStep('idle');
      // Check for existing active job
      checkExistingJob();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open]);

  const checkExistingJob = async () => {
    try {
      const res = await base44.functions.invoke('chreosiJobStatus', { session_token: sessionToken });
      const d = res.data;
      if (d?.found && (d.status === 'running' || d.status === 'pending')) {
        setJobId(d.jobId);
        setJobProgress(d);
        setStep('running');
        // driveJob is triggered by the step='running' useEffect below
      }
    } catch {}
  };

  const runAnalysis = async () => {
    setStep('analyzing');
    setAnalyzeError('');
    try {
      const res = await base44.functions.invoke('chreosiAnalyze', { session_token: sessionToken });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Analysis failed');
      setAnalysis(d);
      setAvailableSymbols(d.availableSymbols || []);
      setStep('analysis');
    } catch (err) {
      setAnalyzeError(err.message || 'Σφάλμα ανάλυσης');
      setStep('idle');
    }
  };

  // Drive the job: repeatedly call continueJob until done, with status updates in between
  const driveRef = useRef(false);

  const driveJob = useCallback(async (jId) => {
    if (driveRef.current) return; // prevent concurrent drives
    driveRef.current = true;
    try {
      while (true) {
        // Call continueJob — it processes batches until time budget or completion
        const res = await base44.functions.invoke('chreosiContinueCreateJob', {
          session_token: sessionToken,
          jobId: jId,
        });
        const d = res.data;

        if (d?.error) {
          setStep('error');
          driveRef.current = false;
          return;
        }

        // Update progress UI from the continue response
        if (d) {
          setJobProgress({
            found: true,
            jobId: jId,
            status: d.status,
            total: d.total,
            processed: d.processed,
            created: d.created,
            updated: d.updated,
            skipped: d.skipped,
            failed: d.failed,
            results: d.results || [],
          });
        }

        if (d?.done || d?.status === 'done' || d?.status === 'error') {
          setStep(d.status === 'done' ? 'done' : 'error');
          if (d.status === 'done') {
            onDone?.();
            toast.success(`Ολοκληρώθηκε: ${d.created} δημιουργήθηκαν, ${d.updated} ενημερώθηκαν`);
          }
          driveRef.current = false;
          return;
        }

        // Not done yet — short pause then continue
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('Drive job error:', err);
      driveRef.current = false;
      // On network error, fall back to status polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await base44.functions.invoke('chreosiJobStatus', { session_token: sessionToken, jobId: jId });
          const d = res.data;
          if (!d?.found) { clearInterval(pollRef.current); return; }
          setJobProgress(d);
          if (d.status === 'done' || d.status === 'error') {
            clearInterval(pollRef.current);
            setStep(d.status === 'done' ? 'done' : 'error');
            if (d.status === 'done') { onDone?.(); toast.success(`Ολοκληρώθηκε: ${d.created} δημιουργήθηκαν, ${d.updated} ενημερώθηκαν`); }
          }
          if ((d.status === 'pending' || d.status === 'running') && !driveRef.current) {
            clearInterval(pollRef.current);
            driveJob(jId);
          }
        } catch {}
      }, 5000);
    }
  }, [sessionToken, onDone]);

  // When step becomes 'running', start driving the job
  useEffect(() => {
    if (step !== 'running' || !jobId) return;
    driveRef.current = false;
    driveJob(jobId);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, jobId]);

  const handleStartJob = async () => {
    saveLastSettings({ symbols: selectedSymbols, voted: selectedVoted });
    try {
      const res = await base44.functions.invoke('chreosiStartCreateJob', {
        session_token: sessionToken,
        allowed_prediction_symbols: selectedSymbols,
        allowed_voted_statuses: selectedVoted,
      });
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Failed to start job');
      setJobId(d.jobId);
      setJobProgress({ total: d.total, processed: 0, created: 0, updated: 0, failed: 0, status: 'pending' });
      setStep('running');
    } catch (err) {
      if (err.message?.includes('διπλές')) {
        toast.error(err.message);
        setStep('analysis'); // go back to show duplicates
      } else {
        toast.error(err.message || 'Σφάλμα εκκίνησης');
      }
    }
  };

  const toggleSymbol = (s) => setSelectedSymbols(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleVoted = (v) => setSelectedVoted(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const noRecordsWarning = selectedSymbols.length === 0 || selectedVoted.length === 0;
  const pct = jobProgress?.total > 0 ? Math.round((jobProgress.processed / jobProgress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== 'running') { if (pollRef.current) clearInterval(pollRef.current); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Δημιουργία / Ενημέρωση Χρεωστικών</DialogTitle>
          <DialogDescription>
            {step === 'idle' && 'Ανάλυση επαφών από τα δεδομένα εγγραφών'}
            {step === 'analyzing' && 'Ανάλυση σε εξέλιξη...'}
            {step === 'analysis' && 'Αποτελέσματα ανάλυσης'}
            {step === 'settings' && 'Ρυθμίσεις για όλους τους λογαριασμούς'}
            {step === 'running' && 'Επεξεργασία λογαριασμών...'}
            {step === 'done' && 'Ολοκληρώθηκε'}
            {step === 'error' && 'Σφάλμα'}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 py-2 pr-1">

          {/* STEP: IDLE */}
          {step === 'idle' && (
            <div className="text-center py-8 space-y-4">
              <p className="text-slate-600 dark:text-slate-300">Κάντε κλικ για να αναλύσετε τα δεδομένα πριν ξεκινήσετε.</p>
              {analyzeError && <Alert variant="destructive"><AlertDescription>{analyzeError}</AlertDescription></Alert>}
              <Button onClick={runAnalysis} size="lg">
                <RefreshCw className="h-4 w-4 mr-2" />
                Ανάλυση
              </Button>
            </div>
          )}

          {/* STEP: ANALYZING */}
          {step === 'analyzing' && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
              <span className="text-slate-600 dark:text-slate-300">Ανάλυση δεδομένων...</span>
            </div>
          )}

          {/* STEP: ANALYSIS RESULTS */}
          {step === 'analysis' && analysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Σύνολο εγγραφών', value: analysis.totalPersons },
                  { label: 'Μοναδικές επαφές', value: analysis.totalUniqueContacts },
                  { label: 'Νέοι λογαριασμοί', value: analysis.newAccountsCount, color: 'text-green-600' },
                  { label: 'Υπάρχοντες (θα ενημερωθούν)', value: analysis.existingAccountsCount, color: 'text-blue-600' },
                  { label: 'Κενά/άκυρα ονόματα', value: analysis.skippedEmptyNames, color: 'text-slate-400' },
                  { label: 'Επιπλέον λογαριασμοί', value: analysis.extraAccounts?.length ?? 0, color: 'text-amber-600' },
                ].map((item, i) => (
                  <div key={i} className="border rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${item.color || 'text-slate-900 dark:text-slate-100'}`}>{item.value}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Duplicate groups — BLOCKING */}
              {analysis.duplicateGroups?.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Βρέθηκαν {analysis.duplicateGroups.length} ομάδες διπλών εγγραφών.</strong>{' '}
                    Πρέπει πρώτα να λυθούν πριν συνεχίσετε. Χρησιμοποιήστε το εργαλείο Συγχώνευσης Διπλών.
                    <div className="mt-2 space-y-1">
                      {analysis.duplicateGroups.slice(0, 5).map((g, i) => (
                        <div key={i} className="text-xs bg-red-50 rounded p-2">
                          <span className="font-mono">{g.accounts.map(a => a.username).join(' · ')}</span>
                        </div>
                      ))}
                      {analysis.duplicateGroups.length > 5 && <div className="text-xs">...και {analysis.duplicateGroups.length - 5} ακόμα</div>}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Accounts needing review */}
              {analysis.accountsNeedingReview?.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{analysis.accountsNeedingReview.length} λογαριασμοί</strong> έχουν κενά σύμβολα ή κατάσταση ψήφου και δεν βλέπουν εγγραφές. Θα ενημερωθούν με τις νέες ρυθμίσεις.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* STEP: SETTINGS */}
          {(step === 'settings' || step === 'analysis') && !analysis?.hasDuplicates && (
            <div className="space-y-5 border-t pt-4">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Ρυθμίσεις για όλους τους λογαριασμούς</h3>

              {/* Symbols */}
              <div>
                <label className="text-sm font-medium block mb-2">Επιτρεπόμενα Σύμβολα Πρόβλεψης</label>
                <div className="flex flex-wrap gap-2 border rounded-md p-3">
                  {availableSymbols.length === 0 ? (
                    <span className="text-sm text-slate-400">Δεν βρέθηκαν σύμβολα</span>
                  ) : availableSymbols.map(s => (
                    <Badge
                      key={s}
                      variant={selectedSymbols.includes(s) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleSymbol(s)}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Voted statuses */}
              <div>
                <label className="text-sm font-medium block mb-2">Κατάσταση Ψήφου</label>
                <div className="flex gap-3">
                  {VOTED_STATUS_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedVoted.includes(opt.value)}
                        onChange={() => toggleVoted(opt.value)}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warning */}
              {noRecordsWarning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Προσοχή:</strong> Ο χρήστης δεν θα βλέπει καμία εγγραφή με τις τρέχουσες ρυθμίσεις.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* STEP: RUNNING */}
          {step === 'running' && jobProgress && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">Επεξεργασία λογαριασμών...</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Μην κλείσετε το παράθυρο — η εργασία συνεχίζεται ακόμα κι αν φορτώσετε ξανά</p>
              </div>
              <Progress value={pct} className="h-3" />
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div><div className="text-lg font-bold">{jobProgress.processed}/{jobProgress.total}</div><div className="text-xs text-slate-500 dark:text-slate-400">Επεξεργ.</div></div>
                <div><div className="text-lg font-bold text-green-600">{jobProgress.created}</div><div className="text-xs text-slate-500 dark:text-slate-400">Νέοι</div></div>
                <div><div className="text-lg font-bold text-blue-600">{jobProgress.updated}</div><div className="text-xs text-slate-500 dark:text-slate-400">Ενημερ.</div></div>
                <div><div className="text-lg font-bold text-red-600">{jobProgress.failed}</div><div className="text-xs text-slate-500 dark:text-slate-400">Αποτυχ.</div></div>
              </div>
              {/* Live failed rows */}
              {jobProgress.results?.filter(r => r.action === 'failed')?.length > 0 && (
                <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-xs font-semibold text-red-700 mb-2">Αποτυχημένες εγγραφές:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {jobProgress.results.filter(r => r.action === 'failed').map((r, i) => (
                      <div key={i} className="text-xs text-red-600 flex gap-2">
                        <span className="font-medium">{r.username}</span>
                        <span className="text-red-500">— {r.error || 'Άγνωστο σφάλμα'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && jobProgress && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <p className="text-xl font-bold text-green-700">Ολοκληρώθηκε!</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-green-600">{jobProgress.created}</div><div className="text-xs text-slate-500 dark:text-slate-400">Δημιουργήθηκαν</div></div>
                <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-blue-600">{jobProgress.updated}</div><div className="text-xs text-slate-500 dark:text-slate-400">Ενημερώθηκαν</div></div>
                <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-red-600">{jobProgress.failed}</div><div className="text-xs text-slate-500 dark:text-slate-400">Απέτυχαν</div></div>
              </div>
              {jobProgress.results?.length > 0 && (
                <Button variant="outline" onClick={() => exportCsv(jobProgress.results)} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Λήψη CSV
                </Button>
              )}
            </div>
          )}

        </div>

        <DialogFooter className="border-t pt-3 gap-2">
          <Button variant="outline" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); onClose(); }} disabled={step === 'running'}>
            {step === 'done' ? 'Κλείσιμο' : 'Ακύρωση'}
          </Button>
          {step === 'idle' && (
            <Button onClick={runAnalysis}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Ανάλυση
            </Button>
          )}
          {step === 'analysis' && !analysis?.hasDuplicates && (
            <Button onClick={handleStartJob} disabled={noRecordsWarning && selectedSymbols.length === 0 && selectedVoted.length === 0}>
              <ChevronRight className="h-4 w-4 mr-2" />
              Έναρξη
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}