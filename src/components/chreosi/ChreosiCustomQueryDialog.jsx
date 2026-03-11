import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import RuleTreeBuilder, { newGroup } from '../queries/RuleTreeBuilder';
import { Info } from 'lucide-react';

// Person fields available for query building
const PERSON_COLUMNS = [
  { key: 'department', label: 'Τμήμα (TMHMA)', type: 'text' },
  { key: 'admission_year', label: 'Έτος Εισαγωγής', type: 'text' },
  { key: 'academic_level', label: 'Επίπεδο (ΕΠΙΠΕΔΟ)', type: 'text' },
  { key: 'first_name', label: 'Όνομα', type: 'text' },
  { key: 'last_name', label: 'Επώνυμο', type: 'text' },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης', type: 'text' },
  { key: 'contact_person_1', label: 'ΑΤΟΜΟ_1', type: 'text' },
  { key: 'contact_person_2', label: 'ΑΤΟΜΟ_2', type: 'text' },
  { key: 'member', label: 'Μέλος', type: 'text' },
  { key: 'voted', label: 'Ψήφισε', type: 'boolean' },
];

const OPERATORS_BY_TYPE = {
  text: [
    { value: '=', label: '=' },
    { value: '!=', label: '≠' },
    { value: 'contains', label: 'περιέχει' },
    { value: 'not_contains', label: 'δεν περιέχει' },
    { value: 'starts_with', label: 'αρχίζει με' },
  ],
  boolean: [
    { value: '=', label: '=' },
  ],
};

export function evaluateRuleTree(tree, person) {
  if (!tree || !tree.type) return true;

  if (tree.type === 'group') {
    if (!tree.children || tree.children.length === 0) return true;
    if (tree.op === 'AND') return tree.children.every(c => evaluateRuleTree(c, person));
    if (tree.op === 'OR') return tree.children.some(c => evaluateRuleTree(c, person));
    return true;
  }

  if (tree.type === 'cond') {
    const raw = person[tree.field];
    const fieldVal = (raw === null || raw === undefined) ? '' : String(raw).trim().toLowerCase();
    const condVal = String(tree.value ?? '').trim().toLowerCase();

    switch (tree.operator) {
      case '=': return fieldVal === condVal;
      case '!=': return fieldVal !== condVal;
      case 'contains': return fieldVal.includes(condVal);
      case 'not_contains': return !fieldVal.includes(condVal);
      case 'starts_with': return fieldVal.startsWith(condVal);
      default: return true;
    }
  }

  return true;
}

export default function ChreosiCustomQueryDialog({ open, onOpenChange, onSave, existingAccount = null }) {
  const isEdit = !!existingAccount;

  const [username, setUsername] = useState(existingAccount?.username || '');
  const [password, setPassword] = useState(existingAccount?.password_hash || '');
  const [useCustomQuery, setUseCustomQuery] = useState(existingAccount?.use_custom_query || false);
  const [ruleTree, setRuleTree] = useState(
    existingAccount?.custom_query || newGroup()
  );
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setUsername(existingAccount?.username || '');
      setPassword(existingAccount?.password_hash || '');
      setUseCustomQuery(existingAccount?.use_custom_query || false);
      setRuleTree(existingAccount?.custom_query || newGroup());
    }
  }, [open, existingAccount?.id]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      username: username.trim().replace(/\s+/g, ' '),
      password_hash: password.trim(),
      use_custom_query: useCustomQuery,
      custom_query: ruleTree,
    });
    setSaving(false);
  };

  const canSave = isEdit
    ? (username.trim() && (useCustomQuery ? true : true))
    : (username.trim() && password.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[95vh]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Ερώτημα Χρεωστικού — ${existingAccount?.username}` : 'Δημιουργία Custom Χρεωστικού'}
          </DialogTitle>
          <DialogDescription>
            Ορίστε το custom ερώτημα φιλτραρίσματος για αυτόν τον χρήστη.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-5 py-2 pr-1">
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label>Όνομα Χρήστη (Username)</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="π.χ. Γιώργος Παπαδόπουλος"
                />
              </div>
              <div className="space-y-2">
                <Label>Κωδικός (Password)</Label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Εισάγετε κωδικό"
                />
              </div>
            </>
          )}

          {/* Toggle custom query */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border dark:border-slate-700">
            <Switch
              checked={useCustomQuery}
              onCheckedChange={setUseCustomQuery}
            />
            <div>
              <p className="font-medium text-sm">Ενεργοποίηση Custom Ερωτήματος</p>
              <p className="text-xs text-slate-500">
                {useCustomQuery
                  ? 'Ο χρήστης βλέπει τα άτομα που πληρούν τις παρακάτω συνθήκες (και δεν έχουν ψηφίσει).'
                  : 'Προεπιλογή: ο χρήστης βλέπει τα άτομα που έχουν το όνομά του στο ΑΤΟΜΟ_1 ή ΑΤΟΜΟ_2 με τα επιτρεπόμενα σύμβολα.'}
              </p>
            </div>
          </div>

          {useCustomQuery && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Label className="text-sm font-semibold">Κανόνες Φιλτραρίσματος</Label>
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Το φίλτρο voted=false εφαρμόζεται πάντα αυτόματα
                </Badge>
              </div>
              <div className="border dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-900">
                <RuleTreeBuilder
                  tree={ruleTree}
                  setTree={setRuleTree}
                  availableColumns={PERSON_COLUMNS}
                  operatorsByType={OPERATORS_BY_TYPE}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Ακύρωση</Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Αποθήκευση...' : isEdit ? 'Αποθήκευση Ερωτήματος' : 'Δημιουργία'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}