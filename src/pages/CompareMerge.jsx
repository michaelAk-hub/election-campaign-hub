import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GitCompare,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

export default function CompareMerge() {
  const [step, setStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedData, setUploadedData] = useState([]);
  const [matchKey, setMatchKey] = useState('person_id');
  const [comparisonResults, setComparisonResults] = useState(null);

  const { data: people = [], isLoading } = useQuery({
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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFile(file);
    
    // Parse CSV
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        data.push(row);
      }
      
      setUploadedData(data);
      setStep(2);
      toast.success(`Φορτώθηκαν ${data.length} εγγραφές`);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const runComparison = () => {
    const baseMap = new Map(people.map(p => [p[matchKey], p]));
    const uploadMap = new Map();
    const duplicates = [];

    uploadedData.forEach((row, idx) => {
      const key = row[matchKey];
      if (!key) return;
      if (uploadMap.has(key)) {
        duplicates.push({ key, indices: [uploadMap.get(key).idx, idx] });
      }
      uploadMap.set(key, { ...row, idx });
    });

    const matched = [];
    const baseOnly = [];
    const uploadOnly = [];

    people.forEach(p => {
      const key = p[matchKey];
      if (uploadMap.has(key)) {
        matched.push({
          base: p,
          upload: uploadMap.get(key),
          key
        });
      } else {
        baseOnly.push(p);
      }
    });

    uploadedData.forEach(row => {
      const key = row[matchKey];
      if (key && !baseMap.has(key)) {
        uploadOnly.push(row);
      }
    });

    setComparisonResults({
      matched,
      baseOnly,
      uploadOnly,
      duplicates
    });
    setStep(3);
  };

  const exportBackup = () => {
    const headers = Object.keys(people[0] || {}).join(',');
    const rows = people.map(p => 
      Object.values(p).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Αντίγραφο ασφαλείας δημιουργήθηκε');
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Σύγκριση & Συγχώνευση"
        subtitle="Εισαγωγή και σύγκριση δεδομένων από εξωτερικά αρχεία"
        icon={GitCompare}
      />

      {/* Progress */}
      <div className="flex items-center gap-4 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {s}
            </div>
            <span className={`text-sm ${step >= s ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
              {s === 1 ? 'Μεταφόρτωση' : s === 2 ? 'Ρύθμιση' : 'Αποτελέσματα'}
            </span>
            {s < 3 && <div className="w-8 h-0.5 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Μεταφόρτωση Αρχείου</CardTitle>
            <CardDescription>
              Επιλέξτε ένα αρχείο CSV για σύγκριση με τα υπάρχοντα δεδομένα
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
              <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <Label className="cursor-pointer">
                <span className="text-blue-600 hover:underline">Επιλέξτε αρχείο</span>
                <span className="text-slate-500 dark:text-slate-400"> ή σύρετε εδώ</span>
                <Input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </Label>
              <p className="text-sm text-slate-400 mt-2">CSV, XLSX (μέγ. 10MB)</p>
            </div>
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong>Τρέχοντα δεδομένα:</strong> {people.length.toLocaleString('el-GR')} εγγραφές
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Configure */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Ρύθμιση Σύγκρισης</CardTitle>
            <CardDescription>
              Επιλέξτε το κλειδί αντιστοίχισης για τη σύγκριση
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertDescription>
                Φορτώθηκαν {uploadedData.length} εγγραφές από: {uploadedFile?.name}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Κλειδί Αντιστοίχισης</Label>
              <Select value={matchKey} onValueChange={setMatchKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person_id">ΑΤ (ID)</SelectItem>
                  <SelectItem value="ucid">UCID</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Οι εγγραφές θα αντιστοιχιστούν με βάση αυτό το πεδίο
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                Πίσω
              </Button>
              <Button onClick={runComparison}>
                Εκτέλεση Σύγκρισης
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {step === 3 && comparisonResults && (
        <div className="space-y-6">
          {comparisonResults.duplicates.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Βρέθηκαν {comparisonResults.duplicates.length} διπλότυπα κλειδιά στο αρχείο. 
                Παρακαλώ ελέγξτε τα δεδομένα.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                <p className="text-2xl font-bold">{comparisonResults.matched.length}</p>
                <p className="text-slate-500 dark:text-slate-400">Αντιστοιχήθηκαν</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="h-8 w-8 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-2">
                  <span className="text-amber-600 font-bold">B</span>
                </div>
                <p className="text-2xl font-bold">{comparisonResults.baseOnly.length}</p>
                <p className="text-slate-500 dark:text-slate-400">Μόνο στη Βάση</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="h-8 w-8 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-2">
                  <span className="text-blue-600 font-bold">U</span>
                </div>
                <p className="text-2xl font-bold">{comparisonResults.uploadOnly.length}</p>
                <p className="text-slate-500 dark:text-slate-400">Μόνο στο Αρχείο</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ενέργειες</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Πριν τη συγχώνευση, συνιστάται να δημιουργήσετε αντίγραφο ασφαλείας.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button variant="outline" onClick={exportBackup}>
                  <Download className="h-4 w-4 mr-2" />
                  Αντίγραφο Ασφαλείας
                </Button>
                <Button 
                  onClick={() => {
                    toast.info('Η λειτουργία συγχώνευσης θα είναι διαθέσιμη σύντομα');
                  }}
                >
                  Συγχώνευση Δεδομένων
                </Button>
              </div>

              <Button variant="outline" onClick={() => setStep(1)}>
                Νέα Σύγκριση
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}