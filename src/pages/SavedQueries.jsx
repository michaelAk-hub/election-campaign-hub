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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Play, Trash2, Download, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

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

const FIELD_KEYS = new Set([
  'person_id','last_name','first_name','department','admission_year','academic_level','ucid',
  'mobile_phone','contact_person_1','contact_person_2','voted','member','prediction_symbol','notes'
]);

// ─── SAFE EXPRESSION ENGINE (no eval) ────────────────────────────────────────

function normalizeVoted(v) {
  if (typeof v === 'boolean') return v;
  const s = (v ?? '').toString().trim().toUpperCase();
  if (['YES','ΝΑΙ','TRUE','1'].includes(s)) return true;
  if (['NO','ΟΧΙ','FALSE','0'].includes(s)) return false;
  return false;
}

function getPersonField(person, field) {
  if (field === 'voted') return normalizeVoted(person?.voted);
  return person?.[field] ?? '';
}

function tokenizeExpr(input) {
  const s = (input || '').trim();
  const tokens = [];
  let i = 0;
  const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';

  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) { i++; continue; }
    if (c === '(') { tokens.push({ t: 'LP' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'RP' }); i++; continue; }

    if (c === '"') {
      let j = i + 1, buf = '';
      while (j < s.length) {
        if (s[j] === '"' && s[j-1] !== '\\') break;
        buf += s[j]; j++;
      }
      if (j >= s.length) throw new Error('Λείπει κλείσιμο " στην έκφραση.');
      tokens.push({ t: 'STR', v: buf.replaceAll('\\"', '"') });
      i = j + 1;
      continue;
    }

    if (c === '!' && s[i+1] === '=') { tokens.push({ t: 'OP', v: '!=' }); i += 2; continue; }
    if (c === '=') { tokens.push({ t: 'OP', v: '=' }); i += 1; continue; }

    let j = i;
    while (j < s.length && !isSpace(s[j]) && s[j] !== '(' && s[j] !== ')') j++;
    const w = s.slice(i, j);
    const up = w.toUpperCase();

    if (up === 'AND' || up === 'OR' || up === 'NOT') {
      tokens.push({ t: up });
    } else if (up === 'CONTAINS') {
      tokens.push({ t: 'OP', v: 'contains' });
    } else if (up === 'TRUE' || up === 'FALSE') {
      tokens.push({ t: 'BOOL', v: up === 'TRUE' });
    } else if (FIELD_KEYS.has(w)) {
      tokens.push({ t: 'FIELD', v: w });
    } else {
      tokens.push({ t: 'BARE', v: w });
    }
    i = j;
  }
  return tokens;
}

function parseExpr(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const consume = () => tokens[p++];

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Η έκφραση είναι κενή/ελλιπής.');

    if (tok.t === 'LP') {
      consume();
      const node = parseOr();
      const close = consume();
      if (!close || close.t !== 'RP') throw new Error('Λείπει κλείσιμο παρένθεσης ).');
      return node;
    }

    if (tok.t === 'FIELD') {
      const field = consume().v;
      const opTok = consume();
      if (!opTok || opTok.t !== 'OP') throw new Error('Περίμενα τελεστή (=, !=, contains).');
      const valTok = consume();
      if (!valTok) throw new Error('Περίμενα τιμή μετά τον τελεστή.');
      let value;
      if (valTok.t === 'STR') value = valTok.v;
      else if (valTok.t === 'BOOL') value = valTok.v;
      else if (valTok.t === 'BARE') value = valTok.v;
      else throw new Error('Μη έγκυρη τιμή.');
      return { type: 'COND', field, op: opTok.v, value };
    }

    throw new Error(`Μη αναμενόμενο token: ${tok.t}`);
  }

  function parseNot() {
    if (peek()?.t === 'NOT') { consume(); return { type: 'NOT', expr: parseNot() }; }
    return parsePrimary();
  }

  function parseAnd() {
    let node = parseNot();
    while (peek()?.t === 'AND') { consume(); node = { type: 'AND', left: node, right: parseNot() }; }
    return node;
  }

  function parseOr() {
    let node = parseAnd();
    while (peek()?.t === 'OR') { consume(); node = { type: 'OR', left: node, right: parseAnd() }; }
    return node;
  }

  const ast = parseOr();
  if (p < tokens.length) throw new Error('Υπάρχει υπόλοιπο κείμενο που δεν αναγνωρίζεται.');
  return ast;
}

