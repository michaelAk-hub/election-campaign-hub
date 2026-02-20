import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Download, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const MANDATORY_FIELDS = [
  { name: 'person_id', label: 'ΑΤ (ID)', type: 'string' },
  { name: 'department', label: 'ΤΜΗΜΑ', type: 'string' },
  { name: 'admission_year', label: 'ΕΙΣΔΟΧΗ', type: 'string' },
  { name: 'academic_level', label: 'ΕΠΙΠΕΔΟ', type: 'string' },
  { name: 'ucid', label: 'UCID', type: 'string' },
  { name: 'mobile_phone', label: 'ΚΙΝΗΤΟ', type: 'string' },
  { name: 'first_name', label: 'ΟΝΟΜΑ', type: 'string' },
  { name: 'last_name', label: 'ΕΠΙΘΕΤΟ', type: 'string' },
  { name: 'contact_person_1', label: 'ATOMO_1', type: 'string' },
  { name: 'contact_person_2', label: 'ATOMO_2', type: 'string' },
  { name: 'member', label: 'ΜΕΛΟΣ', type: 'string' },
  { name: 'prediction_symbol', label: 'Σύμβολο πρόβλεψης', type: 'string' }
];

const FIELD_TYPES = [
  { value: 'string', label: 'Κείμενο (Text)' },
  { value: 'number', label: 'Αριθμός (Number)' },
  { value: 'boolean', label: 'Ναι/Όχι (Boolean)' },
  { value: 'date', label: 'Ημερομηνία (Date)' }
];

