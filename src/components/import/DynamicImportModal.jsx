import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DynamicImportModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: select fields, 2: upload file
  const [customFields, setCustomFields] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const standardFields = [
    { key: 'person_id', label: 'AT (ID)', required: true },
    { key: 'ucid', label: 'UCID' },
    { key: 'department', label: 'TMHMA' },
    { key: 'admission_year', label: 'EISDOXI' },
    { key: 'academic_level', label: 'ΕΠΙΠΕΔΟ' },
    { key: 'mobile_phone', label: 'ΚΙΝΗΤΟ' },
    { key: 'first_name', label: 'ΟΝΟΜΑ' },
    { key: 'last_name', label: 'ΕΠΙΘΕΤΟ' },
    { key: 'contact_person_1', label: 'ATOMO_1' },
    { key: 'contact_person_2', label: 'ATOMO_2' },
    { key: 'member', label: 'ΜΕΛΟΣ' },
    { key: 'prediction_symbol', label: 'Σύμβολο πρόβλεψης' },
    { key: 'notes', label: 'Notes' },
  ];

  const addCustomField = () => {
    if (newFieldName.trim()) {
      setCustomFields([...customFields, newFieldName.trim()]);
      setNewFieldName('');
    }
  };

  const removeCustomField = (index) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleGenerateTemplate = async () => {
    try {
      setIsGenerating(true);
      const sessionToken = localStorage.getItem('app_session_token');

      const { data } = await base44.functions.invoke('generatePersonTemplate', {
        session_token: sessionToken,
        custom_fields: customFields
      });

      // Download the template
      const link = document.createElement('a');
      link.href = data.file_url;
      link.download = 'person_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Το πρότυπο δημιουργήθηκε επιτυχώς');
      setStep(2);
    } catch (error) {
      console.error('Template generation error:', error);
      toast.error('Σφάλμα κατά τη δημιουργία προτύπου');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    try {
      setIsImporting(true);
      setImportProgress(10);

      const sessionToken = localStorage.getItem('app_session_token');

      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: selectedFile
      });
      setImportProgress(30);

      // Import data
      const { data } = await base44.functions.invoke('dynamicImportPersons', {
        session_token: sessionToken,
        file_url,
        custom_fields: customFields
      });

      setImportProgress(100);

      if (data.success) {
        toast.success(`Εισήχθησαν ${data.imported_count} εγγραφές επιτυχώς`);
        onSuccess();
      } else {
        toast.error(data.error || 'Σφάλμα κατά την εισαγωγή');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Σφάλμα κατά την εισαγωγή δεδομένων');
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleClose = () => {
    setStep(1);
    setCustomFields([]);
    setNewFieldName('');
    setSelectedFile(null);
    setImportProgress(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Δυναμική Εισαγωγή Δεδομένων</DialogTitle>
          <DialogDescription>
            Βήμα {step} από 2: {step === 1 ? 'Ορισμός πεδίων' : 'Μεταφόρτωση αρχείου'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Πρότυπα Πεδία</h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                {standardFields.map(field => (
                  <div key={field.key} className="flex items-center gap-2">
                    <Checkbox checked disabled />
                    <span>{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Προσαρμοσμένα Πεδία</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Όνομα νέου πεδίου..."
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomField()}
                  />
                  <Button onClick={addCustomField} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {customFields.length > 0 && (
                  <div className="space-y-2">
                    {customFields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-50 p-2 rounded">
                        <span className="text-sm">{field}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCustomField(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-sm text-slate-600">
                  {selectedFile ? selectedFile.name : 'Επιλέξτε αρχείο Excel (.xlsx)'}
                </span>
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => document.getElementById('file-upload').click()}
              >
                Επιλογή Αρχείου
              </Button>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={importProgress} />
                <p className="text-sm text-slate-600 text-center">
                  Εισαγωγή σε εξέλιξη... {importProgress}%
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isGenerating || isImporting}>
            Ακύρωση
          </Button>
          {step === 1 ? (
            <Button onClick={handleGenerateTemplate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Δημιουργία...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Λήψη Προτύπου & Συνέχεια
                </>
              )}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isImporting}>
                Πίσω
              </Button>
              <Button onClick={handleImport} disabled={!selectedFile || isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Εισαγωγή...
                  </>
                ) : (
                  'Εισαγωγή'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}