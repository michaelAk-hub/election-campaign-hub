import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Download, TrendingUp, Users, CheckCircle, XCircle, ChevronDown, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import VoteFlowChart from '../components/predictions/VoteFlowChart';
import ScenarioSection from '../components/predictions/ScenarioSection';


export default function Predictions() {
    // --- Session token: read inside component, never at module scope ---
    const [sessionToken, setSessionToken] = useState(() => localStorage.getItem('app_session_token') || '');

    useEffect(() => {
        const refresh = () => setSessionToken(localStorage.getItem('app_session_token') || '');
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', refresh);
        return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
    }, []);

    // --- Manual refresh tick for all children ---
    const [refreshTick, setRefreshTick] = useState(0);
    const doRefresh = useCallback(() => setRefreshTick(t => t + 1), []);



    // --- Filter options (symbols, years, departments) ---
    const [availableSymbols, setAvailableSymbols] = useState([]);
    const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
    const [filterOptionsError, setFilterOptionsError] = useState(null);

    const loadFilterOptions = useCallback(async (token) => {
        if (!token) return;
        setFilterOptionsLoading(true);
        setFilterOptionsError(null);
        try {
            const { data } = await base44.functions.invoke('predictionFilterOptions', { session_token: token });
            setAvailableSymbols(data?.symbols || []);
        } catch (err) {
            setFilterOptionsError(err?.message || 'Αποτυχία φόρτωσης επιλογών');
            setAvailableSymbols([]);
        } finally {
            setFilterOptionsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFilterOptions(sessionToken);
    }, [sessionToken, loadFilterOptions]);

    // Reload filter options on refresh tick
    useEffect(() => {
        if (refreshTick === 0) return;
        loadFilterOptions(sessionToken);
    }, [refreshTick]); // eslint-disable-line

    // --- Queries ---
    const { data: kpis, refetch: refetchKPIs, isLoading: kpisLoading } = useQuery({
        queryKey: ['predictionKPIs', sessionToken],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionKPIs', { session_token: sessionToken });
            return data;
        },
        enabled: !!sessionToken,
    });

    const { data: bySymbol, refetch: refetchBySymbol, isLoading: symbolLoading } = useQuery({
        queryKey: ['predictionBySymbol', sessionToken],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionBySymbol', { session_token: sessionToken });
            return data;
        },
        enabled: !!sessionToken,
    });

    const { data: byYearSymbol, refetch: refetchByYearSymbol, isLoading: yearSymbolLoading } = useQuery({
        queryKey: ['predictionByYearSymbol', sessionToken],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionByYearSymbol', { session_token: sessionToken });
            return data;
        },
        enabled: !!sessionToken,
    });

    // On refreshTick, refetch all queries
    useEffect(() => {
        if (refreshTick === 0) return;
        refetchKPIs();
        refetchBySymbol();
        refetchByYearSymbol();
    }, [refreshTick]); // eslint-disable-line

    const loading = kpisLoading || symbolLoading || yearSymbolLoading;

    // --- Sorting for "Ανά Σύμβολο" table ---
    const [sortCol, setSortCol] = useState('symbol');
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sortedSymbolRows = useMemo(() => {
        if (!bySymbol?.rows) return [];
        return [...bySymbol.rows].sort((a, b) => {
            let av, bv;
            if (sortCol === 'symbol') { av = a.symbol ?? ''; bv = b.symbol ?? ''; return sortDir === 'asc' ? av.localeCompare(bv, 'el') : bv.localeCompare(av, 'el'); }
            if (sortCol === 'pct') { av = a.total > 0 ? a.voted_yes / a.total : 0; bv = b.total > 0 ? b.voted_yes / b.total : 0; }
            else { av = a[sortCol] ?? 0; bv = b[sortCol] ?? 0; }
            return sortDir === 'asc' ? av - bv : bv - av;
        });
    }, [bySymbol, sortCol, sortDir]);

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-400" />;
        return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" /> : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
    };

    const groupedByYear = useMemo(() => {

        if (!byYearSymbol?.rows) return {};
        const grouped = {};
        byYearSymbol.rows.forEach(row => {
            if (!grouped[row.admission_year]) {
                grouped[row.admission_year] = { year: row.admission_year, total: 0, voted_yes: 0, voted_no: 0, symbols: [] };
            }
            grouped[row.admission_year].total += row.total;
            grouped[row.admission_year].voted_yes += row.voted_yes;
            grouped[row.admission_year].voted_no += row.voted_no;
            grouped[row.admission_year].symbols.push(row);
        });
        return grouped;
    }, [byYearSymbol]);

    const handleExport = () => {
        if (!bySymbol?.rows || !byYearSymbol?.rows) return;
        const BOM = '\uFEFF';
        let csv = BOM + 'Αναφορά Προβλέψεων\n\n';
        csv += 'Ανά Σύμβολο Πρόβλεψης\n';
        csv += 'Σύμβολο,Σύνολο,Ψήφισαν,Δεν Ψήφισαν,% Ψήφισαν\n';
        bySymbol.rows.forEach(row => {
            const percent = row.total > 0 ? (row.voted_yes / row.total * 100).toFixed(2) : '0.00';
            csv += `${row.symbol},${row.total},${row.voted_yes},${row.voted_no},${percent}%\n`;
        });
        csv += '\n\nΑνά Έτος Εισδοχής και Σύμβολο\n';
        csv += 'Έτος,Σύμβολο,Σύνολο,Ψήφισαν,Δεν Ψήφισαν,% Ψήφισαν\n';
        byYearSymbol.rows.forEach(row => {
            const percent = row.total > 0 ? (row.voted_yes / row.total * 100).toFixed(2) : '0.00';
            csv += `${row.admission_year},${row.symbol},${row.total},${row.voted_yes},${row.voted_no},${percent}%\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `provlepseis_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Προβλέψεις</h1>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">Ανάλυση συμβόλων πρόβλεψης και ψηφοφορίας</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={doRefresh} className="h-10 flex-1 sm:flex-initial">
                        <RefreshCw className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Ανανέωση</span>
                    </Button>
                    <Button onClick={handleExport} className="h-10 flex-1 sm:flex-initial">
                        <Download className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Εξαγωγή</span>
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                            Σύνολο
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                            {loading ? '...' : kpis?.total?.toLocaleString('el-GR') ?? 0}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                            Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-green-600">
                            {loading ? '...' : kpis?.voted_yes?.toLocaleString('el-GR') ?? 0}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <XCircle className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                            Δεν Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-orange-600">
                            {loading ? '...' : kpis?.voted_no?.toLocaleString('el-GR') ?? 0}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                            % Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-blue-600">
                            {loading ? '...' : `${kpis?.voted_yes_percent ?? 0}%`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Scenario Predictions */}
            <ScenarioSection sessionToken={sessionToken} refreshSignal={refreshTick} />

            {/* By Symbol Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg">Ανά Σύμβολο Πρόβλεψης</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto px-0 sm:px-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs sm:text-sm cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('symbol')}>
                                    <span className="inline-flex items-center">Σύμβολο<SortIcon col="symbol" /></span>
                                </TableHead>
                                <TableHead className="text-right text-xs sm:text-sm cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('total')}>
                                    <span className="inline-flex items-center justify-end w-full">Σύνολο<SortIcon col="total" /></span>
                                </TableHead>
                                <TableHead className="text-right text-xs sm:text-sm cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('voted_yes')}>
                                    <span className="inline-flex items-center justify-end w-full">Ψήφισαν<SortIcon col="voted_yes" /></span>
                                </TableHead>
                                <TableHead className="text-right text-xs sm:text-sm cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('voted_no')}>
                                    <span className="inline-flex items-center justify-end w-full">Δεν Ψήφισαν<SortIcon col="voted_no" /></span>
                                </TableHead>
                                <TableHead className="text-right text-xs sm:text-sm cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('pct')}>
                                    <span className="inline-flex items-center justify-end w-full">%<SortIcon col="pct" /></span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Φόρτωση...</TableCell></TableRow>
                            ) : sortedSymbolRows.length > 0 ? (
                                <>
                                    {sortedSymbolRows.map((row, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs sm:text-sm">{row.symbol}</TableCell>
                                            <TableCell className="text-right font-bold text-xs sm:text-sm">{row.total.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-green-600 text-xs sm:text-sm">{row.voted_yes.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600 text-xs sm:text-sm">{row.voted_no.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-xs sm:text-sm">
                                                {row.total > 0 ? `${((row.voted_yes / row.total) * 100).toFixed(0)}%` : '0%'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-slate-50 dark:bg-slate-800 font-bold">
                                        <TableCell>Σύνολο</TableCell>
                                        <TableCell className="text-right">{kpis?.total?.toLocaleString('el-GR') ?? 0}</TableCell>
                                        <TableCell className="text-right text-green-600">{kpis?.voted_yes?.toLocaleString('el-GR') ?? 0}</TableCell>
                                        <TableCell className="text-right text-orange-600">{kpis?.voted_no?.toLocaleString('el-GR') ?? 0}</TableCell>
                                        <TableCell className="text-right">{kpis?.voted_yes_percent ?? 0}%</TableCell>
                                    </TableRow>
                                </>
                            ) : (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Δεν υπάρχουν δεδομένα</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* By Year Accordion */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg">Ανά Έτος Εισδοχής</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Φόρτωση...</div>
                    ) : Object.values(groupedByYear).length > 0 ? (
                        Object.values(groupedByYear).map((yearData) => (
                            <Collapsible key={yearData.year} className="border rounded-lg">
                                <CollapsibleTrigger className="w-full p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ChevronDown className="h-5 w-5 text-slate-400" />
                                            <span className="font-semibold text-lg">{yearData.year}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Σύνολο</div>
                                                <div className="font-bold">{yearData.total.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Ψήφισαν</div>
                                                <div className="font-bold text-green-600">{yearData.voted_yes.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Δεν Ψήφ.</div>
                                                <div className="font-bold text-orange-600">{yearData.voted_no.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">%</div>
                                                <div className="font-bold text-blue-600">
                                                    {yearData.total > 0 ? `${((yearData.voted_yes / yearData.total) * 100).toFixed(1)}%` : '0%'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="border-t dark:border-slate-700 p-2 sm:p-4 overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Σύμβολο</TableHead>
                                                    <TableHead className="text-right">Σύνολο</TableHead>
                                                    <TableHead className="text-right">Ψήφισαν</TableHead>
                                                    <TableHead className="text-right">Δεν Ψήφισαν</TableHead>
                                                    <TableHead className="text-right">% Ψήφισαν</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {yearData.symbols.map((row, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell className="font-medium">{row.symbol}</TableCell>
                                                        <TableCell className="text-right font-bold">{row.total.toLocaleString('el-GR')}</TableCell>
                                                        <TableCell className="text-right font-bold text-green-600">{row.voted_yes.toLocaleString('el-GR')}</TableCell>
                                                        <TableCell className="text-right font-bold text-orange-600">{row.voted_no.toLocaleString('el-GR')}</TableCell>
                                                        <TableCell className="text-right font-bold">
                                                            {row.total > 0 ? `${((row.voted_yes / row.total) * 100).toFixed(2)}%` : '0.00%'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        ))
                    ) : (
                        <div className="text-center py-8 text-slate-500">Δεν υπάρχουν δεδομένα</div>
                    )}
                </CardContent>
            </Card>

            {/* Vote Flow Chart */}
            <VoteFlowChart
                sessionToken={sessionToken}
                availableSymbols={availableSymbols}
                filterOptionsLoading={filterOptionsLoading}
                filterOptionsError={filterOptionsError}
                refreshSignal={refreshTick}
            />
        </div>
    );
}