function compileExpression(expressionText) {
  const text = (expressionText || '').trim();
  if (!text) return null;
  return parseExpr(tokenizeExpr(text));
}

function evalAst(person, ast) {
  if (!ast) return true;
  switch (ast.type) {
    case 'OR':  return evalAst(person, ast.left) || evalAst(person, ast.right);
    case 'AND': return evalAst(person, ast.left) && evalAst(person, ast.right);
    case 'NOT': return !evalAst(person, ast.expr);
    case 'COND': {
      const fieldVal = getPersonField(person, ast.field);
      if (ast.field === 'voted') {
        const left = normalizeVoted(fieldVal);
        const right = typeof ast.value === 'boolean'
          ? ast.value
          : ['true','ναι'].includes(String(ast.value).trim().toLowerCase());
        if (ast.op === '=') return left === right;
        if (ast.op === '!=') return left !== right;
        return false;
      }
      const left = String(fieldVal ?? '');
      const right = String(ast.value ?? '');
      if (ast.op === '=') return left === right;
      if (ast.op === '!=') return left !== right;
      if (ast.op === 'contains') return left.toLowerCase().includes(right.toLowerCase());
      return false;
    }
    default: return true;
  }
}

// ─── VISUAL BUILDER → EXPRESSION STRING WITH PRECEDENCE PARENTHESES ──────────

function conditionToText(cond) {
  if (!cond?.field) return '';
  if (cond.operator === 'contains') return `${cond.field} contains "${(cond.value || '').replaceAll('"', '\\"')}"`;
  if (cond.field === 'voted') {
    const b = String(cond.value).trim().toLowerCase() === 'true' ? 'true' : 'false';
    return `${cond.field} ${cond.operator} ${b}`;
  }
  return `${cond.field} ${cond.operator} "${(cond.value || '').replaceAll('"', '\\"')}"`;
}

