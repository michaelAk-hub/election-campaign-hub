import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Play, XCircle, Plus, Trash2, Loader2, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

// Predefined color palette for parataksi
const CHART_COLORS = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#06b6d4', // cyan
    '#6366f1', // indigo
];

export default function VoteFlowChart() {
    const [showConfig, setShowConfig] = useState(false);
    const [availableSymbols, setAvailableSymbols] = useState([]);
    const [parataksiList, setParataksiList] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(null);

    // Load available symbols on mount
    useEffect(() => {
        const loadSymbols = async () => {
            try {
                const persons = await base44.asServiceRole.entities.Person.filter({});
                const symbols = [...new Set(persons
                    .map(p => p.prediction_symbol)
                    .filter(Boolean)
                )].sort((a, b) => a.localeCompare(b, 'el'));
                setAvailableSymbols(symbols);
            } catch (error) {
                console.error('Error loading symbols:', error);
            }
        };
        loadSymbols();
    }, []);

    // Handle Start button
    const handleStart = () => {
        setShowConfig(true);
        // Initialize with one empty parataksi
        if (parataksiList.length === 0) {
            setParataksiList([{
                id: Date.now(),
                name: '',
                symbols: [],
                color: CHART_COLORS[0]
            }]);
        }
    };

    // Add new parataksi
    const addParataksi = () => {
        const nextColorIndex = parataksiList.length % CHART_COLORS.length;
        setParataksiList([...parataksiList, {
            id: Date.now(),
            name: '',
            symbols: [],
            color: CHART_COLORS[nextColorIndex]
        }]);
    };

    // Remove parataksi
    const removeParataksi = (id) => {
        setParataksiList(parataksiList.filter(p => p.id !== id));
    };

    // Update parataksi field
    const updateParataksi = (id, field, value) => {
        setParataksiList(parataksiList.map(p => 
            p.id === id ? { ...p, [field]: value } : p
        ));
    };

    // Toggle symbol selection
    const toggleSymbol = (parataksiId, symbol) => {
        setParataksiList(parataksiList.map(p => {
            if (p.id === parataksiId) {
                const symbols = p.symbols.includes(symbol)
                    ? p.symbols.filter(s => s !== symbol)
                    : [...p.symbols, symbol];
                return { ...p, symbols };
            }
            return p;
        }));
    };

    // Validate configuration
    const validateConfig = () => {
        if (parataksiList.length === 0) {
            alert('Προσθέστε τουλάχιστον μία παράταξη');
            return false;
        }
        for (const p of parataksiList) {
            if (!p.name.trim()) {
                alert('Όλες οι παρατάξεις πρέπει να έχουν όνομα');
                return false;
            }
            if (p.symbols.length === 0) {
                alert(`Η παράταξη "${p.name}" πρέπει να έχει τουλάχιστον ένα σύμβολο`);
                return false;
            }
        }
        return true;
    };

    // Fetch chart data
    const fetchChartData = async () => {
        if (!validateConfig()) return;

        setLoading(true);
        try {
            const mapping = parataksiList.map(p => ({
                parataxi: p.name,
                symbols: p.symbols,
                color: p.color
            }));

            const { data } = await base44.functions.invoke('predictionVoteFlow', {
                bucket_minutes: 5,
                mapping
            });

            setChartData(data);
            setShowConfig(false);
        } catch (error) {
            console.error('Error fetching chart data:', error);
            alert('Σφάλμα κατά τη φόρτωση δεδομένων: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Auto-refresh effect
    useEffect(() => {
        if (autoRefresh && chartData) {
            const interval = setInterval(() => {
                fetchChartData();
            }, 30000); // 30 seconds
            setRefreshInterval(interval);
            return () => clearInterval(interval);
        } else if (refreshInterval) {
            clearInterval(refreshInterval);
            setRefreshInterval(null);
        }
    }, [autoRefresh, chartData]);

    // Handle Cancel
    const handleCancel = () => {
        setChartData(null);
        setParataksiList([]);
        setAutoRefresh(false);
        setShowConfig(false);
    };

    // Transform data for recharts
    const transformedData = React.useMemo(() => {
        if (!chartData) return [];

        return chartData.labels.map((label, index) => {
            const dataPoint = { time: label };
            chartData.series.forEach(serie => {
                dataPoint[serie.parataxi] = serie.points[index];
            });
            return dataPoint;
        });
    }, [chartData]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const date = new Date(label);
            return (
                <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-sm mb-2">
                        {format(date, 'dd/MM/yyyy HH:mm', { locale: el })}
                    </p>
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                            <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="font-medium">{entry.name}:</span>
                            <span className="font-bold">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    // Initial state - show Start button
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
                        <p className="text-slate-600 mb-6">
                            Παρακολουθήστε τη ροή της ψηφοφορίας σε πραγματικό χρόνο<br />
                            με αθροιστικές γραμμές ανά παράταξη
                        </p>
                        <Button onClick={handleStart} size="lg">
                            <Play className="h-4 w-4 mr-2" />
                            Έναρξη
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Configuration Dialog
    if (showConfig) {
        return (
            <Dialog open={showConfig} onOpenChange={() => {}}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Ρύθμιση Παρατάξεων</DialogTitle>
                    </DialogHeader>
                    
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
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeParataksi(parataksi.id)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
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
                                                    backgroundColor: parataksi.color,
                                                    borderColor: parataksi.color
                                                } : {}}
                                                onClick={() => toggleSymbol(parataksi.id, symbol)}
                                            >
                                                {symbol}
                                            </Badge>
                                        ))}
                                    </div>
                                    {parataksi.symbols.length > 0 && (
                                        <div className="mt-2 text-sm text-slate-600">
                                            Επιλεγμένα: {parataksi.symbols.join(', ')}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}

                        <Button
                            variant="outline"
                            onClick={addParataksi}
                            className="w-full"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Προσθήκη Παράταξης
                        </Button>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfig(false)}>
                            Ακύρωση
                        </Button>
                        <Button onClick={fetchChartData} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Φόρτωση...
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Εμφάνιση Γραφήματος
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Chart display
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Διάγραμμα Ροής Ψήφων (Αθροιστικό)
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            {autoRefresh ? 'Παύση Ανανέωσης' : 'Αυτόματη Ανανέωση'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                        >
                            <XCircle className="h-4 w-4 mr-2" />
                            Ακύρωση
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                    {parataksiList.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                            <div 
                                className="w-4 h-4 rounded-full" 
                                style={{ backgroundColor: p.color }}
                            />
                            <span className="font-medium text-sm">{p.name}</span>
                        </div>
                    ))}
                </div>

                {/* Chart */}
                <div className="w-full h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={transformedData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="time" 
                                tickFormatter={(time) => format(new Date(time), 'HH:mm', { locale: el })}
                                stroke="#64748b"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis 
                                stroke="#64748b"
                                style={{ fontSize: '12px' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {parataksiList.map(p => (
                                <Line
                                    key={p.name}
                                    type="monotone"
                                    dataKey={p.name}
                                    stroke={p.color}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Stats */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-sm text-slate-600">Χρονικό Διάστημα</div>
                        <div className="text-lg font-bold text-slate-900">
                            {chartData.labels.length} buckets (5min)
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-sm text-slate-600">Παρατάξεις</div>
                        <div className="text-lg font-bold text-slate-900">
                            {parataksiList.length}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-sm text-slate-600">Σύνολο Ψήφων</div>
                        <div className="text-lg font-bold text-slate-900">
                            {chartData.series.reduce((max, s) => 
                                Math.max(max, s.points[s.points.length - 1] || 0), 0
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}