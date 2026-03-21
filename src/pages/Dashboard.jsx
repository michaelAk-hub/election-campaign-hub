import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  Vote,
  UserCheck,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  Download,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const [templateLoading, setTemplateLoading] = useState(false);
  const sessionToken = localStorage.getItem('app_session_token');

  // ── Single aggregated summary call — no SDK, raw callBackendFunction ───────
  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => callBackendFunction('dashboardSummary', { session_token: sessionToken }),
    staleTime: 60_000,
  });

  // ── Dynamic Person template via personSchemaFields endpoint ───────────────
  const downloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      const { fields } = await callBackendFunction('personSchemaFields', { session_token: sessionToken });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([fields]);
      XLSX.utils.book_append_sheet(wb, ws, 'Person Template');

      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `person_template_${date}.xlsx`);
      toast.success('Το πρότυπο κατέβηκε επιτυχώς');
    } catch (err) {
      toast.error('Σφάλμα κατά τη δημιουργία προτύπου: ' + err.message);
    } finally {
      setTemplateLoading(false);
    }
  };

  // ── Full-page loading — no partial renders, no fake zeros ─────────────────
  if (isLoading) {
    return <LoadingSpinner text="Φόρτωση πίνακα ελέγχου..." />;
  }

  if (isError || !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-slate-600 text-lg">Αδυναμία φόρτωσης δεδομένων.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Δοκιμάστε ξανά
        </Button>
      </div>
    );
  }

  const {
    total_people,
    voted_count,
    not_voted_count,
    vote_percentage,
    top_departments,
    active_chreosi_count,
    active_kanali_count,
    recent_submissions,
    not_found_count,
    sms_logs,
  } = summary;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Πίνακας Ελέγχου"
        subtitle="Επισκόπηση της εκλογικής διαδικασίας"
        icon={LayoutDashboard}
        actions={
          <Button
            variant="outline"
            onClick={downloadTemplate}
            disabled={templateLoading}
            className="h-10"
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{templateLoading ? 'Παρακαλώ...' : 'Πρότυπο'}</span>
          </Button>
        }
      />

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Σύνολο Εγγραφών"
          value={total_people.toLocaleString('el-GR')}
          icon={Users}
          iconClassName="bg-blue-100"
        />
        <StatCard
          title="Ψήφισαν"
          value={voted_count.toLocaleString('el-GR')}
          subtitle={`${vote_percentage}% του συνόλου`}
          icon={CheckCircle2}
          iconClassName="bg-emerald-100"
        />
        <StatCard
          title="Δεν Ψήφισαν"
          value={not_voted_count.toLocaleString('el-GR')}
          icon={Clock}
          iconClassName="bg-amber-100"
        />
        <StatCard
          title="Αποτυχημένες Καταχωρήσεις"
          value={not_found_count}
          icon={AlertCircle}
          iconClassName="bg-red-100"
        />
      </div>

      {/* Voting Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5 text-blue-600" />
            Πρόοδος Ψηφοφορίας
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Συνολική Πρόοδος</span>
              <span className="font-semibold text-slate-900">{vote_percentage}%</span>
            </div>
            <Progress value={vote_percentage} className="h-3" />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{voted_count.toLocaleString('el-GR')} ψήφισαν</span>
              <span>{not_voted_count.toLocaleString('el-GR')} απομένουν</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Departments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Κορυφαία Τμήματα</CardTitle>
            <Link to={createPageUrl('Records')}>
              <Button variant="ghost" size="sm" className="h-9">
                <span className="hidden sm:inline">Όλα</span>
                <ArrowRight className="h-4 w-4 sm:ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {top_departments.map((dept) => (
              <div key={dept.department} className="space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-700 truncate max-w-[140px] sm:max-w-[200px]">{dept.department}</span>
                  <span className="text-slate-500 whitespace-nowrap ml-2">
                    {dept.voted}/{dept.total} ({dept.percentage}%)
                  </span>
                </div>
                <Progress value={dept.percentage} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Account Counts */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Λογαριασμοί</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                  <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm sm:text-base font-medium text-slate-900">Χρεωστικοί</p>
                  <p className="text-xs sm:text-sm text-slate-500">Ενεργοί λογαριασμοί</p>
                </div>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-slate-900">{active_chreosi_count}</span>
            </div>
            <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                  <Vote className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm sm:text-base font-medium text-slate-900">Κανάλι</p>
                  <p className="text-xs sm:text-sm text-slate-500">Ενεργοί λογαριασμοί</p>
                </div>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-slate-900">{active_kanali_count}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">Πρόσφατες Καταχωρήσεις Κανάλι</CardTitle>
          <Link to={createPageUrl('NotFoundVoters')}>
            <Button variant="ghost" size="sm" className="h-9">
              <span className="hidden sm:inline">Προβολή Όλων</span>
              <ArrowRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recent_submissions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Δεν υπάρχουν καταχωρήσεις ακόμα</p>
          ) : (
            <div className="space-y-2">
              {recent_submissions.map(sub => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-2 sm:p-3 bg-slate-50 rounded-lg gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className={`p-1 sm:p-1.5 rounded-full flex-shrink-0 ${
                      sub.status === 'MARKED_VOTED' ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      {sub.status === 'MARKED_VOTED' ? (
                        <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">ID: {sub.submitted_id}</p>
                      <p className="text-xs text-slate-500 truncate">{sub.kanali_username}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                    sub.status === 'MARKED_VOTED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : sub.status === 'ALREADY_VOTED'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {sub.status === 'MARKED_VOTED' ? 'Επιτυχής'
                     : sub.status === 'ALREADY_VOTED' ? 'Ήδη Ψήφισε'
                     : 'Δεν Βρέθηκε'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SMS History */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            SMS History (τελευταία 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sms_logs.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Δεν υπάρχουν SMS ακόμα</p>
          ) : (
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b text-xs text-slate-500">
                    <th className="text-left py-2 pr-3 font-medium">Ημ/νία</th>
                    <th className="text-left py-2 pr-3 font-medium">Κατηγορία</th>
                    <th className="text-left py-2 pr-3 font-medium">Username</th>
                    <th className="text-left py-2 pr-3 font-medium">Τηλέφωνο</th>
                    <th className="text-left py-2 pr-3 font-medium">Κατάσταση</th>
                    <th className="text-left py-2 font-medium">Σφάλμα</th>
                  </tr>
                </thead>
                <tbody>
                  {sms_logs.map(log => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.created_date).toLocaleString('el-GR', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{log.category || '—'}</td>
                      <td className="py-2 pr-3 font-medium truncate max-w-[120px]">{log.to_username || '—'}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{log.to_phone || '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge className={log.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-red-100 text-red-700 hover:bg-red-100'
                        }>
                          {log.status === 'sent' ? 'Εστάλη' : 'Απέτυχε'}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-red-500 truncate max-w-[150px]">{log.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}