function buildExpressionFromConditionsWithPrecedence(conditionsList) {
  const list = (conditionsList || []).filter(c => c?.field && c?.operator && c.value !== undefined && c.value !== '');
  if (list.length === 0) return '';

  // Split into OR-separated groups (AND-chains)
  const orGroups = [];
  let current = [];
  for (let i = 0; i < list.length; i++) {
    current.push(list[i]);
    if ((list[i].connector || 'AND').toUpperCase() === 'OR') {
      orGroups.push(current);
      current = [];
    }
  }
  if (current.length) orGroups.push(current);

  const groupTexts = orGroups.map(g => {
    const andParts = g.map(conditionToText).filter(Boolean);
    const txt = andParts.join(' AND ');
    return (orGroups.length > 1 && andParts.length > 1) ? `(${txt})` : txt;
  });

  return groupTexts.join(' OR ');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const defaultCondition = () => ({ field: 'department', operator: '=', value: '', connector: 'AND' });

// ─── CONDITION ROW COMPONENT ──────────────────────────────────────────────────

function ConditionRow({ condition, idx, total, onUpdate, onRemove, onConnectorChange }) {
  const fieldType = AVAILABLE_COLUMNS.find(c => c.key === condition.field)?.type || 'text';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
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

        <Select value={condition.operator} onValueChange={(value) => onUpdate({ ...condition, operator: value })}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPERATORS[fieldType].map(op => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {condition.field === 'voted' ? (
          <Select value={String(condition.value)} onValueChange={(value) => onUpdate({ ...condition, value })}>
            <SelectTrigger className="flex-1 min-w-[80px]"><SelectValue /></SelectTrigger>
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
            className="flex-1 min-w-[80px]"
          />
        )}

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {idx < total - 1 && (
        <div className="flex items-center gap-2 pl-2">
          <Select value={condition.connector} onValueChange={onConnectorChange}>
            <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue /></SelectTrigger>
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

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function SavedQueries() {
  const queryClient = useQueryClient();
  const [createDialog, setCreateDialog] = useState(false);
  const [runDialog, setRunDialog] = useState({ open: false, query: null });
  const [queryResults, setQueryResults] = useState([]);
  const [formData, setFormData] = useState({
    name: '', description: '',
    columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'],
    filters: {}, logicalExpression: ''
  });
  const [conditions, setConditions] = useState([defaultCondition()]);
  const [useVisualBuilder, setUseVisualBuilder] = useState(true);
  const [exprError, setExprError] = useState('');

  const { data: savedQueries = [], isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => base44.entities.SavedQuery.list('-created_date')
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => base44.entities.Person.list('-created_date', 10000)
  });

  const resetDialog = () => {
    setFormData({ name: '', description: '', columns: ['person_id', 'last_name', 'first_name', 'department', 'voted'], filters: {}, logicalExpression: '' });
    setConditions([defaultCondition()]);
    setUseVisualBuilder(true);
    setExprError('');
  };

  // ── Preview expression (shown in the dark box) ──
  const previewExpression = useMemo(() => {
    if (useVisualBuilder) return buildExpressionFromConditionsWithPrecedence(conditions);
    return formData.logicalExpression;
  }, [useVisualBuilder, conditions, formData.logicalExpression]);

  // ── Live count via AST (no eval) ──
  const previewCount = useMemo(() => {
    if (!people.length) return 0;
    if (!previewExpression || !previewExpression.trim()) return people.length;

    let ast = null;
    try {
      ast = compileExpression(previewExpression);
      setExprError('');
    } catch (e) {
      setExprError(e.message);
      return 0;
    }

    let count = 0;
    for (const person of people) { if (evalAst(person, ast)) count++; }
    return count;
  }, [people, previewExpression]);

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
    onSuccess: () => { queryClient.invalidateQueries(['saved-queries']); toast.success('Το ερώτημα διαγράφηκε'); }
  });

  const runQuery = (query) => {
    let results = [...people];
    const expr = buildExpressionFromConditionsWithPrecedence(query.conditions || []) || query.logicalExpression;

    if (expr && expr.trim()) {
      let ast = null;
      try {
        ast = compileExpression(expr);
      } catch (e) {
        toast.error(`Λάθος σύνταξης: ${e.message}`);
        setQueryResults([]);
        setRunDialog({ open: true, query });
        return;
      }
      results = results.filter(person => evalAst(person, ast));
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
    const finalExpression = useVisualBuilder
      ? buildExpressionFromConditionsWithPrecedence(conditions)
      : formData.logicalExpression;
    createMutation.mutate({
      ...formData,
      conditions: useVisualBuilder ? conditions : [],
      logicalExpression: finalExpression
    });
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
                    variant="ghost" size="icon"
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

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Λογική Έκφραση</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant={useVisualBuilder ? "default" : "outline"} size="sm"
                    onClick={() => { setUseVisualBuilder(true); setExprError(''); }}>
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
                  {conditions.map((condition, idx) => (
                    <ConditionRow
                      key={idx}
                      condition={condition}
                      idx={idx}
                      total={conditions.length}
                      onUpdate={(newCond) => {
                        const next = conditions.map((c, i) => i === idx ? newCond : c);
                        setConditions(next);
                      }}
                      onRemove={() => {
                        const next = conditions.filter((_, i) => i !== idx);
                        setConditions(next.length > 0 ? next : [defaultCondition()]);
                      }}
                      onConnectorChange={(connector) => {
                        const next = conditions.map((c, i) => i === idx ? { ...c, connector } : c);
                        setConditions(next);
                      }}
                    />
                  ))}

                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setConditions([...conditions, defaultCondition()])}
                    className="w-full border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Προσθήκη Συνθήκης
                  </Button>

                  {/* Expression preview — shows parentheses so user understands precedence */}
                  <div className="bg-slate-900 text-green-400 p-3 rounded-lg border text-xs">
                    <div className="text-slate-500 mb-1 text-[10px] uppercase tracking-wider">Έκφραση (NOT {'>'} AND {'>'} OR):</div>
                    <div className="font-mono break-all">
                      {buildExpressionFromConditionsWithPrecedence(conditions) || <span className="text-slate-500">Καμία έκφραση</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={formData.logicalExpression}
                    onChange={(e) => { setFormData({ ...formData, logicalExpression: e.target.value }); setExprError(''); }}
                    placeholder='π.χ. (department = "ΝΟΜ" AND voted = false) OR department = "ΗΜΥ"'
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">
                    Χρησιμοποιήστε: AND, OR, NOT, =, !=, contains, παρενθέσεις () και ονόματα πεδίων.
                    Προτεραιότητα: NOT {'>'} AND {'>'} OR.
                  </p>
                </div>
              )}

              {exprError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-mono">{exprError}</span>
                </div>
              )}

              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  {previewCount > 0
                    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                    : <AlertCircle className="h-5 w-5 text-amber-600" />}
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
            <Button onClick={handleSave} disabled={createMutation.isPending || !!exprError}>
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