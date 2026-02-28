import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Play,
  Trash2,
  Download,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Brackets
} from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)', type: 'text' },
  { key: 'last_name', label: 'Επίθετο', type: 'text' },
  { key: 'first_name', label: 'Όνομα', type: 'text' },
  { key: 'department', label: 'Τμήμα', type: 'text' },
  { key: 'admission_year', label: 'Εισδοχή', type: 'text' },
  { key: 'academic_level', label: 'Επίπεδο', type: 'text' },
  { key: 'ucid', label: 'UCID', type: 'text' },
  { key: 'mobile_phone', label: 'Κινητό', type: 'text' },
  { key: 'contact_person_1', label: 'Άτομο 1', type: 'text' },
  { key: 'contact_person_2', label: 'Άτομο 2', type: 'text' },
  { key: 'voted', label: 'Ψήφισε', type: 'boolean' },
  { key: 'member', label: 'Μέλος', type: 'text' },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης', type: 'text' },
  { key: 'notes', label: 'Σημειώσεις', type: 'text' },
];

const OPERATORS = {
  text: [
    { value: '=', label: 'Ισούται' },
    { value: '!=', label: 'Διαφορετικό' },
    { value: 'contains', label: 'Περιέχει' },
  ],
  boolean: [
    { value: '=', label: 'Ισούται' },
    { value: '!=', label: 'Διαφορετικό' },
  ]
};

const defaultCondition = () => ({ field: 'department', operator: '=', value: '', connector: 'AND' });
const defaultGroup = () => ({ connector: 'AND', conditions: [defaultCondition()] });

// Build expression for a single group → "(cond1 AND cond2 ...)"
function buildGroupExpression(group) {
  const { conditions } = group;
  if (!conditions || conditions.length === 0) return '';
  const parts = conditions.map((cond, idx) => {
    let expr = '';
    if (cond.operator === 'contains') {
      expr = `${cond.field} contains "${cond.value}"`;
    } else if (cond.field === 'voted') {
      const boolValue = cond.value === 'true' || cond.value === true;
      expr = `${cond.field} ${cond.operator} ${boolValue}`;
    } else {
      expr = `${cond.field} ${cond.operator} "${cond.value}"`;
    }
    if (idx < conditions.length - 1) {
      expr += ` ${cond.connector} `;
    }
    return expr;
  });
  const inner = parts.join('');
  return conditions.length > 1 ? `(${inner})` : inner;
}

// Build full expression from groups array → "(g1) AND (g2) OR (g3)"
function buildExpressionFromGroups(groups) {
  if (!groups || groups.length === 0) return '';
  return groups.map((group, idx) => {
    const groupExpr = buildGroupExpression(group);
    if (idx < groups.length - 1) {
      return `${groupExpr} ${group.connector} `;
    }
    return groupExpr;
  }).join('');
}

// Legacy: build from flat conditions (for backward compat when running old saved queries)
function buildExpressionFromConditions(conditionsList) {
  if (!conditionsList || conditionsList.length === 0) return '';
  return conditionsList.map((cond, idx) => {
    let expr = '';
    if (cond.operator === 'contains') {
      expr = `${cond.field} contains "${cond.value}"`;
    } else if (cond.field === 'voted') {
      const boolValue = cond.value === 'true' || cond.value === true;
      expr = `${cond.field} ${cond.operator} ${boolValue}`;
    } else {
      expr = `${cond.field} ${cond.operator} "${cond.value}"`;
    }
    if (idx < conditionsList.length - 1) {
      expr += ` ${cond.connector} `;
    }
    return expr;
  }).join('');
}

function evaluateExpression(person, expression) {
  if (!expression || !expression.trim()) return true;
  try {
    let expr = expression;
    expr = expr.replace(/(\w+)\s+contains\s+"([^"]*)"/gi, (match, field, value) => {
      const fieldValue = String(person[field] || '').toLowerCase();
      return fieldValue.includes(value.toLowerCase()) ? 'true' : 'false';
    });
    const fieldPattern = /\b(person_id|last_name|first_name|department|admission_year|academic_level|ucid|mobile_phone|contact_person_1|contact_person_2|voted|member|prediction_symbol|notes)\b/g;
    expr = expr.replace(fieldPattern, (match) => {
      const value = person[match];
      if (match === 'voted') return value ? 'true' : 'false';
      return typeof value === 'string' ? `"${value}"` : (value || '""');
    });
    expr = expr.replace(/\bAND\b/gi, '&&');
    expr = expr.replace(/\bOR\b/gi, '||');
    expr = expr.replace(/\bNOT\b/gi, '!');
    expr = expr.replace(/=/g, '==');
    expr = expr.replace(/!===/g, '!==');
    expr = expr.replace(/====/g, '===');
    return eval(expr);
  } catch (e) {
    return true;
  }
}

