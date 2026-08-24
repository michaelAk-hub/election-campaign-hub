import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, XCircle, Plus, Trash2, Loader2, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

const CHART_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

function seedParataksiList(config) {
    const mapping = config?.mapping || [];
    if (mapping.length) {
        return mapping.map((m, i) => ({
            id: Date.now() + i,
            name: m.parataxi || '',
            symbols: m.symbols || [],
            color: m.color || CHART_COLORS[i % CHART_COLORS.length],
        }));
    }
    return [{ id: Date.now(), name: '', symbols: [], color: CHART_COLORS[0] }];
}

function configToFetchMapping(config) {
    return (config?.mapping || []).map((m, i) => ({
        id: i,
        name: m.parataxi,
        symbols: m.symbols || [],
        color: m.color || CHART_COLORS[i % CHART_COLORS.length],
    }));
}

// VoteFlowChart — shared config is stored in backend (PredictionVoteFlowConfig).
// On manual refresh (refreshSignal): reloads config from backend, then refetches chart.
// On "Ρυθμίσεις": reloads config from backend first, then seeds dialog from fresh data.
// No timers. No stale in-memory config used for seeding.
export default function VoteFlowChart({ sessionToken, availableSymbols = [], filterOptionsLoading = false, filterOptionsError = null, refreshSignal }) {
    const [sharedConfig, setSharedConfig] = useState(null);
    const [configLoaded, setConfigLoaded] = useState(false);

    const [parataksiList, setParataksiList] = useState([]);
    const [showConfig, setShowConfig] = useState(false);
    const [chartData, setChartData] = useState(null);
    const [loadingChart, setLoadingChart] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);

    // Load shared config from backend and return the fresh config value
    const loadSharedConfig = useCallback(async () => {
        if (!sessionToken) return null;
        setLoadingConfig(true);
        try {
            const { data } = await base44.functions.invoke('voteFlowConfigLoad', { session_token: sessionToken });
            const fresh = data?.config || null;
            setSharedConfig(fresh);
            return fresh;
        } catch (e) {
            console.error('voteFlowConfigLoad error:', e);
            return null;
        } finally {
            setConfigLoaded(true);
            setLoadingConfig(false);
        }
    }, [sessionToken]);

    // Fetch chart data given a config object directly (avoids stale closure over sharedConfig)
    const fetchChartData = useCallback(async (config) => {
        const mapping = configToFetchMapping(config);
        if (!mapping.length) return;
        setLoadingChart(true);
        try {
            const { data } = await base44.functions.invoke('predictionVoteFlow', {
                session_token: sessionToken,
                bucket_minutes: config?.bucket_minutes || 5,
                mapping: mapping.map(p => ({ parataxi: p.name, symbols: p.symbols, color: p.color })),
            });
            setChartData(data);
        } catch (error) {
            console.error('predictionVoteFlow error:', error);
        } finally {
            setLoadingChart(false);
        }
    }, [sessionToken]);

    // On mount / sessionToken change: load config, then chart if enabled
    useEffect(() => {
        (async () => {
            const fresh = await loadSharedConfig();
            if (fresh?.is_enabled) await fetchChartData(fresh);
        })();
    }, [loadSharedConfig]); // fetchChartData intentionally omitted — stable ref

    // On parent refreshSignal: reload config from backend first, then chart — no stale closure
    useEffect(() => {
        if (refreshSignal === 0) return;
        (async () => {
            const fresh = await loadSharedConfig();
            if (fresh?.is_enabled) await fetchChartData(fresh);
        })();
    }, [refreshSignal]); // eslint-disable-line

    // Open "Έναρξη" — fetch fresh config before seeding dialog
    const handleStart = async () => {
        const fresh = await loadSharedConfig();
        setParataksiList(seedParataksiList(fresh));
        setShowConfig(true);
    };

    // Open "Ρυθμίσεις" — fetch fresh config before seeding dialog
    const handleOpenSettings = async () => {
        const fresh = await loadSharedConfig();
        setParataksiList(seedParataksiList(fresh));
        setShowConfig(true);
    };

    const addParataksi = () => setParataksiList(prev => [...prev, {
        id: Date.now(), name: '', symbols: [],
        color: CHART_COLORS[prev.length % CHART_COLORS.length]
    }]);

    const removeParataksi = (id) => setParataksiList(prev => prev.filter(p => p.id !== id));

    const updateParataksi = (id, field, value) => {
        setParataksiList(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const toggleSymbol = (parataksiId, symbol) => {
        setParataksiList(prev => prev.map(p => {
            if (p.id !== parataksiId) return p;
            const symbols = p.symbols.includes(symbol)
                ? p.symbols.filter(s => s !== symbol)
                : [...p.symbols, symbol];
            return { ...p, symbols };
        }));
    };

    const validateConfig = () => {
        if (parataksiList.length === 0) { alert('Προσθέστε τουλάχιστον μία παράταξη'); return false; }
        for (const p of parataksiList) {
            if (!p.name.trim()) { alert('Όλες οι παρατάξεις πρέπει να έχουν όνομα'); return false; }
            if (p.symbols.length === 0) { alert(`Η παράταξη "${p.name}" πρέπει να έχει τουλάχιστον ένα σύμβολο`); return false; }
        }
        return true;
    };

    // Save config to backend (shared) then fetch chart using the saved config
    const handleSubmitConfig = async () => {
        if (!validateConfig()) return;
        setSaving(true);
        try {
            const mapping = parataksiList.map(p => ({ parataxi: p.name, symbols: p.symbols, color: p.color }));
            const { data } = await base44.functions.invoke('voteFlowConfigSave', {
                session_token: sessionToken,
                is_enabled: true,
                mapping,
                bucket_minutes: sharedConfig?.bucket_minutes || 5,
            });
            const saved = data?.config || null;
            setSharedConfig(saved);
            setShowConfig(false);
            if (saved?.is_enabled) await fetchChartData(saved);
        } catch (e) {
            alert('Σφάλμα αποθήκευσης ρυθμίσεων: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    // Disable chart — save to backend with is_enabled=false
    const handleCancel = async () => {
        try {
            await base44.functions.invoke('voteFlowConfigSave', {
                session_token: sessionToken,
                is_enabled: false,
                mapping: sharedConfig?.mapping || [],
                bucket_minutes: sharedConfig?.bucket_minutes || 5,
            });
        } catch (e) {
            console.error('voteFlowConfigSave disable error:', e);
        }
        setSharedConfig(prev => prev ? { ...prev, is_enabled: false } : null);
        setChartData(null);
        setShowConfig(false);
    };

    const parataksiForChart = useMemo(() => {
        if (!sharedConfig?.mapping) return [];
        return sharedConfig.mapping.map((m, i) => ({
            id: i,
            name: m.parataxi,
            color: m.color || CHART_COLORS[i % CHART_COLORS.length],
        }));
    }, [sharedConfig]);

    const transformedData = useMemo(() => {
        if (!chartData) return [];
        return chartData.labels.map((label, index) => {
            const point = { time: label };
            chartData.series.forEach(serie => { point[serie.parataxi] = serie.points[index]; });
            return point;
        });
    }, [chartData]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                <p className="font-semibold text-sm mb-2">
                    {format(new Date(label), 'dd/MM/yyyy HH:mm', { locale: el })}
                </p>
                {payload.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="font-medium">{entry.name}:</span>
                        <span className="font-bold">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    };

    const SharedBadge = () => (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
            <Users className="h-3 w-3" />
            Κοινό γράφημα για όλους τους χρήστες του ενεργού dataset
        </span>
    );

    if (!configLoaded || loadingConfig) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Διάγραμμα Ροής Ψήφων
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-slate-400">Φόρτωση ρυθμίσεων...</div>
                </CardContent>
            </Card>
        );
    }

    if (!sharedConfig?.is_enabled && !showConfig) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Διάγραμμα Ροής Ψήφων
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 space-y-3">
                        <TrendingUp className="h-14 w-14 text-slate-300 mx-auto" />
                        <p className="text-slate-600 dark:text-slate-300 text-sm">
                            Παρακολουθήστε τη ροή της ψηφοφορίας σε πραγματικό χρόνο<br />
                            με αθροιστικές γραμμές ανά παράταξη
                        </p>
                        <SharedBadge />
                        <div className="pt-2">
                            <Button onClick={handleStart} size="lg" disabled={loadingConfig}>
                                <Play className="h-4 w-4 mr-2" />
                                Έναρξη
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Dialog open={showConfig} onOpenChange={(open) => { if (!open) setShowConfig(false); }}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Ρύθμιση Παρατάξεων</DialogTitle>
                    </DialogHeader>
                    <div className="mb-3">
                        <SharedBadge />
                    </div>
                    <div className="space-y-6 py-2">
                        {parataksiList.map((parataksi, index) => (
                            <Card key={parataksi.id} className="border-2">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1">
                                            <span className="font-semibold text-slate-600 dark:text-slate-300">#{index + 1}</span>
                                            <Input
                                                placeholder="Όνομα Παράταξης"
                                                value={parataksi.name}
                                                onChange={(e) => updateParataksi(parataksi.id, 'name', e.target.value)}
                                                className="max-w-xs"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Label className="text-sm">Χρώμα:</Label>
                                                <input
                                                    type="color"
                                                    value={parataksi.color}
                                                    onChange={(e) => updateParataksi(parataksi.id, 'color', e.target.value)}
                                                    className="w-10 h-10 rounded cursor-pointer border border-slate-300 dark:border-slate-700"
                                                />
                                            </div>
                                        </div>
                                        {parataksiList.length > 1 && (
                                            <Button variant="ghost" size="icon" onClick={() => removeParataksi(parataksi.id)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Label className="text-sm font-medium mb-2 block">Επιλέξτε Σύμβολα:</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {filterOptionsLoading ? (
                                            <p className="text-sm text-slate-400">Φόρτωση συμβόλων...</p>
                                        ) : filterOptionsError ? (
                                            <p className="text-sm text-red-500">Αποτυχία φόρτωσης συμβόλων: {filterOptionsError}</p>
                                        ) : availableSymbols.length === 0 ? (
                                            <p className="text-sm text-slate-400">Δεν υπάρχουν διαθέσιμα σύμβολα</p>
                                        ) : (
                                            availableSymbols.map(symbol => (
                                                <Badge
                                                    key={symbol}
                                                    variant={parataksi.symbols.includes(symbol) ? "default" : "outline"}
                                                    className="cursor-pointer"
                                                    style={parataksi.symbols.includes(symbol) ? {
                                                        backgroundColor: parataksi.color, borderColor: parataksi.color
                                                    } : {}}
                                                    onClick={() => toggleSymbol(parataksi.id, symbol)}
                                                >
                                                    {symbol}
                                                </Badge>
                                            ))
                                        )}
                                    </div>
                                    {parataksi.symbols.length > 0 && (
                                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                            Επιλεγμένα: {parataksi.symbols.join(', ')}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                        <Button variant="outline" onClick={addParataksi} className="w-full">
                            <Plus className="h-4 w-4 mr-2" />
                            Προσθήκη Παράταξης
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfig(false)}>Ακύρωση</Button>
                        <Button onClick={handleSubmitConfig} disabled={saving || loadingChart}>
                            {saving || loadingChart
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Αποθήκευση...</>
                                : <><Play className="h-4 w-4 mr-2" />Αποθήκευση & Εμφάνιση</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {sharedConfig?.is_enabled && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5" />
                                    Διάγραμμα Ροής Ψήφων (Αθροιστικό)
                                </CardTitle>
                                <SharedBadge />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <Button variant="outline" size="sm" onClick={handleOpenSettings} disabled={loadingConfig}>
                                    {loadingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ρυθμίσεις'}
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleCancel} className="text-red-600 hover:bg-red-50">
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Απενεργοποίηση
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loadingChart && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400 mr-2" />
                                <span className="text-slate-500 dark:text-slate-400">Φόρτωση δεδομένων...</span>
                            </div>
                        )}
                        {!loadingChart && chartData && (
                            <>
                                <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    {parataksiForChart.map(p => (
                                        <div key={p.id} className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                                            <span className="font-medium text-sm">{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="w-full h-96">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={transformedData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis
                                                dataKey="time"
                                                tickFormatter={(t) => format(new Date(t), 'HH:mm', { locale: el })}
                                                stroke="#64748b" style={{ fontSize: '12px' }}
                                            />
                                            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            {parataksiForChart.map(p => (
                                                <Line key={p.name} type="monotone" dataKey={p.name}
                                                    stroke={p.color} strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <div className="text-sm text-slate-600 dark:text-slate-400">Χρονικό Διάστημα</div>
                                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{chartData.labels.length} buckets ({sharedConfig?.bucket_minutes || 5}min)</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <div className="text-sm text-slate-600 dark:text-slate-400">Παρατάξεις</div>
                                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{parataksiForChart.length}</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <div className="text-sm text-slate-600 dark:text-slate-400">Σύνολο Ψήφων</div>
                                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                            {chartData.series.reduce((max, s) => Math.max(max, s.points[s.points.length - 1] || 0), 0)}
                                        </div>
                                    </div>
                                </div>
                                {sharedConfig?.updated_by_name && (
                                    <p className="text-xs text-slate-400 text-right mt-2">
                                        Τελευταία ρύθμιση από: {sharedConfig.updated_by_name}
                                    </p>
                                )}
                            </>
                        )}
                        {!loadingChart && !chartData && (
                            <div className="text-center py-8 text-slate-400">
                                Δεν υπάρχουν δεδομένα ροής ψήφων ακόμα.
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </>
    );
}