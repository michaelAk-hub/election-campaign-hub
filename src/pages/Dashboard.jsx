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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  CheckCircle2,
  Download,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [importMode, setImportMode] = useState('append');
  const [isUploading, setIsUploading] = useState(false);
  const [isMarkingVoted, setIsMarkingVoted] = useState(false);

  const { data: people = [], isLoading: loadingPeople, refetch } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;

      while (hasMore) {
        const batch = await base44.entities.Person.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const { data: chreosiAccounts = [] } = useQuery({
    queryKey: ['chreosi-accounts'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.entities.ChreosiAccount.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const { data: kanaliAccounts = [] } = useQuery({
    queryKey: ['kanali-accounts'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.entities.KanaliAccount.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const { data: notFoundVoters = [] } = useQuery({
    queryKey: ['not-found-voters'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.entities.NotFoundVoter.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
  });

  const { data: recentSubmissions = [] } = useQuery({
    queryKey: ['recent-submissions'],
    queryFn: async () => {
      let allRecords = [];
      let skip = 0;
      const limit = 5000;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.entities.KanaliSubmission.list('-created_date', limit, skip);
        allRecords = allRecords.concat(batch);
        skip += limit;
        hasMore = batch.length === limit;
      }
      return allRecords;
    }
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
      .sort((a, b) => b.voted - a.voted)
      .slice(0, 5);
  }, [people]);

  const downloadTemplate = () => {
    const headers = [
      'department',
      'admission_year',
      'academic_level',
      'person_id',
      'ucid',
      'mobile_phone',
      'first_name',
      'last_name',
      'contact_person_1',
      'contact_person_2',
      'member',
      'prediction_symbol',
      'voted',
      'notes',
      'monadikos_kanali'
    ];
    
    const csv = '\uFEFF' + headers.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_person_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Το πρότυπο κατέβηκε');
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Επιλέξτε αρχείο');
      return;
    }

    setIsUploading(true);

    try {
      // Upload file first
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });

      // Extract data from file
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            department: { type: 'string' },
            admission_year: { type: 'string' },
            academic_level: { type: 'string' },
            person_id: { type: 'string' },
            ucid: { type: 'string' },
            mobile_phone: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            contact_person_1: { type: 'string' },
            contact_person_2: { type: 'string' },
            member: { type: 'string' },
            prediction_symbol: { type: 'string' },
            voted: { type: 'boolean' },
            notes: { type: 'string' },
            monadikos_kanali: { type: 'string' }
          }
        }
      });

      if (result.status === 'error') {
        toast.error('Σφάλμα ανάλυσης αρχείου: ' + result.details);
        setIsUploading(false);
        return;
      }

      const records = Array.isArray(result.output) ? result.output : [result.output];

      // Delete all if replace mode
      if (importMode === 'replace') {
        let allPeople = [];
        let skip = 0;
        const limit = 5000;
        let hasMore = true;

        while (hasMore) {
          const batch = await base44.entities.Person.list('-created_date', limit, skip);
          allPeople = allPeople.concat(batch);
          skip += limit;
          hasMore = batch.length === limit;
        }

        for (const person of allPeople) {
          await base44.entities.Person.delete(person.id);
        }
        toast.success(`Διαγράφηκαν ${allPeople.length} εγγραφές`);
      }

      // Import new records
      await base44.entities.Person.bulkCreate(records);
      
      toast.success(`Εισήχθησαν ${records.length} εγγραφές επιτυχώς`);
      setUploadDialog(false);
      setUploadFile(null);
      refetch();
    } catch (error) {
      toast.error('Σφάλμα: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMarkHalfVoted = async () => {
    if (!window.confirm('Θα επισημανθεί το μισό από τα άτομα με σύμβολο Σ, Ο, Π ως ψηφίσαντες. Συνέχεια;')) return;
    setIsMarkingVoted(true);
    try {
      const response = await base44.functions.invoke('markHalfVoted', {});
      toast.success(`Επισημάνθηκαν ${response.data.updated} εγγραφές ως ψηφίσαντες`);
      refetch();
    } catch (error) {
      toast.error('Σφάλμα: ' + error.message);
    } finally {
      setIsMarkingVoted(false);
    }
  };

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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="h-10">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Πρότυπο</span>
            </Button>
            <Button variant="default" onClick={() => setUploadDialog(true)} className="h-10">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Εισαγωγή</span>
            </Button>
            <Button variant="outline" onClick={() => refetch()} className="h-10">
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ανανέωση</span>
            </Button>
            <Button variant="outline" onClick={handleMarkHalfVoted} disabled={isMarkingVoted} className="h-10 border-amber-300 text-amber-700 hover:bg-amber-50">
              <Vote className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{isMarkingVoted ? 'Επεξεργασία...' : 'Σήμανση 50% (Σ/Ο/Π)'}</span>
            </Button>
          </div>
        }
      />

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Department Stats */}
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
            {departmentStats.map((dept, idx) => (
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

        {/* Account Stats */}
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
              <span className="text-xl sm:text-2xl font-bold text-slate-900">
                {chreosiAccounts.filter(a => a.is_active).length}
              </span>
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
              <span className="text-xl sm:text-2xl font-bold text-slate-900">
                {kanaliAccounts.filter(a => a.is_active).length}
              </span>
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
          {recentSubmissions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Δεν υπάρχουν καταχωρήσεις ακόμα</p>
          ) : (
            <div className="space-y-2">
              {recentSubmissions.slice(0, 5).map(sub => (
                <div 
                  key={sub.id} 
                  className="flex items-center justify-between p-2 sm:p-3 bg-slate-50 rounded-lg gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className={`p-1 sm:p-1.5 rounded-full flex-shrink-0 ${
                      sub.status === 'MARKED_VOTED' 
                        ? 'bg-emerald-100' 
                        : 'bg-red-100'
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
                    {sub.status === 'MARKED_VOTED' ? 'Επιτυχής' :
                     sub.status === 'ALREADY_VOTED' ? 'Ήδη Ψήφισε' : 'Δεν Βρέθηκε'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Εισαγωγή Δεδομένων από Excel/CSV</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Επιλογή Αρχείου</Label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setUploadFile(e.target.files[0])}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <p className="text-xs text-slate-500">
                Η πρώτη γραμμή του αρχείου πρέπει να περιέχει τα ονόματα των πεδίων
              </p>
            </div>

            <div className="space-y-2">
              <Label>Τρόπος Εισαγωγής</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="text-blue-600"
                  />
                  <div>
                    <p className="font-medium text-sm">Προσθήκη</p>
                    <p className="text-xs text-slate-500">Προσθήκη νέων εγγραφών στις υπάρχουσες</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="text-red-600"
                  />
                  <div>
                    <p className="font-medium text-sm text-red-600">Αντικατάσταση</p>
                    <p className="text-xs text-slate-500">Διαγραφή όλων και εισαγωγή νέων</p>
                  </div>
                </label>
              </div>
            </div>

            {importMode === 'replace' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium">⚠️ Προσοχή!</p>
                <p className="text-xs text-red-600 mt-1">
                  Όλες οι υπάρχουσες εγγραφές θα διαγραφούν πριν την εισαγωγή των νέων.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)} disabled={isUploading}>
              Ακύρωση
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile || isUploading}>
              {isUploading ? 'Εισαγωγή...' : 'Εισαγωγή'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}