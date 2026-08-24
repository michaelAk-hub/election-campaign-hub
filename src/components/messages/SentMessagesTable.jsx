import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bell, MessageSquare, Users, Clock, Ban,
  CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function StatusBadge({ status }) {
  if (status === 'active') return <Badge className="bg-green-100 text-green-800 border-green-200">Ενεργό</Badge>;
  if (status === 'expired') return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Έληξε</Badge>;
  if (status === 'disabled') return <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">Απενεργοποιημένο</Badge>;
  return null;
}

function SourceBadge({ source_type }) {
  if (source_type === 'notification') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
        <Bell className="h-3 w-3" /> Ειδοποίηση
      </span>
    );
  }
  if (source_type === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5">
        <Bell className="h-3 w-3" /><MessageSquare className="h-3 w-3" /> Μικτό
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">
      <MessageSquare className="h-3 w-3" /> PushMessage
    </span>
  );
}

function formatRelativeExpiry(expiresAt) {
  if (!expiresAt) return '—';
  const now = new Date();
  const exp = new Date(expiresAt);
  const diffMs = exp - now;
  if (diffMs <= 0) return <span className="text-amber-600 text-xs">Έληξε</span>;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return <span className="text-xs">{diffMins}λ</span>;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return <span className="text-xs">{diffHours}ω</span>;
  const diffDays = Math.floor(diffHours / 24);
  return <span className="text-xs">{diffDays}η</span>;
}

export default function SentMessagesTable() {
  const queryClient = useQueryClient();
  const [disableTarget, setDisableTarget] = useState(null); // row to disable
  const [detailRow, setDetailRow] = useState(null); // row for detail dialog

  const sessionToken = localStorage.getItem('app_session_token');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adminMessagesList'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('notificationsAdminList', {
        session_token: sessionToken,
      });
      if (data.error) throw new Error(data.error);
      return data.rows || [];
    },
    refetchInterval: 30000,
  });

  const rows = data || [];

  const disableMutation = useMutation({
    mutationFn: async (row) => {
      const payload = { session_token: sessionToken };
      // Always prefer batch disable when send_batch_id is available —
      // this covers notification-only, push-only, and mixed rows in one call.
      if (row.send_batch_id) {
        payload.send_batch_id = row.send_batch_id;
      } else {
        // Legacy row without batch id: fall back to single-record disable
        payload.source_type = row.source_type;
        payload.id = row.record_id;
      }
      const { data } = await base44.functions.invoke('notificationsAdminDisable', payload);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (result) => {
      if (result.noop) {
        toast.info(result.message || 'Ήδη απενεργοποιημένο');
      } else {
        toast.success('Το μήνυμα απενεργοποιήθηκε επιτυχώς');
      }
      queryClient.invalidateQueries(['adminMessagesList']);
      queryClient.invalidateQueries(['notifications']);
      setDisableTarget(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Σφάλμα κατά την απενεργοποίηση');
      setDisableTarget(null);
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500 dark:text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          Φόρτωση μηνυμάτων...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Σταλμένα Μηνύματα
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Ανανέωση
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>Δεν υπάρχουν σταλμένα μηνύματα</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Τίτλος</TableHead>
                    <TableHead>Σύστημα</TableHead>
                    <TableHead>Παραλήπτες</TableHead>
                    <TableHead>Αποστολέας</TableHead>
                    <TableHead>Ημ/νία</TableHead>
                    <TableHead>Λήξη</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="text-right">Ενέργεια</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        row.status === 'disabled' && 'opacity-60',
                        row.status === 'expired' && 'opacity-70'
                      )}
                    >
                      <TableCell>
                        <div className="max-w-[180px]">
                          <p className="font-medium text-sm truncate">{row.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{row.message}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SourceBadge source_type={row.source_type} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-slate-400" />
                          <span className="text-xs text-slate-600 dark:text-slate-300 max-w-[140px] truncate">
                            {row.recipient_summary}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[120px] block">
                          {row.sender_email || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {row.created_date
                            ? format(new Date(row.created_date), 'dd/MM/yy HH:mm', { locale: el })
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.expires_at ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-amber-500" />
                            {formatRelativeExpiry(row.expires_at)}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Χωρίς λήξη</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDetailRow(row)}
                            title="Λεπτομέρειες"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {row.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDisableTarget(row)}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Απενεργοποίηση
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable confirmation */}
      <AlertDialog open={!!disableTarget} onOpenChange={(open) => !open && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Απενεργοποίηση Μηνύματος</AlertDialogTitle>
            <AlertDialogDescription>
              Το μήνυμα <strong>"{disableTarget?.title}"</strong> θα απενεργοποιηθεί αμέσως και δεν θα είναι πλέον ορατό στους παραλήπτες. Η ενέργεια αυτή δεν μπορεί να αναιρεθεί.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDisableTarget(null)}>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => disableMutation.mutate(disableTarget)}
              disabled={disableMutation.isPending}
            >
              {disableMutation.isPending ? 'Απενεργοποίηση...' : 'Απενεργοποίηση'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Λεπτομέρειες Μηνύματος</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Τίτλος</p>
                <p className="font-semibold">{detailRow.title}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Μήνυμα</p>
                <p className="text-slate-700 dark:text-slate-300">{detailRow.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Σύστημα</p>
                  <SourceBadge source_type={detailRow.source_type} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Κατάσταση</p>
                  <StatusBadge status={detailRow.status} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Παραλήπτες</p>
                <p className="text-slate-700 dark:text-slate-300">{detailRow.recipient_summary}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Αποστολέας</p>
                <p className="text-slate-700 dark:text-slate-300">{detailRow.sender_email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Αποστολή</p>
                <p className="text-slate-700 dark:text-slate-300">
                  {detailRow.created_date
                    ? format(new Date(detailRow.created_date), 'dd MMM yyyy, HH:mm', { locale: el })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Λήξη</p>
                <p className="text-slate-700 dark:text-slate-300">
                  {detailRow.expires_at
                    ? format(new Date(detailRow.expires_at), 'dd MMM yyyy, HH:mm', { locale: el })
                    : 'Χωρίς λήξη'}
                </p>
              </div>
              {detailRow.disabled_at && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Απενεργοποιήθηκε</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {format(new Date(detailRow.disabled_at), 'dd MMM yyyy, HH:mm', { locale: el })}
                    {detailRow.disabled_by && ` από ${detailRow.disabled_by}`}
                  </p>
                </div>
              )}
              {detailRow.send_batch_id && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-1">Batch ID</p>
                  <p className="text-slate-400 font-mono text-xs">{detailRow.send_batch_id}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}