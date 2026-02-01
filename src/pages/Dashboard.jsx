import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { 
  Database, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  UserCheck,
  Vote,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list(),
    initialData: [],
  });

  const { data: chreosiAccounts = [] } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: () => base44.entities.ChreosiAccount.list(),
    initialData: [],
  });

  const { data: kanaliAccounts = [] } = useQuery({
    queryKey: ['kanali-accounts'],
    queryFn: () => base44.entities.KanaliAccount.list(),
    initialData: [],
  });

  const { data: notFoundVoters = [] } = useQuery({
    queryKey: ['not-found-voters'],
    queryFn: () => base44.entities.NotFoundVoter.list(),
    initialData: [],
  });

  const stats = {
    totalPeople: people.length,
    voted: people.filter(p => p.voted).length,
    notVoted: people.filter(p => !p.voted).length,
    chreosiUsers: chreosiAccounts.filter(a => a.is_active).length,
    kanaliUsers: kanaliAccounts.filter(a => a.is_active).length,
    notFoundSubmissions: notFoundVoters.length,
  };

  const votedPercentage = stats.totalPeople > 0 
    ? ((stats.voted / stats.totalPeople) * 100).toFixed(1) 
    : 0;

  const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }) => (
    <Card className="relative overflow-hidden hover:shadow-lg transition-shadow">
      <div className={`absolute top-0 right-0 w-32 h-32 ${color} opacity-5 rounded-full transform translate-x-12 -translate-y-12`} />
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
            <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
          </div>
        </div>
        {trend && (
          <div className="flex items-center mt-3 text-sm">
            <TrendingUp className="w-4 h-4 mr-1 text-green-600" />
            <span className="text-green-600 font-medium">{trend}</span>
          </div>
        )}
      </CardHeader>
    </Card>
  );

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Πίνακας Ελέγχου</h1>
        <p className="text-slate-600 mt-2">Επισκόπηση εκλογικών δεδομένων και δραστηριότητας</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Σύνολο Ατόμων"
          value={stats.totalPeople.toLocaleString('el-GR')}
          icon={Database}
          color="bg-blue-600"
          subtitle="Εγγεγραμμένοι ψηφοφόροι"
        />
        <StatCard
          title="Ψήφισαν"
          value={stats.voted.toLocaleString('el-GR')}
          icon={CheckCircle2}
          color="bg-green-600"
          subtitle={`${votedPercentage}% συμμετοχή`}
          trend={votedPercentage > 50 ? `+${votedPercentage}%` : null}
        />
        <StatCard
          title="Δεν Ψήφισαν"
          value={stats.notVoted.toLocaleString('el-GR')}
          icon={Vote}
          color="bg-amber-600"
          subtitle="Απομένουν"
        />
        <StatCard
          title="Χρήστες Χρέωσης"
          value={stats.chreosiUsers}
          icon={UserCheck}
          color="bg-purple-600"
          subtitle="Ενεργοί λογαριασμοί"
        />
        <StatCard
          title="Χρήστες Καναλιού"
          value={stats.kanaliUsers}
          icon={Users}
          color="bg-indigo-600"
          subtitle="Ενεργοί λογαριασμοί"
        />
        <StatCard
          title="Μη Εύρεση"
          value={stats.notFoundSubmissions}
          icon={AlertCircle}
          color="bg-red-600"
          subtitle="Αποτυχημένες υποβολές"
        />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Γρήγορες Ενέργειες</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdmin && (
              <Link to={createPageUrl('DataGrid')}>
                <Button className="w-full bg-blue-900 hover:bg-blue-800">
                  <Database className="w-4 h-4 mr-2" />
                  Προβολή Δεδομένων
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to={createPageUrl('Accounts')}>
                <Button className="w-full bg-purple-900 hover:bg-purple-800">
                  <Users className="w-4 h-4 mr-2" />
                  Διαχείριση Λογαριασμών
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to={createPageUrl('Messages')}>
                <Button className="w-full bg-indigo-900 hover:bg-indigo-800">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Αποστολή Μηνύματος
                </Button>
              </Link>
            )}
            <Link to={createPageUrl('NotFoundVoters')}>
              <Button className="w-full bg-red-900 hover:bg-red-800">
                <AlertCircle className="w-4 h-4 mr-2" />
                Μη Εύρεση Ψηφοφόρων
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Πρόσφατη Δραστηριότητα</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Σύστημα ενεργό και λειτουργικό</p>
                <p className="text-xs text-slate-500">Όλες οι υπηρεσίες λειτουργούν κανονικά</p>
              </div>
            </div>
            {stats.totalPeople === 0 && (
              <div className="flex items-center gap-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Δεν υπάρχουν δεδομένα</p>
                  <p className="text-xs text-amber-700">Ξεκινήστε με εισαγωγή αρχείου Access</p>
                </div>
                {isAdmin && (
                  <Link to={createPageUrl('BootImport')}>
                    <Button size="sm" variant="outline" className="border-amber-300">
                      Εισαγωγή Τώρα
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}