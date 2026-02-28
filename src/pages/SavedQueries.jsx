import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import RuleTreeBuilder, { newCond, newGroup } from '../components/queries/RuleTreeBuilder';
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
import { Search, Plus, Play, Trash2, Download, FileText, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

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

// ─── RULE TREE EVALUATOR ───────────────────────────────────────────────────────

function normalizeVoted(v) {
  if (typeof v === 'boolean') return v;
  const s = (v ?? '').toString().trim().toUpperCase();
  if (['YES', 'ΝΑΙ', 'TRUE', '1'].includes(s)) return true;
  return false;
}

function getPersonField(person, field) {
  if (field === 'voted') return normalizeVoted(person?.voted);
  return person?.[field] ?? '';
}

function evalCond(person, cond) {
  const fieldVal = getPersonField(person, cond.field);

  if (cond.field === 'voted') {
    const left = normalizeVoted(fieldVal);
    const raw = String(cond.value).trim().toLowerCase();
    const right = raw === 'true' || raw === 'yes' || raw === 'ναι';
    if (cond.operator === '=') return left === right;
    if (cond.operator === '!=') return left !== right;
    return false;
  }

  const left = String(fieldVal ?? '');
  const right = String(cond.value ?? '');
  if (cond.operator === '=') return left === right;
  if (cond.operator === '!=') return left !== right;
  if (cond.operator === 'contains') return left.toLowerCase().includes(right.toLowerCase());
  return false;
}

function matchesRuleTree(person, node) {
  if (!node) return true;
  if (node.type === 'cond') return evalCond(person, node);
  if (node.type === 'not') return !matchesRuleTree(person, node.child);
  if (node.type === 'group') {
    const children = node.children || [];
    if (children.length === 0) return true;
    if (node.op === 'OR') return children.some(ch => matchesRuleTree(person, ch));
    return children.every(ch => matchesRuleTree(person, ch));
  }
  return true;
}

// ─── EXPRESSION PREVIEW (human-readable) ──────────────────────────────────────

function escapeQ(s) { return String(s ?? '').replaceAll('"', '\\"'); }

function nodeToExpression(node, isRoot = false) {
  if (!node) return '';

  if (node.type === 'cond') {
    if (node.operator === 'contains') return `${node.field} contains "${escapeQ(node.value)}"`;
    if (node.field === 'voted') {
      const raw = String(node.value).trim().toLowerCase();
      const b = (raw === 'true' || raw === 'yes' || raw === 'ναι') ? 'true' : 'false';
      return `${node.field} ${node.operator} ${b}`;
    }
    return `${node.field} ${node.operator} "${escapeQ(node.value)}"`;
  }

  if (node.type === 'not') {
    return `NOT (${nodeToExpression(node.child, true)})`;
  }

  if (node.type === 'group') {
    const parts = (node.children || []).map(ch => nodeToExpression(ch, false)).filter(Boolean);
    if (parts.length === 0) return '';
    const joined = parts.join(` ${node.op} `);
    return isRoot ? joined : `(${joined})`;
  }

  return '';
}

// ─── LEGACY COMPAT: flat conditions → rule_tree ────────────────────────────────

function legacyConditionsToRuleTree(conditions) {
  const list = (conditions || []).filter(c => c?.field && c?.operator && c.value !== undefined);
  if (list.length === 0) return { type: 'group', op: 'AND', children: [] };

  const orGroups = [];
  let current = [];
  for (let i = 0; i < list.length; i++) {
    current.push(list[i]);
    if ((list[i].connector || 'AND').toUpperCase() === 'OR') { orGroups.push(current); current = []; }
  }
  if (current.length) orGroups.push(current);

  const orChildren = orGroups.map(g => ({
    type: 'group',
    op: 'AND',
    children: g.map(c => ({ type: 'cond', field: c.field, operator: c.operator, value: c.value }))
  }));

  return orChildren.length === 1 ? orChildren[0] : { type: 'group', op: 'OR', children: orChildren };
}

// ─── SAFE MANUAL EXPRESSION PARSER (no eval, NOT>AND>OR) ──────────────────────

const FIELD_KEYS_SET = new Set(AVAILABLE_COLUMNS.map(c => c.key));

function tokenizeExpr(input) {
  const s = (input || '').trim();
  const tokens = [];
  let i = 0;
  const isSpace = (c) => /\s/.test(c);

  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) { i++; continue; }
    if (c === '(') { tokens.push({ t: 'LP' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'RP' }); i++; continue; }

    if (c === '"') {
      let j = i + 1, buf = '';
      while (j < s.length && !(s[j] === '"' && s[j - 1] !== '\\')) { buf += s[j]; j++; }
      if (j >= s.length) throw new Error('Λείπει κλείσιμο " στην έκφραση.');
      tokens.push({ t: 'STR', v: buf.replaceAll('\\"', '"') });
      i = j + 1;
      continue;
    }

    if (c === '!' && s[i + 1] === '=') { tokens.push({ t: 'OP', v: '!=' }); i += 2; continue; }
    if (c === '=') { tokens.push({ t: 'OP', v: '=' }); i++; continue; }

    let j = i;
    while (j < s.length && !isSpace(s[j]) && s[j] !== '(' && s[j] !== ')') j++;
    const w = s.slice(i, j);
    const up = w.toUpperCase();

    if (['AND', 'OR', 'NOT'].includes(up)) tokens.push({ t: up });
    else if (up === 'CONTAINS') tokens.push({ t: 'OP', v: 'contains' });
    else if (up === 'TRUE') tokens.push({ t: 'BOOL', v: true });
    else if (up === 'FALSE') tokens.push({ t: 'BOOL', v: false });
    else if (FIELD_KEYS_SET.has(w)) tokens.push({ t: 'FIELD', v: w });
    else tokens.push({ t: 'BARE', v: w });
    i = j;
  }
  return tokens;
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const consume = () => tokens[p++];

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Ελλιπής έκφραση.');
    if (tok.t === 'LP') {
      consume();
      const node = parseOr();
      const close = consume();
      if (!close || close.t !== 'RP') throw new Error('Λείπει ) παρένθεση.');
      return node;
    }
    if (tok.t === 'FIELD') {
      const field = consume().v;
      const opTok = consume();
      if (!opTok || opTok.t !== 'OP') throw new Error('Περίμενα τελεστή (=, !=, contains).');
      const valTok = consume();
      if (!valTok) throw new Error('Περίμενα τιμή.');
      const value = (valTok.t === 'STR' || valTok.t === 'BOOL' || valTok.t === 'BARE') ? valTok.v : (() => { throw new Error('Μη έγκυρη τιμή.'); })();
      return { type: 'cond', field, operator: opTok.v, value };
    }
    throw new Error(`Μη αναμενόμενο: ${tok.t}`);
  }

  function parseNot() {
    if (peek()?.t === 'NOT') { consume(); return { type: 'not', child: parseNot() }; }
    return parsePrimary();
  }

  function parseAnd() {
    let node = parseNot();
    while (peek()?.t === 'AND') { consume(); node = { type: 'group', op: 'AND', children: [node, parseNot()] }; }
    return node;
  }

  function parseOr() {
    let node = parseAnd();
    while (peek()?.t === 'OR') { consume(); node = { type: 'group', op: 'OR', children: [node, parseAnd()] }; }
    return node;
  }

  const ast = parseOr();
  if (p < tokens.length) throw new Error('Υπάρχει μη αναγνωρίσιμο κείμενο.');
  return ast;
}

