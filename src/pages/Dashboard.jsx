import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard,
  Users,
  Vote,
  UserCheck,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  ArrowRight,
  Clock,
  CheckCircle2
} from 'lucide-react';

export default function Dashboard() {
  const { data: people = [], isLoading: loadingPeople, refetch } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const { data: chreosiAccounts = [] } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: () => base44.entities.ChreosiAccount.list()
  });

  const { data: kanaliAccounts = [] } = useQuery({
    queryKey: ['kanali-accounts'],
    queryFn: () => base44.entities.KanaliAccount.list()
  });

  const { data: notFoundVoters = [] } = useQuery({
    queryKey: ['not-found-voters'],
    queryFn: () => base44.entities.NotFoundVoter.list('-created_date', 100)
  });

  const { data: recentSubmissions = [] } = useQuery({
    queryKey: ['recent-submissions'],
    queryFn: () => base44.entities.KanaliSubmission.list('-created_date', 50)
  });

  const totalPeople = people.length;
  const votedCount = people.filter(p => p.voted).length;
  const notVotedCount = totalPeople - votedCount;
  const votePercentage = totalPeople > 0 ? Math.round((votedCount / totalPeople) * 100) : 0;

  // Department stats
  const departmentStats = React.useMemo(() => {
    const stats = {};
    people.forEach(p => {
      const dept = p.department || 'Άγνωστο';
      if (!stats[dept]) {
        stats[dept] = { total: 0, voted: 0 };
      }
      stats[dept].total++;
      if (p.voted) stats[dept].voted++;
    });
    return Object.entries(stats)
      .map(([dept, data]) => ({
        department: dept,
        total: data.total,
        voted: data.voted,
        percentage: Math.round((data.voted / data.total) * 100)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [people]);

  if (loadingPeople) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Πίνακας Ελέγχου"
        subtitle="Επισκόπηση της εκλογικής διαδικασίας"
        icon={LayoutDashboard}
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Ανανέωση
          </Button>
        }
      />

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Σύνολο Εγγραφών"
          value={totalPeople.toLocaleString('el-GR')}
          icon={Users}
          iconClassName="bg-blue-100"
        />
        <StatCard
          title="Ψήφισαν"
          value={votedCount.toLocaleString('el-GR')}
          subtitle={`${votePercentage}% του συνόλου`}
          icon={CheckCircle2}
          iconClassName="bg-emerald-100"
        />
        <StatCard
          title="Δεν Ψήφισαν"
          value={notVotedCount.toLocaleString('el-GR')}
          icon={Clock}
          iconClassName="bg-amber-100"
        />
        <StatCard
          title="Αποτυχημένες Καταχωρήσεις"
          value={notFoundVoters.length}
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
              <span className="font-semibold text-slate-900">{votePercentage}%</span>
            </div>
            <Progress value={votePercentage} className="h-3" />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{votedCount.toLocaleString('el-GR')} ψήφισαν</span>
              <span>{notVotedCount.toLocaleString('el-GR')} απομένουν</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Stats */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Κορυφαία Τμήματα</CardTitle>
            <Link to={createPageUrl('Records')}>
              <Button variant="ghost" size="sm">
                Όλα <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {departmentStats.map((dept, idx) => (
              <div key={dept.department} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate max-w-[200px]">{dept.department}</span>
                  <span className="text-slate-500">
                    {dept.voted}/{dept.total} ({dept.percentage}%)
                  </span>
                </div>
                <Progress value={dept.percentage} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Account Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Λογαριασμοί</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Χρεωστικοί</p>
                  <p className="text-sm text-slate-500">Ενεργοί λογαριασμοί</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-slate-900">
                {chreosiAccounts.filter(a => a.is_active).length}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Vote className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Κανάλι</p>
                  <p className="text-sm text-slate-500">Ενεργοί λογαριασμοί</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-slate-900">
                {kanaliAccounts.filter(a => a.is_active).length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Πρόσφατες Καταχωρήσεις Κανάλι</CardTitle>
          <Link to={createPageUrl('NotFoundVoters')}>
            <Button variant="ghost" size="sm">
              Προβολή Όλων <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Δεν υπάρχουν καταχωρήσεις ακόμα</p>
          ) : (
            <div className="space-y-2">
              {recentSubmissions.slice(0, 5).map(sub => (
                <div 
                  key={sub.id} 
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full ${
                      sub.status === 'MARKED_VOTED' 
                        ? 'bg-emerald-100' 
                        : 'bg-red-100'
                    }`}>
                      {sub.status === 'MARKED_VOTED' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">ID: {sub.submitted_id}</p>
                      <p className="text-xs text-slate-500">{sub.kanali_username}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    sub.status === 'MARKED_VOTED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : sub.status === 'ALREADY_VOTED'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {sub.status === 'MARKED_VOTED' ? 'Επιτυχής' :
                     sub.status === 'ALREADY_VOTED' ? 'Ήδη Ψήφισε' : 'Δεν Βρέθηκε'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}