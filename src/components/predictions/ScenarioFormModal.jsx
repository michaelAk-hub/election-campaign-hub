import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';

const COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b','#a21caf'];

const emptyParty = (idx) => ({ id: Date.now() + idx, name: '', color: COLORS[idx % COLORS.length], symbols: [] });
const emptySymbolRow = () => ({ symbol: '', multiplier: '1' });
const emptyCondition = () => ({ field: 'academic_level', operator: '=', value: '', values: [] });
const emptyGroup = () => ({ id: Date.now(), name: '', conditions: [emptyCondition()] });

export default function ScenarioFormModal({ open, onClose, onSaved, editScenario, sessionToken }) {
    const [name, setName] = useState('');
    const [totalSeats, setTotalSeats] = useState('');
    const [displayOrder, setDisplayOrder] = useState('1');
    const [parties, setParties] = useState([emptyParty(0)]);
    const [yearGroups, setYearGroups] = useState([]);
    const [filterOptions, setFilterOptions] = useState({ symbols: [], academic_levels: [], admission_years: [] });
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);

    useEffect(() => {
        if (!open) return;
        setLoadingOptions(true);
        base44.functions.invoke('scenarioFilterOptions', { session_token: sessionToken })
            .then(({ data }) => setFilterOptions(data || { symbols: [], academic_levels: [], admission_years: [] }))
            .catch(console.error)
            .finally(() => setLoadingOptions(false));
    }, [open, sessionToken]);

    useEffect(() => {
        if (!open) return;
        if (editScenario) {
            setName(editScenario.name || '');
            setTotalSeats(String(editScenario.total_seats || ''));
            setDisplayOrder(String(editScenario.display_order || 1));
            const cfg = editScenario.config_json || {};
            const loadedParties = (cfg.parties || []).map((p, i) => ({
                id: Date.now() + i,
                name: p.name || '',
                color: p.color || COLORS[i % COLORS.length],
                symbols: (p.symbols || []).map(s => ({ symbol: s.symbol || '', multiplier: String(s.multiplier || '1') })),
            }));
            setParties(loadedParties.length ? loadedParties : [emptyParty(0)]);
            const loadedGroups = (cfg.year_groups || []).map((g, i) => ({
                id: Date.now() + i + 100,
                name: g.name || '',
                conditions: (g.conditions || [emptyCondition()]).map(c => ({
                    field: c.field || 'academic_level',
                    operator: c.operator || '=',
                    value: c.value || '',
                    values: c.values || [],
                })),
            }));
            setYearGroups(loadedGroups);
        } else {
            setName(''); setTotalSeats(''); setDisplayOrder('1');
            setParties([emptyParty(0)]); setYearGroups([]);
        }
        setErrors([]); setWarnings([]);
    }, [open, editScenario]);

    const validate = () => {
        const errs = [];
        if (!name.trim()) errs.push('Λείπει το όνομα σεναρίου');
        const seats = Number(totalSeats);
        if (!totalSeats || !isFinite(seats) || seats <= 0) errs.push('Ο αριθμός εδρών πρέπει να είναι θετικός αριθμός');

        const partyNamesSeen = [];
        const usedSymbols = {};

        parties.forEach((p, pi) => {
            const pName = p.name.trim();
            const pLabel = `Παράταξη #${pi + 1}`;
            if (!pName) {
                errs.push(`${pLabel}: λείπει το όνομα`);
            } else {
                const lower = pName.toLowerCase();
                if (partyNamesSeen.includes(lower)) {
                    errs.push(`Διπλό όνομα παράταξης: "${pName}"`);
                } else {
                    partyNamesSeen.push(lower);
                }
            }
            if (!p.symbols.length) {
                errs.push(`${pLabel} "${pName || '?'}": απαιτείται τουλάχιστον ένα σύμβολο`);
            }
            const partySeen = new Set();
            p.symbols.forEach(sm => {
                const sym = (sm.symbol || '').trim();
                if (!sym) { errs.push(`${pLabel} "${pName || '?'}": κενό σύμβολο`); return; }
                // Duplicate within same party is not allowed
                if (partySeen.has(sym)) { errs.push(`${pLabel} "${pName || '?'}": διπλό σύμβολο "${sym}"`); }
                partySeen.add(sym);
                // Same symbol across different parties IS allowed — no cross-party check
                usedSymbols[sym] = true;
                const mult = Number(sm.multiplier);
                if (!sm.multiplier || !isFinite(mult) || mult <= 0) errs.push(`${pLabel} "${pName || '?'}", σύμβολο "${sym}": ο πολλαπλασιαστής πρέπει να είναι > 0`);
            });
        });

        yearGroups.forEach((g, gi) => {
            const gName = g.name.trim();
            if (!gName) errs.push(`Ομάδα #${gi + 1}: λείπει το όνομα`);
            if (!g.conditions.length) errs.push(`Ομάδα "${gName || '?'}": απαιτείται τουλάχιστον μία συνθήκη`);
            g.conditions.forEach((cond, ci) => {
                const cLabel = `Ομάδα "${gName || '?'}", συνθήκη #${ci + 1}`;
                if (!['academic_level', 'admission_year'].includes(cond.field)) errs.push(`${cLabel}: μη επιτρεπτό πεδίο`);
                if (!['=', 'IN'].includes(cond.operator)) errs.push(`${cLabel}: μη επιτρεπτός τελεστής`);
                if (cond.operator === '=' && !(cond.value || '').trim()) errs.push(`${cLabel}: ο τελεστής "=" απαιτεί τιμή`);
                if (cond.operator === 'IN' && (!cond.values || cond.values.length === 0)) errs.push(`${cLabel}: ο τελεστής "IN" απαιτεί τουλάχιστον μία τιμή`);
            });
        });

        // Warnings for unassigned symbols
        const warns = [];
        const allDataSymbols = filterOptions.symbols;
        const assignedSymbolsSet = new Set(Object.keys(usedSymbols));
        const unassigned = allDataSymbols.filter(s => !assignedSymbolsSet.has(s));
        if (unassigned.length) warns.push(`Αναθέστε ή παραλείψτε σύμβολα: ${unassigned.join(', ')}`);
        setErrors(errs); setWarnings(warns);
        return errs.length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        const config_json = {
            parties: parties.map(p => ({
                name: p.name.trim(),
                color: p.color,
                symbols: p.symbols.map(s => ({
                    symbol: (s.symbol || '').trim(),
                    multiplier: parseFloat(s.multiplier) || 1,
                })),
            })),
            year_groups: yearGroups.map(g => ({
                name: g.name.trim(),
                conditions: g.conditions.map(c => ({
                    field: (c.field || '').trim(),
                    operator: (c.operator || '').trim(),
                    value: c.operator === '=' ? (c.value || '').trim() : undefined,
                    values: c.operator === 'IN'
                        ? (c.values || []).map(v => (v || '').trim()).filter(v => v !== '')
                        : undefined,
                })),
            })),
        };
        const { data } = await base44.functions.invoke('scenarioSave', {
            session_token: sessionToken,
            scenario_id: editScenario?.id || null,
            scenario: { name: name.trim(), total_seats: Number(totalSeats), display_order: Number(displayOrder) || 1, config_json },
        });
        setSaving(false);
        if (data?.error) {
            if (data.errors && Array.isArray(data.errors)) {
                setErrors(data.errors);
            } else {
                setErrors([data.message || data.error]);
            }
            return;
        }
        onSaved();
        onClose();
    };

    // Party helpers
    const addParty = () => setParties(prev => [...prev, emptyParty(prev.length)]);
    const removeParty = (id) => setParties(prev => prev.filter(p => p.id !== id));
    const updateParty = (id, field, val) => setParties(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
    const addSymbolRow = (partyId) => setParties(prev => prev.map(p => p.id === partyId ? { ...p, symbols: [...p.symbols, emptySymbolRow()] } : p));
    const removeSymbolRow = (partyId, idx) => setParties(prev => prev.map(p => p.id === partyId ? { ...p, symbols: p.symbols.filter((_, i) => i !== idx) } : p));
    const updateSymbolRow = (partyId, idx, field, val) => setParties(prev => prev.map(p => {
        if (p.id !== partyId) return p;
        const syms = [...p.symbols];
        syms[idx] = { ...syms[idx], [field]: val };
        return { ...p, symbols: syms };
    }));

    // Group helpers
    const addGroup = () => setYearGroups(prev => [...prev, emptyGroup()]);
    const removeGroup = (id) => setYearGroups(prev => prev.filter(g => g.id !== id));
    const updateGroup = (id, field, val) => setYearGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: val } : g));
    const addCondition = (groupId) => setYearGroups(prev => prev.map(g => g.id === groupId ? { ...g, conditions: [...g.conditions, emptyCondition()] } : g));
    const removeCondition = (groupId, idx) => setYearGroups(prev => prev.map(g => g.id === groupId ? { ...g, conditions: g.conditions.filter((_, i) => i !== idx) } : g));
    const updateCondition = (groupId, idx, field, val) => setYearGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        const conds = [...g.conditions];
        conds[idx] = { ...conds[idx], [field]: val };
        return { ...g, conditions: conds };
    }));

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editScenario ? 'Επεξεργασία Πρόβλεψης' : 'Δημιουργία Πρόβλεψης'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Errors / Warnings */}
                    {errors.length > 0 && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                            {errors.map((e, i) => <div key={i} className="text-xs text-red-700 flex gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{e}</div>)}
                        </div>
                    )}
                    {warnings.length > 0 && (
                        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 space-y-1">
                            {warnings.map((w, i) => <div key={i} className="text-xs text-yellow-700 flex gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}</div>)}
                        </div>
                    )}

                    {/* Basic info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <Label className="text-xs mb-1 block">Όνομα Πρόβλεψης *</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Σενάριο Α" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1 block">Σύνολο Εδρών *</Label>
                            <Input type="number" value={totalSeats} onChange={e => setTotalSeats(e.target.value)} placeholder="π.χ. 15" min={1} />
                        </div>
                        <div>
                            <Label className="text-xs mb-1 block">Σειρά εμφάνισης (1-4)</Label>
                            <Input type="number" value={displayOrder} onChange={e => setDisplayOrder(e.target.value)} min={1} max={4} />
                        </div>
                    </div>

                    {/* Parties */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold">Παρατάξεις</Label>
                            <Button size="sm" variant="outline" onClick={addParty}>
                                <Plus className="h-3.5 w-3.5 mr-1" />Παράταξη
                            </Button>
                        </div>
                        <div className="space-y-4">
                            {parties.map((party, pi) => (
                                <div key={party.id} className="border rounded-lg p-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="flex-1"
                                            placeholder="Όνομα παράταξης"
                                            value={party.name}
                                            onChange={e => updateParty(party.id, 'name', e.target.value)}
                                        />
                                        <div className="flex items-center gap-1">
                                            <Label className="text-xs text-slate-500 dark:text-slate-400">Χρώμα</Label>
                                            <input
                                                type="color"
                                                value={party.color}
                                                onChange={e => updateParty(party.id, 'color', e.target.value)}
                                                className="w-8 h-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700"
                                            />
                                        </div>
                                        {parties.length > 1 && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => removeParty(party.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                    {/* Symbol rows */}
                                    <div className="space-y-2 pl-1">
                                        <Label className="text-xs text-slate-500 dark:text-slate-400">Σύμβολα & Πολλαπλασιαστές</Label>
                                        {party.symbols.map((sm, si) => (
                                            <div key={si} className="flex items-center gap-2">
                                                <select
                                                    className="flex-1 border rounded px-2 py-1 text-sm bg-white dark:bg-slate-900 dark:border-slate-700"
                                                    value={sm.symbol}
                                                    onChange={e => updateSymbolRow(party.id, si, 'symbol', e.target.value)}
                                                >
                                                    <option value="">— Σύμβολο —</option>
                                                    {loadingOptions ? (
                                                       <option disabled>Φόρτωση...</option>
                                                    ) : filterOptions.symbols.map(s => {
                                                       // Only disable if this same symbol already exists elsewhere in THIS party
                                                       const inThisParty = party.symbols.some((other, oi) => oi !== si && other.symbol === s);
                                                       return <option key={s} value={s} disabled={inThisParty}>{s}</option>;
                                                    })}
                                                </select>
                                                <span className="text-xs text-slate-400">×</span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-20 text-sm"
                                                    value={sm.multiplier}
                                                    onChange={e => updateSymbolRow(party.id, si, 'multiplier', e.target.value)}
                                                    placeholder="1"
                                                />
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => removeSymbolRow(party.id, si)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => addSymbolRow(party.id)}>
                                            <Plus className="h-3 w-3 mr-1" />Σύμβολο
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Academic Year Groups */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold">Ακαδημαϊκές Ομάδες <span className="text-xs font-normal text-slate-400">(προαιρετικά)</span></Label>
                            <Button size="sm" variant="outline" onClick={addGroup}>
                                <Plus className="h-3.5 w-3.5 mr-1" />Ομάδα
                            </Button>
                        </div>
                        <div className="space-y-4">
                            {yearGroups.map((group) => (
                                <div key={group.id} className="border rounded-lg p-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="flex-1"
                                            placeholder="Όνομα ομάδας π.χ. ΜΠΤΧ"
                                            value={group.name}
                                            onChange={e => updateGroup(group.id, 'name', e.target.value)}
                                        />
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => removeGroup(group.id)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {group.conditions.map((cond, ci) => (
                                            <div key={ci} className="flex flex-wrap items-center gap-2">
                                                <select
                                                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-slate-900 dark:border-slate-700"
                                                    value={cond.field}
                                                    onChange={e => updateCondition(group.id, ci, 'field', e.target.value)}
                                                >
                                                    <option value="academic_level">academic_level</option>
                                                    <option value="admission_year">admission_year</option>
                                                </select>
                                                <select
                                                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-slate-900 dark:border-slate-700"
                                                    value={cond.operator}
                                                    onChange={e => updateCondition(group.id, ci, 'operator', e.target.value)}
                                                >
                                                    <option value="=">=</option>
                                                    <option value="IN">IN</option>
                                                </select>
                                                {cond.operator === '=' ? (
                                                    <Input
                                                        className="w-32 text-sm"
                                                        placeholder="τιμή"
                                                        value={cond.value}
                                                        onChange={e => updateCondition(group.id, ci, 'value', e.target.value)}
                                                    />
                                                ) : (
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        {(cond.field === 'academic_level' ? filterOptions.academic_levels : filterOptions.admission_years).map(opt => (
                                                            <Badge
                                                                key={opt}
                                                                variant={(cond.values || []).includes(opt) ? 'default' : 'outline'}
                                                                className="cursor-pointer text-xs"
                                                                onClick={() => {
                                                                    const cur = cond.values || [];
                                                                    const next = cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt];
                                                                    updateCondition(group.id, ci, 'values', next);
                                                                }}
                                                            >
                                                                {opt}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                                {group.conditions.length > 1 && (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => removeCondition(group.id, ci)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => addCondition(group.id)}>
                                            <Plus className="h-3 w-3 mr-1" />Συνθήκη
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Ακύρωση</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Αποθήκευση...</> : 'Αποθήκευση'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}