function compileManualExpression(text) {
  const t = (text || '').trim();
  if (!t) return null;
  return parseTokens(tokenizeExpr(t));
}

// ─── DEFAULT TREE ──────────────────────────────────────────────────────────────

const DEFAULT_TREE = () => ({ type: 'group', op: 'AND', children: [newCond()] });

// ─── PAGE COMPONENT ────────────────────────────────────────────────────────────

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
  const [ruleTree, setRuleTree] = useState(DEFAULT_TREE());
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
    setRuleTree(DEFAULT_TREE());
    setUseVisualBuilder(true);
    setExprError('');
  };

  // ── Live preview count ──
  const previewCount = useMemo(() => {
    if (!people.length) return 0;

    if (useVisualBuilder) {
      return people.filter(p => matchesRuleTree(p, ruleTree)).length;
    }

    // Manual mode: safe parse
    if (!formData.logicalExpression?.trim()) return people.length;
    let ast = null;
    try {
      ast = compileManualExpression(formData.logicalExpression);
      setExprError('');
    } catch (e) {
      setExprError(e.message);
      return 0;
    }
    return people.filter(p => matchesRuleTree(p, ast)).length;
  }, [people, useVisualBuilder, ruleTree, formData.logicalExpression]);

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

    if (query.rule_tree?.type) {
      results = results.filter(p => matchesRuleTree(p, query.rule_tree));
    } else if (query.conditions?.length) {
      const tree = legacyConditionsToRuleTree(query.conditions);
      results = results.filter(p => matchesRuleTree(p, tree));
    } else if (query.logicalExpression?.trim()) {
      let ast = null;
      try {
        ast = compileManualExpression(query.logicalExpression);
      } catch (e) {
        toast.error(`Λάθος σύνταξης: ${e.message}`);
        setQueryResults([]);
        setRunDialog({ open: true, query });
        return;
      }
      results = results.filter(p => matchesRuleTree(p, ast));
    } else if (query.filters) {
      Object.entries(query.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          if (key === 'voted') results = results.filter(p => p.voted === (value === 'true'));
          else results = results.filter(p => String(p[key] || '').toLowerCase().includes(String(value).toLowerCase()));
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
      ? nodeToExpression(ruleTree, true)
      : formData.logicalExpression;
    createMutation.mutate({
      ...formData,
      logicalExpression: finalExpression,
      rule_tree: useVisualBuilder ? ruleTree : { type: 'group', op: 'AND', children: [] },
      conditions: []
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

      {/* Page description */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">📋 Πώς λειτουργεί η σελίδα:</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li><strong>Νέο Ερώτημα:</strong> Δημιουργήστε ένα ερώτημα με οπτικό builder (groups/παρενθέσεις) ή χειροκίνητη έκφραση. Επιλέξτε ποιες στήλες θέλετε να εμφανίζονται.</li>
          <li><strong>Εκτέλεση:</strong> Εφαρμόζει τα φίλτρα του ερωτήματος σε όλα τα πρόσωπα και εμφανίζει τα αποτελέσματα σε πίνακα.</li>
          <li><strong>Εξαγωγή:</strong> Κατεβάζει τα αποτελέσματα ως αρχείο CSV (συμβατό με Excel) με τις επιλεγμένες στήλες.</li>
          <li>Τα αποτελέσματα εμφανίζονται αυτόματα — δεν χρειάζεται αποθήκευση.</li>
        </ul>
      </div>

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
                  <Button variant="ghost" size="icon"
                    onClick={() => { if (confirm('Διαγραφή αυτού του ερωτήματος;')) deleteMutation.mutate(query.id); }}
                    className="text-red-500 hover:text-red-600">
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button className="w-full" onClick={() => runQuery(query)}>
                        <Play className="h-4 w-4 mr-2" />
                        Εκτέλεση
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-center">
                      Εφαρμόζει τα φίλτρα του ερωτήματος και εμφανίζει τα αποτελέσματα σε πίνακα. Από εκεί μπορείτε να τα εξάγετε σε Excel (CSV).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                    onClick={() => { setUseVisualBuilder(true); setExprError(''); }}>
                    Οπτικό (Groups)
                  </Button>
                  <Button type="button" variant={!useVisualBuilder ? "default" : "outline"} size="sm"
                    onClick={() => setUseVisualBuilder(false)}>
                    Κώδικας
                  </Button>
                </div>
              </div>

              {useVisualBuilder ? (
                <div className="space-y-3">
                  <RuleTreeBuilder
                    tree={ruleTree}
                    setTree={setRuleTree}
                    availableColumns={AVAILABLE_COLUMNS}
                    operatorsByType={OPERATORS}
                  />

                  {/* Expression preview */}
                  <div className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs">
                    <div className="text-slate-500 mb-1 text-[10px] uppercase tracking-wider">Έκφραση:</div>
                    <div className="font-mono break-all">
                      {nodeToExpression(ruleTree, true) || <span className="text-slate-500">Καμία έκφραση</span>}
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
                    Χρησιμοποιήστε: AND, OR, NOT, =, !=, contains, παρενθέσεις (). Προτεραιότητα: NOT {'>'} AND {'>'} OR.
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