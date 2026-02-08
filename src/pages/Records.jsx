import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/ui/DataGrid';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Database,
  Plus,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Phone,
  Sheet,
  Upload,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)' },
  { key: 'ucid', label: 'UCID' },
  { key: 'last_name', label: 'Επίθετο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'department', label: 'Τμήμα' },
  { key: 'admission_year', label: 'Εισδοχή' },
  { key: 'academic_level', label: 'Επίπεδο' },
  { key: 'mobile_phone', label: 'Κινητό', render: (val) => val ? (
    <a href={`tel:${val}`} className="text-blue-600 hover:underline flex items-center gap-1">
      <Phone className="h-3 w-3" /> {val}
    </a>
  ) : '-' },
  { key: 'contact_person_1', label: 'Άτομο 1' },
  { key: 'contact_person_2', label: 'Άτομο 2' },
  { key: 'member', label: 'Μέλος' },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης' },
  { key: 'voted', label: 'Ψήφισε', render: (val) => (
    <Badge variant={val ? 'default' : 'secondary'} className={val ? 'bg-emerald-100 text-emerald-700' : ''}>
      {val ? 'ΝΑΙ' : 'ΟΧΙ'}
    </Badge>
  )},
  { key: 'notes', label: 'Σημειώσεις', render: (val) => (
    <span className="truncate max-w-[150px] block">{val || '-'}</span>
  )}
];