// ---- ConditionRow component ----
function ConditionRow({ condition, idx, total, onUpdate, onRemove, onConnectorChange }) {
  const fieldType = AVAILABLE_COLUMNS.find(c => c.key === condition.field)?.type || 'text';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Select
          value={condition.field}
          onValueChange={(value) => {
            const ft = AVAILABLE_COLUMNS.find(c => c.key === value)?.type || 'text';
            onUpdate({ ...condition, field: value, operator: OPERATORS[ft][0].value, value: '' });
          }}
        >
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AVAILABLE_COLUMNS.map(col => (
              <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={condition.operator}
          onValueChange={(value) => onUpdate({ ...condition, operator: value })}
        >
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPERATORS[fieldType].map(op => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {condition.field === 'voted' ? (
          <Select
            value={String(condition.value)}
            onValueChange={(value) => onUpdate({ ...condition, value })}
          >
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ναι</SelectItem>
              <SelectItem value="false">Όχι</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={condition.value}
            onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
            placeholder="Τιμή..."
            className="flex-1"
          />
        )}

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="text-red-400 hover:text-red-600">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {idx < total - 1 && (
        <div className="flex items-center gap-2 pl-2">
          <Select value={condition.connector} onValueChange={onConnectorChange}>
            <SelectTrigger className="w-[90px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ---- GroupBlock component ----
function GroupBlock({ group, groupIdx, totalGroups, onChange, onRemove, onGroupConnectorChange }) {
  const updateCondition = (condIdx, newCond) => {
    const newConditions = group.conditions.map((c, i) => i === condIdx ? newCond : c);
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (condIdx) => {
    const newConditions = group.conditions.filter((_, i) => i !== condIdx);
    onChange({ ...group, conditions: newConditions.length > 0 ? newConditions : [defaultCondition()] });
  };

  const addCondition = () => {
    onChange({ ...group, conditions: [...group.conditions, defaultCondition()] });
  };

  const updateConnector = (condIdx, connector) => {
    const newConditions = group.conditions.map((c, i) => i === condIdx ? { ...c, connector } : c);
    onChange({ ...group, conditions: newConditions });
  };

  return (
    <div className="space-y-2">
      <div className="border-2 border-blue-200 bg-blue-50/40 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
            <span className="font-mono text-blue-500">(</span>
            Ομάδα {groupIdx + 1}
            <span className="font-mono text-blue-500">)</span>
          </span>
          {totalGroups > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="h-6 w-6 text-red-400 hover:text-red-600">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {group.conditions.map((cond, condIdx) => (
          <ConditionRow
            key={condIdx}
            condition={cond}
            idx={condIdx}
            total={group.conditions.length}
            onUpdate={(newCond) => updateCondition(condIdx, newCond)}
            onRemove={() => removeCondition(condIdx)}
            onConnectorChange={(connector) => updateConnector(condIdx, connector)}
          />
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addCondition}
          className="w-full text-blue-600 border border-dashed border-blue-300 hover:bg-blue-100 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Προσθήκη Συνθήκης στην Ομάδα
        </Button>
      </div>

      {/* Inter-group connector */}
      {groupIdx < totalGroups - 1 && (
        <div className="flex items-center gap-2 justify-center py-1">
          <div className="h-px flex-1 bg-slate-200" />
          <Select value={group.connector} onValueChange={onGroupConnectorChange}>
            <SelectTrigger className="w-[90px] h-8 border-slate-400 font-semibold text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      )}
    </div>
  );
}

export default function SavedQueries() {
  const queryClient = useQueryClient();
  const [createDialog, setCreateDialog] = useState(false);
  const [runDialog, setRunDialog] = useState({ open: false, query: null });
  const [queryResults, setQueryResults] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'],
    filters: {},
    logicalExpression: '',
    conditions: []
  });

  // groups: array of { connector: 'AND'|'OR', conditions: [...] }
  const [groups, setGroups] = useState([defaultGroup()]);
  const [useVisualBuilder, setUseVisualBuilder] = useState(true);

  const { data: savedQueries = [], isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => base44.entities.SavedQuery.list('-created_date')
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const previewExpression = useMemo(() => {
    if (useVisualBuilder) return buildExpressionFromGroups(groups);
    return formData.logicalExpression;
  }, [useVisualBuilder, groups, formData.logicalExpression]);

  const previewCount = useMemo(() => {
    if (!people.length) return 0;
    if (!previewExpression || !previewExpression.trim()) return people.length;
    return people.filter(person => evaluateExpression(person, previewExpression)).length;
  }, [people, previewExpression]);

  const resetDialog = () => {
    setFormData({ name: '', description: '', columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'], filters: {}, logicalExpression: '', conditions: [] });
    setGroups([defaultGroup()]);
    setUseVisualBuilder(true);
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SavedQuery.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-queries']);
      setCreateDialog(false);
      resetDialog();
      toast.success('Το ερώτημα αποθηκεύτηκε');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SavedQuery.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-queries']);
      toast.success('Το ερώτημα διαγράφηκε');
    }
  });

  const runQuery = (query) => {
    let results = [...people];
    // Support both new groups-based and legacy conditions/logicalExpression
    const expr = query.logicalExpression || buildExpressionFromConditions(query.conditions || []);
    if (expr && expr.trim()) {
      results = results.filter(person => evaluateExpression(person, expr));
    } else if (query.filters) {
      Object.entries(query.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          if (key === 'voted') {
            results = results.filter(p => p.voted === (value === 'true'));
          } else {
            results = results.filter(p => String(p[key] || '').toLowerCase().includes(String(value).toLowerCase()));
          }
        }
      });
    }
    setQueryResults(results);
    setRunDialog({ open: true, query });
  };

  const exportResults = () => {
    if (!runDialog.query || queryResults.length === 0) return;
    const cols = runDialog.query.columns || AVAILABLE_COLUMNS.map(c => c.key);
    const headers = cols.map(k => AVAILABLE_COLUMNS.find(c => c.key === k)?.label || k).join(',');
    const rows = queryResults.map(p =>
      cols.map(k => {
        let val = p[k];
        if (k === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    const csv = '\uFEFF' + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runDialog.query.name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Εξαγωγή ολοκληρώθηκε');
  };

  const handleSave = () => {
    if (!formData.name) { toast.error('Εισάγετε όνομα'); return; }
    const finalExpression = useVisualBuilder ? buildExpressionFromGroups(groups) : formData.logicalExpression;
    createMutation.mutate({ ...formData, logicalExpression: finalExpression, conditions: [] });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Αποθηκευμένα Ερωτήματα"
        subtitle="Δημιουργία και εκτέλεση προσαρμοσμένων ερωτημάτων"
        icon={Search}
        actions={
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Νέο Ερώτημα
          </Button>
        }
      />

      {savedQueries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Δεν υπάρχουν αποθηκευμένα ερωτήματα"
          description="Δημιουργήστε ένα νέο ερώτημα για να ξεκινήσετε"
          action={
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Νέο Ερώτημα
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedQueries.map(query => (
            <Card key={query.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  {query.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (confirm('Διαγραφή αυτού του ερωτήματος;')) deleteMutation.mutate(query.id); }}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {query.description && <p className="text-sm text-slate-500 mb-4">{query.description}</p>}
                <div className="text-xs text-slate-400 mb-4">
                  <div>{(query.columns || []).length} στήλες</div>
                  {query.logicalExpression && (
                    <div className="mt-1 font-mono text-[10px] text-blue-600 truncate" title={query.logicalExpression}>
                      {query.logicalExpression}
                    </div>
                  )}
                </div>
                <Button className="w-full" onClick={() => runQuery(query)}>
                  <Play className="h-4 w-4 mr-2" />
                  Εκτέλεση
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Query Dialog */}
      <Dialog open={createDialog} onOpenChange={(open) => { if (!open) resetDialog(); setCreateDialog(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Νέο Ερώτημα</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            {/* Name & Description */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label>Όνομα *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Όνομα ερωτήματος" />
              </div>
              <div className="space-y-1">
                <Label>Περιγραφή</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Περιγραφή" rows={2} />
              </div>
            </div>

            {/* Columns */}
            <div className="space-y-2">
              <Label>Στήλες αποτελεσμάτων</Label>
              <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 bg-slate-50">
                {AVAILABLE_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={col.key}
                      checked={(formData.columns || []).includes(col.key)}
                      onCheckedChange={(checked) => {
                        const newCols = checked
                          ? [...(formData.columns || []), col.key]
                          : (formData.columns || []).filter(c => c !== col.key);
                        setFormData({ ...formData, columns: newCols });
                      }}
                    />
                    <Label htmlFor={col.key} className="text-sm cursor-pointer">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Logical Expression */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Λογική Έκφραση</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant={useVisualBuilder ? "default" : "outline"} size="sm"
                    onClick={() => { setUseVisualBuilder(true); setFormData({ ...formData, logicalExpression: buildExpressionFromGroups(groups) }); }}>
                    Οπτικό
                  </Button>
                  <Button type="button" variant={!useVisualBuilder ? "default" : "outline"} size="sm"
                    onClick={() => setUseVisualBuilder(false)}>
                    Κώδικας
                  </Button>
                </div>
              </div>

              {useVisualBuilder ? (
                <div className="space-y-2">
                  {groups.map((group, groupIdx) => (
                    <GroupBlock
                      key={groupIdx}
                      group={group}
                      groupIdx={groupIdx}
                      totalGroups={groups.length}
                      onChange={(newGroup) => {
                        const newGroups = groups.map((g, i) => i === groupIdx ? newGroup : g);
                        setGroups(newGroups);
                      }}
                      onRemove={() => setGroups(groups.filter((_, i) => i !== groupIdx))}
                      onGroupConnectorChange={(connector) => {
                        const newGroups = groups.map((g, i) => i === groupIdx ? { ...g, connector } : g);
                        setGroups(newGroups);
                      }}
                    />
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGroups([...groups, defaultGroup()])}
                    className="w-full border-dashed text-slate-600"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Προσθήκη Ομάδας (παρένθεση)
                  </Button>

                  {/* Preview */}
                  <div className="bg-slate-900 text-green-400 p-3 rounded-lg border text-xs">
                    <div className="text-slate-500 mb-1 text-[10px] uppercase tracking-wider">Έκφραση:</div>
                    <div className="font-mono break-all">
                      {buildExpressionFromGroups(groups) || <span className="text-slate-500">Καμία έκφραση</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={formData.logicalExpression}
                    onChange={(e) => setFormData({ ...formData, logicalExpression: e.target.value })}
                    placeholder='π.χ. (department = "ΝΟΜ" AND voted = false) OR (department = "ΗΜΥ" AND prediction_symbol = "Π")'
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">
                    Χρησιμοποιήστε: AND, OR, NOT, =, !=, contains, παρενθέσεις () και ονόματα πεδίων
                  </p>
                </div>
              )}

              {/* Live count */}
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  {previewCount > 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  )}
                  <span className="text-sm font-medium text-slate-700">Αποτελέσματα:</span>
                </div>
                <Badge variant="default" className="text-base px-3 py-1">
                  {previewCount.toLocaleString()} / {people.length.toLocaleString()}
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetDialog(); setCreateDialog(false); }}>Ακύρωση</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              Αποθήκευση ({previewCount} εγγραφές)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Query Dialog */}
      <Dialog open={runDialog.open} onOpenChange={(open) => setRunDialog({ open, query: null })}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Αποτελέσματα: {runDialog.query?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-500">{queryResults.length} εγγραφές</span>
            <Button variant="outline" onClick={exportResults}>
              <Download className="h-4 w-4 mr-2" />
              Εξαγωγή
            </Button>
          </div>
          <div className="overflow-auto max-h-[50vh] border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {(runDialog.query?.columns || []).map(k => (
                    <th key={k} className="text-left p-3 font-semibold">
                      {AVAILABLE_COLUMNS.find(c => c.key === k)?.label || k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResults.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-slate-50">
                    {(runDialog.query?.columns || []).map(k => (
                      <td key={k} className="p-3">
                        {k === 'voted' ? (row[k] ? 'ΝΑΙ' : 'ΟΧΙ') : (row[k] || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {queryResults.length > 100 && (
            <p className="text-sm text-slate-500 text-center">
              Εμφανίζονται οι πρώτες 100 εγγραφές. Εξάγετε για να δείτε όλα τα αποτελέσματα.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}