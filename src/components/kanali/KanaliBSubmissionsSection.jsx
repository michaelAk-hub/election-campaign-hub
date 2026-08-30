import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChevronDown, ChevronRight, RefreshCw, Trash2, Loader2, ClipboardList, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import KanaliBMatchDialog from './KanaliBMatchDialog';

// Type B submissions on the NotFoundVoters page — a collapsible section, separate
// from the Type A "not found" list. Each row shows a compact summary of the
// submitted values and expands to show all of them. Matching + "mark voted"
// arrives in phase 4.
export default function KanaliBSubmissionsSection({ sessionToken }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [matchSub, setMatchSub] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['kanali-b-subs'],
    queryFn: async () => {
      const res = await base44.functions.invoke('kanaliBListSubmissions', { session_token: sessionToken });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
  });

  const submissions = data?.submissions || [];
  const fields = data?.fields || [];

  const pairs = (sub) => fields
    .map((f) => ({ label: f.label || f.field_key, value: sub.values?.[f.field_key] }))
    .filter((p) => p.value !== undefined && p.value !== null && String(p.value).trim() !== '');

  const toggleSelect = (id) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allSelected = submissions.length > 0 && selected.length === submissions.length;
  const toggleSelectAll = () => setSelected(allSelected ? [] : submissions.map((s) => s.id));

  const doDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Διαγραφή ${selected.length} υποβολών;`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke('kanaliBListSubmissions', { session_token: sessionToken, action: 'delete', ids: selected });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Διαγράφηκαν');
      setSelected([]);
      refetch();
    } catch (e) {
      toast.error('Σφάλμα διαγραφής: ' + (e.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  const StatusBadge = ({ status }) => status === 'done'
    ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ολοκληρώθηκε</Badge>
    : <Badge variant="outline" className="border-amber-300 text-amber-700">Εκκρεμεί</Badge>;

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <ClipboardList className="h-4 w-4 text-purple-600" />
            Τύπος B — Υποβολές
            <Badge variant="outline" className="ml-1">{submissions.length}</Badge>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && (
              <Button variant="destructive" size="sm" onClick={doDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Διαγραφή ({selected.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />Ανανέωση
            </Button>
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">Δεν υπάρχουν υποβολές Τύπου B</div>
          ) : (
            <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                <span className="flex-1">Στοιχεία</span>
                <span className="w-28 hidden sm:block">Χρήστης</span>
                <span className="w-32 hidden md:block">Ημερομηνία</span>
                <span className="w-36">Κατάσταση</span>
                <span className="w-6" />
              </div>
              {submissions.map((sub) => {
                const all = pairs(sub);
                const isOpen = !!expanded[sub.id];
                const shown = isOpen ? all : all.slice(0, 4);
                return (
                  <div key={sub.id} className="border-t dark:border-slate-700">
                    <div className="flex items-start gap-2 px-3 py-2 text-sm">
                      <Checkbox className="mt-1" checked={selected.includes(sub.id)} onCheckedChange={() => toggleSelect(sub.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((p, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
                              <span className="text-slate-400">{p.label}:</span>
                              <span className="text-slate-800 dark:text-slate-100">{String(p.value)}</span>
                            </span>
                          ))}
                          {!isOpen && all.length > 4 && (
                            <button className="text-xs text-blue-600 hover:underline" onClick={() => setExpanded((e) => ({ ...e, [sub.id]: true }))}>
                              +{all.length - 4} ακόμη
                            </button>
                          )}
                        </div>
                        <div className="flex gap-3 mt-1 sm:hidden text-xs text-slate-400">
                          <span>{sub.kanali_username}</span>
                          <span>{sub.created_date ? format(new Date(sub.created_date), 'dd/MM HH:mm', { locale: el }) : ''}</span>
                        </div>
                      </div>
                      <span className="w-28 hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">{sub.kanali_username}</span>
                      <span className="w-32 hidden md:block text-xs text-slate-500 dark:text-slate-400">
                        {sub.created_date ? format(new Date(sub.created_date), 'dd/MM/yyyy HH:mm', { locale: el }) : '-'}
                      </span>
                      <div className="w-36 flex flex-col items-start gap-1">
                        <StatusBadge status={sub.status} />
                        {sub.status !== 'done' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMatchSub(sub)}>
                            <Search className="h-3.5 w-3.5 mr-1" />Αντιστοίχιση
                          </Button>
                        )}
                      </div>
                      <button className="w-6 text-slate-400 hover:text-slate-600" onClick={() => setExpanded((e) => ({ ...e, [sub.id]: !e[sub.id] }))}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}

      <KanaliBMatchDialog
        open={!!matchSub}
        submission={matchSub}
        fields={fields}
        sessionToken={sessionToken}
        onClose={() => setMatchSub(null)}
        onResolved={() => refetch()}
      />
    </Card>
  );
}