export default function Records() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState({ open: false, person: null });
  const [addDialog, setAddDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [sheetsDialog, setSheetsDialog] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Voters');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastExportUrl, setLastExportUrl] = useState('');

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Person.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setAddDialog(false);
      setFormData({});
      toast.success('Η εγγραφή δημιουργήθηκε');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      setEditDialog({ open: false, person: null });
      toast.success('Η εγγραφή ενημερώθηκε');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['people']);
      toast.success('Η εγγραφή διαγράφηκε');
    }
  });

  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label).join(',');
    const rows = people.map(p => 
      COLUMNS.map(c => {
        let val = p[c.key];
        if (c.key === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `εγγραφές_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

  const openEditDialog = (person) => {
    setFormData({ ...person });
    setEditDialog({ open: true, person });
  };

  const handleExportToSheets = async (createNew = false) => {
    setIsExporting(true);
    try {
      const payload = createNew ? {} : { spreadsheetId, sheetName };
      const response = await base44.functions.invoke('exportToGoogleSheets', payload);
      
      setLastExportUrl(response.data.url);
      toast.success(`Εξαγωγή ολοκληρώθηκε! ${response.data.recordsExported} εγγραφές`);
      
      if (createNew) {
        setSpreadsheetId(response.data.spreadsheetId);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Σφάλμα κατά την εξαγωγή');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFromSheets = async () => {
    if (!spreadsheetId) {
      toast.error('Παρακαλώ εισάγετε Spreadsheet ID');
      return;
    }

    setIsImporting(true);
    try {
      const response = await base44.functions.invoke('importFromGoogleSheets', {
        spreadsheetId,
        sheetName
      });
      
      queryClient.invalidateQueries(['people']);
      toast.success(`Εισαγωγή ολοκληρώθηκε! Δημιουργήθηκαν: ${response.data.created}, Ενημερώθηκαν: ${response.data.updated}`);
      
      if (response.data.errors && response.data.errors.length > 0) {
        toast.warning(`${response.data.errors.length} σφάλματα κατά την εισαγωγή`);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Σφάλμα κατά την εισαγωγή');
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Εγγραφές"
        subtitle={`${people.length.toLocaleString('el-GR')} συνολικά εγγραφές`}
        icon={Database}
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή CSV
            </Button>
            <Button variant="outline" onClick={() => setSheetsDialog(true)}>
              <Sheet className="h-4 w-4 mr-2" />
              Google Sheets
            </Button>
            <Button onClick={() => { setFormData({}); setAddDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Νέα Εγγραφή
            </Button>
          </>
        }
      />

      <DataGrid
        data={people}
        columns={COLUMNS}
        pageSize={25}
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEditDialog(row)}>
                <Pencil className="h-4 w-4 mr-2" />
                Επεξεργασία
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  if (confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εγγραφή;')) {
                    deleteMutation.mutate(row.id);
                  }
                }}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Google Sheets Dialog */}
      <Dialog open={sheetsDialog} onOpenChange={setSheetsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Συγχρονισμός με Google Sheets</DialogTitle>
            <DialogDescription>
              Εξάγετε ή εισάγετε δεδομένα από Google Sheets
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Export Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Εξαγωγή σε Google Sheets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={() => handleExportToSheets(true)} 
                  disabled={isExporting}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Δημιουργία Νέου Spreadsheet
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-slate-500">Ή</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Spreadsheet ID</Label>
                    <Input
                      placeholder="1ABC...xyz"
                      value={spreadsheetId}
                      onChange={(e) => setSpreadsheetId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Όνομα Sheet</Label>
                    <Input
                      placeholder="Voters"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={() => handleExportToSheets(false)} 
                    disabled={isExporting || !spreadsheetId}
                    variant="outline"
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Ενημέρωση Υπάρχοντος Spreadsheet
                  </Button>
                </div>

                {lastExportUrl && (
                  <a 
                    href={lastExportUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Άνοιγμα Spreadsheet
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Import Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Εισαγωγή από Google Sheets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Spreadsheet ID *</Label>
                    <Input
                      placeholder="1ABC...xyz"
                      value={spreadsheetId}
                      onChange={(e) => setSpreadsheetId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Όνομα Sheet</Label>
                    <Input
                      placeholder="Voters"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleImportFromSheets} 
                    disabled={isImporting || !spreadsheetId}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Εισαγωγή Δεδομένων
                  </Button>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p>💡 Το spreadsheet πρέπει να έχει τις ίδιες στήλες με την εξαγωγή</p>
                  <p>⚠️ Οι υπάρχουσες εγγραφές θα ενημερωθούν βάσει του ΑΤ (ID)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetsDialog(false)}>
              Κλείσιμο
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={addDialog || editDialog.open} onOpenChange={(open) => {
        if (!open) {
          setAddDialog(false);
          setEditDialog({ open: false, person: null });
          setFormData({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editDialog.person ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>ΑΤ (ID) *</Label>
              <Input
                value={formData.person_id || ''}
                onChange={(e) => setFormData({...formData, person_id: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>UCID</Label>
              <Input
                value={formData.ucid || ''}
                onChange={(e) => setFormData({...formData, ucid: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Επίθετο</Label>
              <Input
                value={formData.last_name || ''}
                onChange={(e) => setFormData({...formData, last_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Όνομα</Label>
              <Input
                value={formData.first_name || ''}
                onChange={(e) => setFormData({...formData, first_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Τμήμα</Label>
              <Input
                value={formData.department || ''}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Έτος Εισδοχής</Label>
              <Input
                value={formData.admission_year || ''}
                onChange={(e) => setFormData({...formData, admission_year: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Κινητό</Label>
              <Input
                value={formData.mobile_phone || ''}
                onChange={(e) => setFormData({...formData, mobile_phone: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Ακαδημαϊκό Επίπεδο</Label>
              <Input
                value={formData.academic_level || ''}
                onChange={(e) => setFormData({...formData, academic_level: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Άτομο 1</Label>
              <Input
                value={formData.contact_person_1 || ''}
                onChange={(e) => setFormData({...formData, contact_person_1: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Άτομο 2</Label>
              <Input
                value={formData.contact_person_2 || ''}
                onChange={(e) => setFormData({...formData, contact_person_2: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Μέλος</Label>
              <Input
                value={formData.member || ''}
                onChange={(e) => setFormData({...formData, member: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Σύμβολο Πρόβλεψης</Label>
              <Input
                value={formData.prediction_symbol || ''}
                onChange={(e) => setFormData({...formData, prediction_symbol: e.target.value})}
              />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={formData.voted || false}
                onCheckedChange={(v) => setFormData({...formData, voted: v})}
              />
              <Label>Ψήφισε</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Σημειώσεις</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddDialog(false);
              setEditDialog({ open: false, person: null });
              setFormData({});
            }}>
              Ακύρωση
            </Button>
            <Button 
              onClick={() => {
                if (!formData.person_id) {
                  toast.error('Το πεδίο ΑΤ (ID) είναι υποχρεωτικό');
                  return;
                }
                if (editDialog.person) {
                  updateMutation.mutate({ id: editDialog.person.id, data: formData });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editDialog.person ? 'Αποθήκευση' : 'Δημιουργία'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}