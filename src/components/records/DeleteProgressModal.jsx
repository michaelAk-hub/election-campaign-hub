import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function DeleteProgressModal({ jobId, onClose }) {
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const intervalRef = useRef(null);
  const clockRef = useRef(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    const sessionToken = localStorage.getItem('app_session_token');

    const kickResume = async (jId, jobType) => {
      try {
        const fnName = jobType === 'delete_dataset' ? 'deleteDataset'
                     : jobType === 'delete_all_persons' ? 'deleteAllPersons'
                     : null;
        if (!fnName) {
          console.error('[DeleteProgressModal] Unknown job type, cannot resume:', jobType);
          return;
        }
        await base44.functions.invoke(fnName, { job_id: jId, resume_key: 'internal_resume' });
      } catch (e) {
        console.error('Resume invoke failed:', e);
      }
    };

    const fetchJob = async () => {
      try {
        const results = await base44.entities.DeleteJob.filter({ id: jobId });
        if (results.length > 0) {
          const j = results[0];
          setJob(j);
          setLogs(prev => {
            const lastMsg = prev[prev.length - 1];
            if (!lastMsg || lastMsg.msg !== j.message) {
              return [...prev, { msg: j.message, time: new Date().toLocaleTimeString('el-GR') }];
            }
            return prev;
          });
          setLastUpdate(Date.now());
          setSecondsSinceUpdate(0);
          if (['done', 'error'].includes(j.status)) {
            clearInterval(intervalRef.current);
            clearInterval(clockRef.current);
          }
        }
      } catch (e) {
        console.error('Failed to fetch job:', e);
      }
    };

    fetchJob();
    intervalRef.current = setInterval(fetchJob, 2000);

    // Clock + watchdog: if job is stuck (no progress for 15s), re-kick it
    let lastDeletedSnapshot = -1;
    let stuckSeconds = 0;
    clockRef.current = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
      setJob(current => {
        if (current?.status === 'running') {
          if (current.deleted === lastDeletedSnapshot) {
            stuckSeconds++;
            if (stuckSeconds >= 15) {
              stuckSeconds = 0;
              kickResume(jobId);
            }
          } else {
            lastDeletedSnapshot = current.deleted;
            stuckSeconds = 0;
          }
        }
        return current;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(clockRef.current);
    };
  }, [jobId]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const percent = job?.total > 0
    ? Math.min(99, Math.round(((job.deleted || 0) / job.total) * 100))
    : (job?.status === 'running' ? 5 : 0);

  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';
  const isRunning = !isDone && !isError;
  const isStuck = isRunning && secondsSinceUpdate > 20;

  return (
    <Dialog open={!!jobId} onOpenChange={() => (isDone || isError) ? onClose() : null}>
      <DialogContent className="max-w-lg" hideClose={isRunning}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />}
            {isDone && <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />}
            {isError && <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
            {isRunning ? 'Διαγραφή σε εξέλιξη...' : isDone ? '✅ Ολοκληρώθηκε!' : '❌ Σφάλμα'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full bg-slate-200 rounded-full h-5 overflow-hidden relative">
              <div
                className={`h-5 rounded-full transition-all duration-1000 ease-out ${
                  isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-600'
                }`}
                style={{ width: `${isDone ? 100 : percent}%` }}
              />
              {isRunning && !isDone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-semibold text-white drop-shadow">{percent}%</span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-sm font-medium text-slate-700">
              <span>
                {job?.deleted ?? 0} / {job?.total ?? '...'} εγγραφές
              </span>
              <span className={isDone ? 'text-green-600' : isError ? 'text-red-600' : 'text-blue-600'}>
                {isDone ? '100%' : `${percent}%`}
              </span>
            </div>
          </div>

          {/* Live log */}
          <div className="bg-slate-900 rounded-lg p-3 h-36 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 && (
              <p className="text-slate-500">Αρχικοποίηση...</p>
            )}
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-500 flex-shrink-0">[{entry.time}]</span>
                <span className={
                  entry.msg?.includes('Σφάλμα') ? 'text-red-400' :
                  entry.msg?.includes('Ολοκλη') ? 'text-green-400' :
                  'text-slate-200'
                }>{entry.msg}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {/* Status info */}
          {isRunning && (
            <div className={`rounded-lg p-3 border ${isStuck ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center gap-2">
                <Clock className={`h-4 w-4 flex-shrink-0 ${isStuck ? 'text-orange-600' : 'text-blue-600'}`} />
                <p className={`text-xs font-medium ${isStuck ? 'text-orange-800' : 'text-blue-800'}`}>
                  {isStuck
                    ? `⚠️ Τελευταία ενημέρωση πριν ${secondsSinceUpdate}δ. Η διαδικασία συνεχίζεται στο background — παρακαλώ περιμένετε.`
                    : `Ενημερώνεται κάθε 2 δευτερόλεπτα • Τελευταία ενημέρωση: ${secondsSinceUpdate}δ πριν`
                  }
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1 ml-6">
                ⚠️ Μην κλείσετε αυτό το παράθυρο κατά τη διάρκεια της διαγραφής.
              </p>
            </div>
          )}

          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-red-700">Λεπτομέρειες σφάλματος:</p>
              <p className="text-xs text-red-800 font-mono break-all">{job?.error || 'Άγνωστο σφάλμα'}</p>
            </div>
          )}

          {isDone && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-800">{job?.message}</p>
            </div>
          )}
        </div>

        {(isDone || isError) && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={onClose}
              className={isDone ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              variant={isError ? 'outline' : 'default'}
            >
              Κλείσιμο
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}