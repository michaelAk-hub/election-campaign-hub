import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bell,
  BellOff,
  CheckCheck,
  Info,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';

export default function NotificationCenter({ userType, username }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const audioRef = useRef(null);
  const prevCountRef = useRef(0);
  const expireTimersRef = useRef([]); // track per-notification expiry timers

  const sessionToken = localStorage.getItem('app_session_token');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!sessionToken) return [];
      const { data } = await base44.functions.invoke('notificationsFetch', {
        session_token: sessionToken,
      });
      return data.notifications || [];
    },
    refetchInterval: 8000,
    enabled: !!sessionToken,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  // Play notification sound on new notification
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current !== 0) {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // ── Immediate disable: subscribe to Notification entity changes ──────────
  useEffect(() => {
    if (!sessionToken) return;
    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'update' && event.data) {
        const d = event.data;
        // If the updated notification is now inactive/disabled, remove it immediately
        if (d.is_active === false || d.disabled_at != null) {
          queryClient.setQueryData(['notifications'], (old = []) =>
            old.filter(n => n.id !== d.id)
          );
        }
      }
    });
    return () => unsubscribe();
  }, [sessionToken, queryClient]);

  // ── Immediate disappearance: set per-notification expiry timers ──────────
  const scheduleExpiryTimers = useCallback((notifs) => {
    // Clear existing timers
    expireTimersRef.current.forEach(t => clearTimeout(t));
    expireTimersRef.current = [];

    const now = Date.now();
    for (const n of notifs) {
      if (!n.expires_at) continue;
      const expiresMs = new Date(n.expires_at).getTime();
      const msUntilExpiry = expiresMs - now;
      if (msUntilExpiry <= 0) continue; // already expired (shouldn't be in list, but guard)

      const t = setTimeout(() => {
        // Remove this notification from the cached list immediately without refetch
        queryClient.setQueryData(['notifications'], (old = []) =>
          old.filter(existing => existing.id !== n.id)
        );
      }, msUntilExpiry);
      expireTimersRef.current.push(t);
    }
  }, [queryClient]);

  useEffect(() => {
    scheduleExpiryTimers(notifications);
    return () => {
      expireTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, [notifications, scheduleExpiryTimers]);

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('notificationsMarkRead', {
      session_token: sessionToken,
      notification_id: id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifs = notifications.filter(n => !n.read);
      await base44.functions.invoke('notificationsMarkRead', {
        session_token: sessionToken,
        mark_all: true,
        notification_ids: unreadNotifs.map(n => n.id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      toast.success('Όλες οι ειδοποιήσεις σημειώθηκαν ως αναγνωσμένες');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('notificationsDelete', {
      session_token: sessionToken,
      notification_id: id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      toast.success('Η ειδοποίηση διαγράφηκε');
    }
  });

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'read') return n.read;
    return true;
  }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const exp = new Date(expiresAt);
    const now = new Date();
    const diffMs = exp - now;
    if (diffMs <= 0) return 'Έληξε';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Λήγει σε ${diffMins}λ`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Λήγει σε ${diffHours}ω`;
    const diffDays = Math.floor(diffHours / 24);
    return `Λήγει σε ${diffDays}η`;
  };

  return (
    <>
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZUQ4GV63k8LJoIA4+ltrzxnMpBSh+zPHZizkIEmq98N+ZTBELV67i8bllIA5Akdfy0n4rBSl+zPHaizsIF2u+7+CbUw8FWK/k8LNoIA4/ltrzxnMpBSl+zPHaizsIF2y+7+CbUw8FWK/k8LNoIA0/ltvzxnMpBSl/zPHaizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHaizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUw8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoIA0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8LJoHw0+ltvzxnMpBSl/zPHbizsIF2y+7uCbUg8FWK/k8A==" />

      <motion.div
        animate={unreadCount > 0 && !open ? { scale: [1, 1.2, 1, 1.2, 1] } : { scale: 1 }}
        transition={{ duration: 2, repeat: unreadCount > 0 && !open ? Infinity : 0, repeatDelay: 1 }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setOpen(true)}
        >
          <motion.div
            animate={unreadCount > 0 && !open ? { color: ['#475569', '#dc2626', '#475569', '#dc2626', '#475569'] } : {}}
            transition={{ duration: 2, repeat: unreadCount > 0 && !open ? Infinity : 0, repeatDelay: 1 }}
          >
            <Bell className="h-5 w-5" />
          </motion.div>
          {unreadCount > 0 && (
            <motion.div
              animate={{ scale: [1, 1.2, 1, 1.2, 1], backgroundColor: ['#dc2626', '#ef4444', '#dc2626', '#ef4444', '#dc2626'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            >
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-600">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            </motion.div>
          )}
        </Button>
      </motion.div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Ειδοποιήσεις</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => markAllAsReadMutation.mutate()}>
                  <CheckCheck className="h-4 w-4 mr-2" />
                  Όλα αναγνωσμένα
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={filter} onValueChange={setFilter} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">Όλα</TabsTrigger>
              <TabsTrigger value="unread">
                Μη αναγνωσμένα
                {unreadCount > 0 && <Badge variant="secondary" className="ml-2 h-5">{unreadCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="read">Αναγνωσμένα</TabsTrigger>
            </TabsList>
          </Tabs>

          <ScrollArea className="flex-1 mt-4">
            <div className="space-y-3 pr-4">
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <BellOff className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>Δεν υπάρχουν ειδοποιήσεις</p>
                </div>
              ) : (
                filteredNotifications.map((notif) => {
                  const expiryLabel = formatExpiry(notif.expires_at);
                  return (
                    <Card
                      key={notif.id}
                      className={cn(
                        'hover:shadow-md transition-shadow cursor-pointer',
                        !notif.read ? 'bg-blue-50 border-blue-200' : ''
                      )}
                      onClick={() => !notif.read && markAsReadMutation.mutate(notif.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          {getIcon(notif.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className={cn('font-semibold text-sm', !notif.read ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300')}>
                                {notif.title}
                              </h4>
                              {!notif.read && <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0 mt-1" />}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{notif.message}</p>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {format(new Date(notif.created_date), 'dd MMM yyyy, HH:mm', { locale: el })}
                                </span>
                                {expiryLabel && (
                                  <span className="text-xs text-amber-600 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {expiryLabel}
                                  </span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(notif.id); }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}