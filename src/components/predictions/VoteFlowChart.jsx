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

export default function VoteFlowChart({ sessionToken, availableSymbols = [], refreshSignal }) {
    const [showConfig, setShowConfig] = useState(false);
    const [parataksiList, setParataksiList] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    const [sharedConfig, setSharedConfig] = useState(null); // loaded from backend
    const [savingConfig, setSavingConfig] = useState(false);
    const [updatedByName, setUpdatedByName] = useState(null);

    // Load shared config from backend on mount and on refreshSignal
    const loadConfig = useCallback(async () => {
        if (!sessionToken) return;
        setConfigLoading(true);
        try {
            const { data } = await base44.functions.invoke('voteFlowConfigLoad', { session_token: sessionToken });
            if (data?.config) {
                setSharedConfig(data.config);
                const mapping = data.config.mapping || [];
                if (mapping.length > 0) {
                    setParataksiList(mapping.map((m, i) => ({
                        id: i + 1,
                        name: m.parataxi,
                        symbols: m.symbols || [],
                        color: m.color || CHART_COLORS[i % CHART_COLORS.length],
                    })));
                }
                if (data.config.updated_by_name) setUpdatedByName(data.config.updated_by_name);
            } else {
                setSharedConfig(null);
            }
        } catch (err) {
            console.error('voteFlowConfigLoad error:', err);
        } finally {
            setConfigLoading(false);
        }
    }, [sessionToken]);

    useEffect(() => {
        loadConfig();
    }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // On refreshSignal: if chart is already displayed (is_enabled), re-fetch chart data
    useEffect(() => {
        if (refreshSignal === 0) return; // skip initial mount signal
        if (sharedConfig?.is_enabled && parataksiList.length > 0) {
            fetchChartData(parataksiList, false);
        }
    }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchChartData = useCallback(async (listOverride, closeConfig = true) => {
        const list = listOverride || parataksiList;
        if (!list.length) return;
        setLoading(true);
        try {
            const mapping = list.map(p => ({ parataxi: p.name, symbols: p.symbols, color: p.color }));
            const { data } = await base44.functions.invoke('predictionVoteFlow', {
                session_token: sessionToken,
                bucket_minutes: sharedConfig?.bucket_minutes || 5,
                mapping,
            });
            setChartData(data);
            if (closeConfig) setShowConfig(false);
        } catch (error) {
            alert('Σφάλμα κατά τη φόρτωση δεδομένων: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [parataksiList, sessionToken, sharedConfig]);

    const handleStart = () => {
        setShowConfig(true);
        if (parataksiList.length === 0) {
            setParataksiList([{ id: Date.now(), name: '', symbols: [], color: CHART_COLORS[0] }]);
        }
    };

    const addParataksi = () => {
        setParataksiList(prev => [...prev, {
            id: Date.now(), name: '', symbols: [],
            color: CHART_COLORS[prev.length % CHART_COLORS.length]
        }]);
    };

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

    const handleSubmitConfig = async () => {
        if (!validateConfig()) return;
        setSavingConfig(true);
        try {
            const mapping = parataksiList.map(p => ({ parataxi: p.name, symbols: p.symbols, color: p.color }));
            const { data } = await base44.functions.invoke('voteFlowConfigSave', {
                session_token: sessionToken,
                is_enabled: true,
                mapping,
                bucket_minutes: sharedConfig?.bucket_minutes || 5,
            });
            if (data?.config) {
                setSharedConfig(data.config);
                if (data.config.updated_by_name) setUpdatedByName(data.config.updated_by_name);
            }
        } catch (err) {
            alert('Σφάλμα αποθήκευσης ρυθμίσεων: ' + err.message);
            setSavingConfig(false);
            return;
        }
        setSavingConfig(false);
        await fetchChartData(parataksiList, true);
    };

    const handleCancel = async () => {
        // Save disabled state to backend so all users see it disabled
        try {
            await base44.functions.invoke('voteFlowConfigSave', {
                session_token: sessionToken,
                is_enabled: false,
                mapping: [],
                bucket_minutes: 5,
            });
        } catch (_) {}
        setChartData(null);
        setParataksiList([]);
        setShowConfig(false);
        setSharedConfig(prev => prev ? { ...prev, is_enabled: false } : null);
    };

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
            <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
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

    if (configLoading) {
        return (
            <Card>
                <CardContent className="py-12 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        );
    }

    if (!chartData && !showConfig) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Διάγραμμα Ροής Ψήφων
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-12">
                        <TrendingUp className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600 mb-2">
                            Παρακολουθήστε τη ροή της ψηφοφορίας σε πραγματικό χρόνο<br />
                            με αθροιστικές γραμμές ανά παράταξη
                        </p>
                        <p className="text-xs text-slate-400 mb-6 flex items-center justify-center gap-1">
                            <Users className="h-3 w-3" />
                            Κοινό γράφημα για όλους τους χρήστες του ενεργού dataset
                        </p>
                        {updatedByName && (
                            <p className="text-xs text-slate-400 mb-4">Τελευταία ρύθμιση από: {updatedByName}</p>
                        )}
                        <Button onClick={handleStart} size="lg">
                            <Play className="h-4 w-4 mr-2" />
                            Έναρξη
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Dialog open={showConfig} onOpenChange={() => {}}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Ρύθμιση Παρατάξεων</DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-slate-400 -mt-2 mb-2 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Κοινό γράφημα για όλους τους χρήστες του ενεργού dataset
                    </p>
                    <div className="space-y-6 py-4">
                        {parataksiList.map((parataksi, index) => (
                            <Card key={parataksi.id} className="border-2">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1">
                                            <span className="font-semibold text-slate-600">#{index + 1}</span>
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
                                                    className="w-10 h-10 rounded cursor-pointer border border-slate-300"
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
                                        {availableSymbols.map(symbol => (
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
                                        ))}
                                        {availableSymbols.length === 0 && (
                                            <p className="text-sm text-slate-400">Φόρτωση συμβόλων...</p>
                                        )}
                                    </div>
                                    {parataksi.symbols.length > 0 && (
                                        <div className="mt-2 text-sm text-slate-600">
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
                        <Button onClick={handleSubmitConfig} disabled={loading || savingConfig}>
                            {(loading || savingConfig) ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Φόρτωση...</> : <><Play className="h-4 w-4 mr-2" />Αποθήκευση & Εμφάνιση</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {chartData && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5" />
                                    Διάγραμμα Ροής Ψήφων (Αθροιστικό)
                                </CardTitle>
                                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    Κοινό γράφημα για όλους τους χρήστες
                                    {updatedByName && ` · Ρυθμίστηκε από: ${updatedByName}`}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
                                    Ρυθμίσεις
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleCancel}>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Απενεργοποίηση
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                            {parataksiList.map(p => (
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
                                    {parataksiList.map(p => (
                                        <Line key={p.name} type="monotone" dataKey={p.name}
                                            stroke={p.color} strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <div className="text-sm text-slate-600">Χρονικό Διάστημα</div>
                                <div className="text-lg font-bold text-slate-900">{chartData.labels.length} buckets (5min)</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <div className="text-sm text-slate-600">Παρατάξεις</div>
                                <div className="text-lg font-bold text-slate-900">{parataksiList.length}</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <div className="text-sm text-slate-600">Σύνολο Ψήφων</div>
                                <div className="text-lg font-bold text-slate-900">
                                    {chartData.series.reduce((max, s) => Math.max(max, s.points[s.points.length - 1] || 0), 0)}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </>
    );
}