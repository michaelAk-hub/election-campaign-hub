import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, Download } from 'lucide-react';

const POLL_INTERVAL_MS = 2000;
const WATCHDOG_SECONDS = 15;

export default function ExportProgressModal({ jobId, datasetName, onClose }) {
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const lastProcessedRef = useRef(null);
  const watchdogRef = useRef(null);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);

  const isRunning = !job || job.status === 'pending' || job.status === 'running';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';

  const addLog = (msg) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const jobs = await base44.entities.ExportJob.filter({ id: jobId });
        if (!jobs.length) return;
        const j = jobs[0];
        setJob(j);

        if (j.message) {
          addLog(j.message);
        }

        if (lastProcessedRef.current !== j.processed) {
          lastProcessedRef.current = j.processed;
          setSecondsSinceUpdate(0);
        }

        if (j.status === 'done' || j.status === 'error') {
          clearInterval(pollRef.current);
          clearInterval(watchdogRef.current);
          addLog(j.status === 'done' ? '✅ Εξαγωγή ολοκληρώθηκε!' : `❌ Σφάλμα: ${j.error}`);
        }
      } catch (e) {
        addLog(`Σφάλμα polling: ${e.message}`);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Watchdog counter
    watchdogRef.current = setInterval(() => {
      setSecondsSinceUpdate(s => {
        const next = s + 1;
        if (next >= WATCHDOG_SECONDS) {
          addLog('⚠️ Watchdog: αναπροσπαθεία...');
          base44.functions.invoke('exportPersonsJob', {
            job_id: jobId,
            resume_key: 'internal_resume'
          }).catch(() => {});
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(watchdogRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <Dialog open={true} onOpenChange={isRunning ? undefined : onClose}>
      <DialogContent className="max-w-lg" hideClose={isRunning}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
            {isDone && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {isError && <AlertCircle className="h-4 w-4 text-red-600" />}
            Εξαγωγή: {datasetName || 'Dataset'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>{job?.message || 'Αναμονή...'}</span>
              {job?.total > 0 && <span>{job.processed ?? 0} / {job.total}</span>}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              {isRunning ? (
                /* Indeterminate */
                <div className="h-3 rounded-full bg-blue-600 animate-pulse w-full" />
              ) : (
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${isDone ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: '100%' }}
                />
              )}
            </div>
          </div>

          {/* Live log console */}
          <div className="bg-slate-900 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs text-slate-200">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>

          {isRunning && secondsSinceUpdate > 5 && (
            <p className="text-xs text-slate-400 text-center">
              Τελευταία ενημέρωση: {secondsSinceUpdate}s πριν
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {isDone && job?.file_url && (
            <Button
              onClick={() => window.open(job.file_url, '_blank')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Λήψη αρχείου
            </Button>
          )}
          <Button
            onClick={onClose}
            disabled={isRunning}
            variant={isError ? 'destructive' : 'outline'}
          >
            {isRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Εξαγωγή...</> : 'Κλείσιμο'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}