export default function DynamicImportModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Define fields, 2: Upload file, 3: Progress
  const [customFields, setCustomFields] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('string');
  const [datasetName, setDatasetName] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [importComplete, setImportComplete] = useState(false);
  const [error, setError] = useState(null);

  const handleAddField = () => {
    const trimmedName = newFieldName.trim();
    
    if (!trimmedName) {
      toast.error('Το όνομα πεδίου δεν μπορεί να είναι κενό');
      return;
    }

    // Check if field already exists in mandatory fields
    if (MANDATORY_FIELDS.some(f => f.name === trimmedName)) {
      toast.error('Αυτό το όνομα πεδίου υπάρχει ήδη στα υποχρεωτικά πεδία');
      return;
    }

    // Check if field already exists in custom fields
    if (customFields.some(f => f.name === trimmedName)) {
      toast.error('Αυτό το όνομα πεδίου υπάρχει ήδη');
      return;
    }

    setCustomFields([...customFields, { name: trimmedName, type: newFieldType }]);
    setNewFieldName('');
    setNewFieldType('string');
  };

  const handleRemoveField = (index) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleGenerateTemplate = async () => {
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('generatePersonTemplate', {
        session_token: sessionToken,
        custom_fields: customFields
      });

      // Download the template
      const link = document.createElement('a');
      link.href = data.template_url;
      link.download = 'person_import_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Το πρότυπο αρχείο δημιουργήθηκε επιτυχώς');
      setStep(2);
    } catch (err) {
      console.error('Template generation error:', err);
      toast.error('Σφάλμα κατά τη δημιουργία προτύπου');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!uploadedFile) {
      toast.error('Παρακαλώ επιλέξτε ένα αρχείο');
      return;
    }

    if (!datasetName.trim()) {
      toast.error('Παρακαλώ δώστε ένα όνομα στο dataset');
      return;
    }

    setImporting(true);
    setStep(3);
    setProgress({ current: 0, total: 0, percentage: 0 });
    setError(null);

    try {
      const sessionToken = localStorage.getItem('app_session_token');

      // Upload file first
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadedFile });

      // Start import
      const { data } = await base44.functions.invoke('dynamicImportPersons', {
        session_token: sessionToken,
        file_url,
        dataset_name: datasetName.trim(),
        custom_fields: customFields
      });

      if (data.success) {
        setProgress({ 
          current: data.total_imported, 
          total: data.total_imported, 
          percentage: 100 
        });
        setImportComplete(true);
        toast.success(`Η εισαγωγή ολοκληρώθηκε! ${data.total_imported} εγγραφές εισήχθησαν`);
        
        // Call onSuccess callback
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(data.error || 'Άγνωστο σφάλμα κατά την εισαγωγή');
        toast.error(data.error || 'Η εισαγωγή απέτυχε');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Σφάλμα κατά την εισαγωγή δεδομένων');
      toast.error('Σφάλμα κατά την εισαγωγή δεδομένων');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (!importing) {
      setStep(1);
      setCustomFields([]);
      setNewFieldName('');
      setNewFieldType('string');
      setDatasetName('');
      setUploadedFile(null);
      setImporting(false);
      setProgress({ current: 0, total: 0, percentage: 0 });
      setImportComplete(false);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Βήμα 1: Ορισμός Προσαρμοσμένων Πεδίων'}
            {step === 2 && 'Βήμα 2: Μεταφόρτωση Αρχείου'}
            {step === 3 && 'Βήμα 3: Εισαγωγή Δεδομένων'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Προσθέστε τυχόν προσαρμοσμένα πεδία που θέλετε να συμπεριλάβετε'}
            {step === 2 && 'Μεταφορτώστε το αρχείο Excel με τα δεδομένα'}
            {step === 3 && 'Εισαγωγή δεδομένων σε εξέλιξη...'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Define Custom Fields */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Mandatory Fields Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Υποχρεωτικά Πεδία:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                {MANDATORY_FIELDS.map(field => (
                  <div key={field.name}>• {field.label}</div>
                ))}
              </div>
            </div>

            {/* Add Custom Field */}
            <div className="space-y-4">
              <h4 className="font-semibold">Προσθήκη Προσαρμοσμένου Πεδίου:</h4>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Όνομα Πεδίου</Label>
                  <Input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="π.χ. phone_2, address"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddField()}
                  />
                </div>
                <div className="w-48">
                  <Label>Τύπος</Label>
                  <Select value={newFieldType} onValueChange={setNewFieldType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddField} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Custom Fields List */}
            {customFields.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Προσαρμοσμένα Πεδία ({customFields.length}):</h4>
                <div className="space-y-2">
                  {customFields.map((field, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium">{field.name}</span>
                        <span className="text-slate-500 text-sm ml-2">
                          ({FIELD_TYPES.find(t => t.value === field.type)?.label})
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveField(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={handleClose}>
                Ακύρωση
              </Button>
              <Button onClick={handleGenerateTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Δημιουργία Προτύπου & Συνέχεια
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload File */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Dataset Name */}
            <div className="space-y-2">
              <Label>Όνομα Dataset *</Label>
              <Input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="π.χ. Εισαγωγή Ιανουαρίου 2026"
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Μεταφόρτωση Αρχείου Excel *</Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-600 mb-2">
                    {uploadedFile ? uploadedFile.name : 'Κάντε κλικ για επιλογή αρχείου'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Υποστηρίζονται αρχεία .xlsx και .xls
                  </p>
                </label>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-amber-900 mb-2">Σημαντικό:</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• Η πρώτη γραμμή πρέπει να περιέχει τα ονόματα των στηλών</li>
                <li>• Όλες οι υποχρεωτικές στήλες πρέπει να υπάρχουν</li>
                <li>• Τα κενά κελιά επιτρέπονται</li>
                <li>• Το αρχείο μπορεί να περιέχει πάνω από 5000 γραμμές</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(1)}>
                Πίσω
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={!uploadedFile || !datasetName.trim()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Εισαγωγή Δεδομένων
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Progress */}
        {step === 3 && (
          <div className="space-y-6">
            {!error && !importComplete && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-16 w-16 animate-spin text-blue-600 mb-4" />
                <p className="text-lg font-medium text-slate-900 mb-2">
                  Εισαγωγή δεδομένων σε εξέλιξη...
                </p>
                <p className="text-sm text-slate-500">
                  Παρακαλώ περιμένετε...
                </p>
              </div>
            )}

            {importComplete && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <p className="text-lg font-medium text-slate-900 mb-2">
                  Η εισαγωγή ολοκληρώθηκε επιτυχώς!
                </p>
                <p className="text-sm text-slate-500 mb-6">
                  {progress.total} εγγραφές εισήχθησαν
                </p>
                <Button onClick={handleClose}>
                  Κλείσιμο
                </Button>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="h-10 w-10 text-red-600" />
                </div>
                <p className="text-lg font-medium text-slate-900 mb-2">
                  Σφάλμα κατά την εισαγωγή
                </p>
                <p className="text-sm text-red-600 mb-6 text-center max-w-md">
                  {error}
                </p>
                <Button onClick={handleClose} variant="outline">
                  Κλείσιμο
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}