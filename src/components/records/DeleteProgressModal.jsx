import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function DeleteProgressModal({ jobId, onClose }) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    // Subscribe to real-time updates
    const unsubscribe = base44.entities.DeleteJob.subscribe((event) => {
      if (event.id === jobId || event.data?.id === jobId) {
        setJob(event.data);
      }
    });

    // Also fetch immediately
    base44.entities.DeleteJob.filter({ id: jobId }).then(results => {
      if (results.length > 0) setJob(results[0]);
    });

    return () => unsubscribe();
  }, [jobId]);

  const percent = job?.total > 0 ? Math.min(100, Math.round((job.deleted / job.total) * 100)) : (job?.status === 'running' ? 15 : 0);
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';
  const isRunning = !isDone && !isError;

  return (
    <Dialog open={!!jobId} onOpenChange={() => isDone || isError ? onClose() : null}>
      <DialogContent className="max-w-md" hideClose={isRunning}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
            {isDone && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {isError && <AlertCircle className="h-5 w-5 text-red-600" />}
            {isRunning ? 'Διαγραφή σε εξέλιξη...' : isDone ? 'Ολοκληρώθηκε' : 'Σφάλμα'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Message */}
          <p className="text-sm text-slate-700">
            {job?.message || 'Αρχικοποίηση διαγραφής...'}
          </p>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-500 ${
                  isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-600'
                }`}
                style={{ width: `${isDone ? 100 : percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                {job?.deleted ?? 0} / {job?.total ?? '...'} εγγραφές
              </span>
              <span>{isDone ? 100 : percent}%</span>
            </div>
          </div>

          {/* Warning while running */}
          {isRunning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                ⚠️ Μην κλείσετε αυτό το παράθυρο. Η διαγραφή συνεχίζεται στο background.
              </p>
            </div>
          )}

          {/* Error detail */}
          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-800 font-mono break-all">{job?.error}</p>
            </div>
          )}
        </div>

        {(isDone || isError) && (
          <div className="flex justify-end">
            <Button onClick={onClose} className={isDone ? 'bg-green-600 hover:bg-green-700' : ''} variant={isError ? 'outline' : 'default'}>
              Κλείσιμο
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}