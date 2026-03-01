import React, { useState, useMemo, useEffect } from 'react';
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
import { Search, Plus, Play, Trash2, Download, FileText, X, CheckCircle2, AlertCircle, Info, Printer, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [printDialog, setPrintDialog] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    columns: [],
    rowsPerPage: 35,
    orientation: 'landscape'
  });

  const [selectedQueryIds, setSelectedQueryIds] = useState([]);

  useEffect(() => {
    const validIds = new Set(savedQueries.map(q => q.id));
    setSelectedQueryIds(prev => prev.filter(id => validIds.has(id)));
  }, [savedQueries]);

  const allSelected = savedQueries.length > 0 && selectedQueryIds.length === savedQueries.length;
  const isIndeterminate = selectedQueryIds.length > 0 && !allSelected;

  const toggleSelectAll = (checked) => {
    if (checked) setSelectedQueryIds(savedQueries.map(q => q.id));
    else setSelectedQueryIds([]);
  };

  const toggleOne = (id, checked) => {
    setSelectedQueryIds(prev => {
      const has = prev.includes(id);
      if (checked && !has) return [...prev, id];
      if (!checked && has) return prev.filter(x => x !== id);
      return prev;
    });
  };

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

  const colLabel = (k) => AVAILABLE_COLUMNS.find(c => c.key === k)?.label || k;

  const escHtml = (val) => {
    const s = String(val ?? '');
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  };

  const openPrintSettings = () => {
    const q = runDialog.query;
    if (!q) return;
    const fallbackCols = (q.columns?.length ? q.columns : AVAILABLE_COLUMNS.map(c => c.key));
    const saved = q.print_settings || {};
    const cols = (Array.isArray(saved.columns) && saved.columns.length) ? saved.columns : fallbackCols;
    setPrintSettings({
      columns: [...cols],
      rowsPerPage: Number(saved.rowsPerPage) || 35,
      orientation: saved.orientation || (cols.length > 7 ? 'landscape' : 'portrait')
    });
    setPrintDialog(true);
  };

  const setColPosition = (key, newPos1) => {
    setPrintSettings(prev => {
      const cols = [...prev.columns];
      const from = cols.indexOf(key);
      if (from < 0) return prev;
      const maxPos = cols.length;
      const targetPos = Math.max(1, Math.min(maxPos, Number(newPos1) || 1));
      cols.splice(from, 1);
      cols.splice(targetPos - 1, 0, key);
      return { ...prev, columns: cols };
    });
  };

  const toggleCol = (key, checked) => {
    setPrintSettings(prev => {
      const exists = prev.columns.includes(key);
      if (checked && !exists) return { ...prev, columns: [...prev.columns, key] };
      if (!checked && exists) return { ...prev, columns: prev.columns.filter(c => c !== key) };
      return prev;
    });
  };

  const computeResultsForQuery = (query) => {
    let results = [...people];
    if (query.rule_tree?.type) {
      results = results.filter(p => matchesRuleTree(p, query.rule_tree));
      return { results };
    }
    if (query.conditions?.length) {
      const tree = legacyConditionsToRuleTree(query.conditions);
      results = results.filter(p => matchesRuleTree(p, tree));
      return { results };
    }
    if (query.logicalExpression?.trim()) {
      try {
        const ast = compileManualExpression(query.logicalExpression);
        results = results.filter(p => matchesRuleTree(p, ast));
        return { results };
      } catch (e) {
        return { error: `Λάθος σύνταξης: ${e.message}` };
      }
    }
    if (query.filters) {
      Object.entries(query.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          if (key === 'voted') results = results.filter(p => p.voted === (value === 'true'));
          else results = results.filter(p => String(p[key] || '').toLowerCase().includes(String(value).toLowerCase()));
        }
      });
    }
    return { results };
  };

  const safeColsForQuery = (query) => {
    const allowed = new Set(AVAILABLE_COLUMNS.map(c => c.key));
    const psCols = query.print_settings?.columns;
    const qCols = query.columns;
    const cols =
      (Array.isArray(psCols) && psCols.length ? psCols :
       (Array.isArray(qCols) && qCols.length ? qCols : AVAILABLE_COLUMNS.map(c => c.key)))
      .filter(k => allowed.has(k));
    return cols.length ? cols : AVAILABLE_COLUMNS.map(c => c.key);
  };

  const rowsPerPageForQuery = (query) => {
    const v = Number(query.print_settings?.rowsPerPage);
    return Math.max(10, Math.min(80, Number.isFinite(v) ? v : 35));
  };

  const orientationForQuery = (query) => {
    return (query.print_settings?.orientation === 'portrait') ? 'portrait' : 'landscape';
  };

  const buildPrintHtmlForQueries = ({ items, orientation }) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('el-GR');
    const timeStr = now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
    let htmlPages = '';

    items.forEach((item, idxQuery) => {
      const q = item.query;
      const results = item.results;
      const cols = safeColsForQuery(q);
      const rowsPerPage = rowsPerPageForQuery(q);
      const totalRows = results.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

      for (let page = 1; page <= totalPages; page++) {
        const start = (page - 1) * rowsPerPage;
        const slice = results.slice(start, Math.min(totalRows, start + rowsPerPage));
        const thead = cols.map(k => `<th>${escHtml(colLabel(k))}</th>`).join('');
        const tbody = slice.length
          ? slice.map(p => {
              const tds = cols.map(k => {
                let v = p[k];
                if (k === 'voted') v = p[k] ? 'ΝΑΙ' : 'ΟΧΙ';
                if (v === null || v === undefined || v === '') v = '-';
                return `<td>${escHtml(v)}</td>`;
              }).join('');
              return `<tr>${tds}</tr>`;
            }).join('')
          : `<tr><td colspan="${cols.length}" style="padding:10px;color:#666;">Δεν υπάρχουν αποτελέσματα.</td></tr>`;

        const breakBefore = (idxQuery > 0 && page === 1) ? 'style="page-break-before:always;"' : '';

        htmlPages += `
          <div class="page" ${breakBefore}>
            <div class="header">
              <div class="title">${escHtml(q.name)}</div>
              <div class="meta">${escHtml(dateStr)} ${escHtml(timeStr)}</div>
            </div>
            <div class="subheader">
              <div>Σύνολο αποτελεσμάτων: ${totalRows.toLocaleString()}</div>
              <div>Σελίδα ${page} / ${totalPages}</div>
            </div>
            <table>
              <thead><tr>${thead}</tr></thead>
              <tbody>${tbody}</tbody>
            </table>
            <div class="footer">
              <div>Ερώτημα: ${escHtml(q.name)}</div>
              <div>Σελίδα ${page} / ${totalPages}</div>
            </div>
          </div>`;
      }
    });

    return `<!doctype html><html><head><meta charset="utf-8"/><title>Εκτύπωση Ερωτημάτων</title>
<style>
@page{size:A4 ${orientation};margin:12mm}
body{font-family:Arial,sans-serif;color:#111}
.page{page-break-after:always}
.header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.title{font-size:16px;font-weight:700}
.meta{font-size:11px;color:#444}
.subheader{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px;color:#444}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:4px 6px;font-size:10px;vertical-align:top}
th{background:#f3f4f6;font-weight:700}
.footer{margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:#555}
</style></head><body>${htmlPages}<script>window.onload=()=>{window.focus();window.print();};</script></body></html>`;
  };

  const handlePrintSelected = () => {
    if (selectedQueryIds.length === 0) { toast.info('Δεν έχεις επιλέξει ερωτήματα.'); return; }
    if (!people.length) { toast.error('Δεν έχουν φορτωθεί τα δεδομένα Person.'); return; }

    const selected = savedQueries.filter(q => selectedQueryIds.includes(q.id));
    const computed = selected.map(q => {
      const { results, error } = computeResultsForQuery(q);
      return { query: q, results: results || [], error };
    });

    const errors = computed.filter(x => x.error);
    const okItems = computed.filter(x => !x.error);
    if (errors.length) toast.warning(`Κάποια ερωτήματα έχουν σφάλμα και θα αγνοηθούν: ${errors.length}`);
    if (okItems.length === 0) { toast.error('Δεν υπάρχει κανένα έγκυρο ερώτημα για εκτύπωση.'); return; }

    const portraitItems = okItems.filter(x => orientationForQuery(x.query) === 'portrait');
    const landscapeItems = okItems.filter(x => orientationForQuery(x.query) === 'landscape');

    if (portraitItems.length) {
      const html = buildPrintHtmlForQueries({ items: portraitItems, orientation: 'portrait' });
      const w = window.open('', '_blank');
      if (!w) { toast.error('Το popup μπλοκαρίστηκε. Επιτρέψτε popups για εκτύπωση.'); return; }
      w.document.open(); w.document.write(html); w.document.close();
    }
    if (landscapeItems.length) {
      const html = buildPrintHtmlForQueries({ items: landscapeItems, orientation: 'landscape' });
      const w = window.open('', '_blank');
      if (!w) { toast.error('Το popup μπλοκαρίστηκε. Επιτρέψτε popups για εκτύπωση.'); return; }
      w.document.open(); w.document.write(html); w.document.close();
    }
  };

  const handlePrint = async () => {
    const q = runDialog.query;
    if (!q) return;
    const cols = printSettings.columns || [];
    if (cols.length === 0) { toast.error('Επίλεξε τουλάχιστον μία στήλη για εκτύπωση.'); return; }

    try {
      await base44.entities.SavedQuery.update(q.id, {
        print_settings: { columns: cols, rowsPerPage: Number(printSettings.rowsPerPage) || 35, orientation: printSettings.orientation || 'landscape' }
      });
      setRunDialog(prev => ({ ...prev, query: { ...prev.query, print_settings: { columns: cols, rowsPerPage: Number(printSettings.rowsPerPage) || 35, orientation: printSettings.orientation || 'landscape' } } }));
      queryClient.invalidateQueries(['saved-queries']);
    } catch (e) {
      toast.error('Δεν μπόρεσα να αποθηκεύσω τις ρυθμίσεις εκτύπωσης (θα εκτυπώσω κανονικά).');
    }

    const rowsPerPage = Math.max(10, Math.min(80, Number(printSettings.rowsPerPage) || 35));
    const totalRows = queryResults.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    const now = new Date();
    const dateStr = now.toLocaleDateString('el-GR');
    const timeStr = now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
    const orientationCss = printSettings.orientation === 'portrait' ? 'portrait' : 'landscape';

    let pagesHtml = '';
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * rowsPerPage;
      const slice = queryResults.slice(start, Math.min(totalRows, start + rowsPerPage));
      const thead = cols.map(k => `<th>${escHtml(colLabel(k))}</th>`).join('');
      const tbody = slice.map(p => {
        const tds = cols.map(k => {
          let v = p[k];
          if (k === 'voted') v = p[k] ? 'ΝΑΙ' : 'ΟΧΙ';
          if (v === null || v === undefined || v === '') v = '-';
          return `<td>${escHtml(v)}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      pagesHtml += `
        <div class="page">
          <div class="header">
            <div class="title">${escHtml(q.name)}</div>
            <div class="meta">${escHtml(dateStr)} ${escHtml(timeStr)}</div>
          </div>
          <div class="subheader">
            <div>Σύνολο αποτελεσμάτων: ${totalRows}</div>
            <div>Σελίδα ${page} / ${totalPages}</div>
          </div>
          <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
          <div class="footer">
            <div>Ερώτημα: ${escHtml(q.name)}</div>
            <div>Σελίδα ${page} / ${totalPages}</div>
          </div>
        </div>`;
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escHtml(q.name)}</title>
<style>
@page{size:A4 ${orientationCss};margin:12mm}
body{font-family:Arial,sans-serif;color:#111}
.page{page-break-after:always}
.header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.title{font-size:16px;font-weight:700}
.meta{font-size:11px;color:#444}
.subheader{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px;color:#444}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:4px 6px;font-size:10px;vertical-align:top}
th{background:#f3f4f6;font-weight:700}
.footer{margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:#555}
</style></head><body>${pagesHtml}<script>window.onload=()=>{window.focus();window.print();};</script></body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast.error('Το popup μπλοκαρίστηκε. Επιτρέψτε popups για εκτύπωση.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setPrintDialog(false);
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={selectedQueryIds.length === 0 || people.length === 0}
              onClick={() => handlePrintSelected()}
            >
              <Printer className="h-4 w-4 mr-2" />
              Εκτύπωση Επιλεγμένων ({selectedQueryIds.length})
            </Button>
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Νέο Ερώτημα
            </Button>
          </div>
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 font-medium">{queryResults.length.toLocaleString()} εγγραφές</span>
              {queryResults.length > 100 && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  Εμφανίζονται οι πρώτες 100 — εξάγετε για όλες
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={openPrintSettings} disabled={queryResults.length === 0}>
                <Printer className="h-4 w-4 mr-2" />
                Εκτύπωση
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={exportResults} disabled={queryResults.length === 0}>
                      <Download className="h-4 w-4 mr-2" />
                      Εξαγωγή CSV
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    Κατεβάζει <strong>όλα</strong> τα αποτελέσματα (όχι μόνο τις 100 που φαίνονται) σε αρχείο CSV, το οποίο ανοίγει απευθείας στο Excel.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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

        </DialogContent>
      </Dialog>
      {/* Print Settings Dialog */}
      <Dialog open={printDialog} onOpenChange={setPrintDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Ρυθμίσεις Εκτύπωσης
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Γραμμές ανά σελίδα</Label>
                <Input
                  type="number" min={10} max={80}
                  value={printSettings.rowsPerPage}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, rowsPerPage: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Προσανατολισμός</Label>
                <Select value={printSettings.orientation} onValueChange={(v) => setPrintSettings(prev => ({ ...prev, orientation: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Σειρά στηλών εκτύπωσης</Label>

              <p className="text-sm text-slate-600">
                Τσέκαρε ποιες στήλες θα τυπωθούν. Ο αριθμός (1, 2, 3…) δείχνει τη σειρά εμφάνισης στο χαρτί.
              </p>

              <div className="border rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
                {AVAILABLE_COLUMNS.map((c) => {
                  const checked = printSettings.columns.includes(c.key);
                  const idx = printSettings.columns.indexOf(c.key);
                  return (
                    <div key={c.key} className="flex items-center gap-3">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleCol(c.key, !!v)} />
                      <div className="w-7 text-center">
                        {checked ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-slate-300 text-xs">
                            –
                          </span>
                        )}
                      </div>
                      <div className="flex-1 text-sm">{c.label}</div>
                      {checked && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Θέση</span>
                          <Select
                            value={String(idx + 1)}
                            onValueChange={(v) => setColPosition(c.key, Number(v))}
                          >
                            <SelectTrigger className="w-[90px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {printSettings.columns.map((_, i) => (
                                <SelectItem key={i} value={String(i + 1)}>
                                  {i + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <div>✅ Τσέκαρε στήλες για να μπουν στην εκτύπωση</div>
                <div>🔢 Άλλαξε τη "Θέση" για να αλλάξει η σειρά (1η στήλη = πρώτη στο χαρτί)</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialog(false)}>Ακύρωση</Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Εκτύπωση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}