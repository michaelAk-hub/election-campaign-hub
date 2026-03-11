import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, TrendingUp, Users, CheckCircle, XCircle, ChevronDown, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import VoteFlowChart from '../components/predictions/VoteFlowChart';

const sessionToken = localStorage.getItem('app_session_token');

function buildQueryParams(filters) {
    const params = new URLSearchParams();
    if (sessionToken) params.set('session_token', sessionToken);
    if (filters.years.length > 0) params.set('year', filters.years.join(','));
    if (filters.symbols.length > 0) params.set('symbol', filters.symbols.join(','));
    if (filters.departments.length > 0) params.set('department', filters.departments.join(','));
    return params.toString();
}

export default function Predictions() {
    const [filters, setFilters] = useState({ years: [], symbols: [], departments: [] });
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [availableFilters, setAvailableFilters] = useState({ years: [], symbols: [], departments: [] });
    const [filterOptionsLoaded, setFilterOptionsLoaded] = useState(false);

    // Load filter options from backend
    useEffect(() => {
        if (!sessionToken || filterOptionsLoaded) return;
        base44.functions.invoke('predictionFilterOptions', { session_token: sessionToken })
            .then(({ data }) => {
                if (data) {
                    setAvailableFilters({
                        years: data.years || [],
                        symbols: data.symbols || [],
                        departments: data.departments || [],
                    });
                    setFilterOptionsLoaded(true);
                }
            })
            .catch(err => console.error('Filter options error:', err));
    }, [filterOptionsLoaded]);

    const queryParams = buildQueryParams(filters);
    const refetchInterval = autoRefresh ? 8000 : false;

    const { data: kpis, refetch: refetchKPIs, isLoading: kpisLoading } = useQuery({
        queryKey: ['predictionKPIs', queryParams],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionKPIs', { queryParams });
            return data;
        },
        refetchInterval,
    });

    const { data: bySymbol, refetch: refetchBySymbol, isLoading: symbolLoading } = useQuery({
        queryKey: ['predictionBySymbol', queryParams],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionBySymbol', { queryParams });
            return data;
        },
        refetchInterval,
    });

    const { data: byYearSymbol, refetch: refetchByYearSymbol, isLoading: yearSymbolLoading } = useQuery({
        queryKey: ['predictionByYearSymbol', queryParams],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionByYearSymbol', { queryParams });
            return data;
        },
        refetchInterval,
    });

    const loading = kpisLoading || symbolLoading || yearSymbolLoading;

    const groupedByYear = React.useMemo(() => {
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

    const handleRefresh = () => {
        refetchKPIs();
        refetchBySymbol();
        refetchByYearSymbol();
    };

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

    const toggleFilter = (type, value) => {
        setFilters(prev => {
            const current = prev[type];
            const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
            return { ...prev, [type]: updated };
        });
    };

    const clearFilters = () => setFilters({ years: [], symbols: [], departments: [] });

    const hasActiveFilters = filters.years.length > 0 || filters.symbols.length > 0 || filters.departments.length > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Προβλέψεις</h1>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">Ανάλυση συμβόλων πρόβλεψης και ψηφοφορίας</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        onClick={() => setAutoRefresh(r => !r)}
                        className={cn("h-10 flex-1 sm:flex-initial", autoRefresh && "bg-blue-50 border-blue-300")}
                    >
                        <RefreshCw className={cn("h-4 w-4 sm:mr-2", autoRefresh && "animate-spin")} />
                        <span className="hidden sm:inline">Auto-refresh {autoRefresh ? 'ON' : 'OFF'}</span>
                        <span className="sm:hidden">{autoRefresh ? 'ON' : 'OFF'}</span>
                    </Button>
                    <Button variant="outline" onClick={handleRefresh} className="h-10 flex-1 sm:flex-initial">
                        <RefreshCw className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Ανανέωση</span>
                    </Button>
                    <Button onClick={handleExport} className="h-10 flex-1 sm:flex-initial">
                        <Download className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Εξαγωγή</span>
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <Card>
                <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        {/* Department */}
                        <div className="min-w-[180px]">
                            <p className="text-xs font-medium text-slate-500 mb-1">Τμήμα</p>
                            <Select onValueChange={(v) => toggleFilter('departments', v)}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Επιλογή τμήματος..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFilters.departments.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Admission Year */}
                        <div className="min-w-[150px]">
                            <p className="text-xs font-medium text-slate-500 mb-1">Έτος Εισδοχής</p>
                            <Select onValueChange={(v) => toggleFilter('years', v)}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Επιλογή έτους..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFilters.years.map(y => (
                                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Symbol */}
                        <div className="min-w-[160px]">
                            <p className="text-xs font-medium text-slate-500 mb-1">Σύμβολο Πρόβλεψης</p>
                            <Select onValueChange={(v) => toggleFilter('symbols', v)}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Επιλογή συμβόλου..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFilters.symbols.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-slate-500">
                                <X className="h-4 w-4 mr-1" />
                                Καθαρισμός
                            </Button>
                        )}
                    </div>

                    {/* Active filter chips */}
                    {hasActiveFilters && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {filters.departments.map(d => (
                                <Badge key={d} variant="secondary" className="cursor-pointer" onClick={() => toggleFilter('departments', d)}>
                                    {d} <X className="h-3 w-3 ml-1" />
                                </Badge>
                            ))}
                            {filters.years.map(y => (
                                <Badge key={y} variant="secondary" className="cursor-pointer" onClick={() => toggleFilter('years', y)}>
                                    {y} <X className="h-3 w-3 ml-1" />
                                </Badge>
                            ))}
                            {filters.symbols.map(s => (
                                <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => toggleFilter('symbols', s)}>
                                    {s} <X className="h-3 w-3 ml-1" />
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

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

            {/* By Symbol Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg">Ανά Σύμβολο Πρόβλεψης</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto px-0 sm:px-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs sm:text-sm">Σύμβολο</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">Σύνολο</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">Ψήφισαν</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">Δεν Ψήφισαν</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">%</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Φόρτωση...</TableCell></TableRow>
                            ) : bySymbol?.rows?.length > 0 ? (
                                <>
                                    {bySymbol.rows.map((row, idx) => (
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
                availableSymbols={availableFilters.symbols}
                filters={filters}
            />
        </div>
    );
}