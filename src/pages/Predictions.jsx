import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RefreshCw, Download, TrendingUp, Users, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import VoteFlowChart from '../components/predictions/VoteFlowChart';

export default function Predictions() {
    const [filters, setFilters] = useState({
        years: [],
        symbols: [],
        departments: []
    });
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [availableFilters, setAvailableFilters] = useState({
        years: [],
        symbols: [],
        departments: []
    });

    // Build filter query params
    const buildFilterParams = () => {
        const params = new URLSearchParams();
        
        // REQUIRED for backend auth
        const sessionToken = localStorage.getItem('app_session_token');
        console.log('Session token from localStorage:', sessionToken ? 'exists' : 'missing');
        if (sessionToken) {
            params.set('session_token', sessionToken);
        }
        
        // existing filters
        if (filters.years.length > 0) params.set('year', filters.years.join(','));
        if (filters.symbols.length > 0) params.set('symbol', filters.symbols.join(','));
        if (filters.departments.length > 0) params.set('department', filters.departments.join(','));
        
        const queryString = params.toString();
        console.log('Query params:', queryString);
        return queryString;
    };

    // Fetch KPIs
    const { data: kpis, refetch: refetchKPIs, isLoading: kpisLoading, error: kpisError } = useQuery({
        queryKey: ['predictionKPIs', filters],
        queryFn: async () => {
            const queryParams = buildFilterParams();
            console.log('Invoking predictionKPIs with:', queryParams);
            const response = await base44.functions.invoke('predictionKPIs', {
                queryParams
            });
            console.log('KPIs Response:', response);
            return response.data;
        },
        refetchInterval: autoRefresh ? 8000 : false,
        retry: false
    });

    // Fetch by symbol
    const { data: bySymbol, refetch: refetchBySymbol, isLoading: symbolLoading, error: symbolError } = useQuery({
        queryKey: ['predictionBySymbol', filters],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionBySymbol', {
                queryParams: buildFilterParams()
            });
            return data;
        },
        refetchInterval: autoRefresh ? 8000 : false
    });

    // Fetch by year-symbol
    const { data: byYearSymbol, refetch: refetchByYearSymbol, isLoading: yearSymbolLoading, error: yearSymbolError } = useQuery({
        queryKey: ['predictionByYearSymbol', filters],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionByYearSymbol', {
                queryParams: buildFilterParams()
            });
            return data;
        },
        refetchInterval: autoRefresh ? 8000 : false
    });

    // Load available filter options
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const sessionToken = localStorage.getItem('app_session_token');
                const params = new URLSearchParams();
                if (sessionToken) params.set('session_token', sessionToken);
                
                const { data: persons } = await base44.functions.invoke('predictionByYearSymbol', {
                    queryParams: params.toString()
                });
                
                const years = [...new Set(persons.rows.map(r => r.admission_year))].sort().reverse();
                const symbols = [...new Set(persons.rows.map(r => r.symbol))].sort((a, b) => a.localeCompare(b, 'el'));
                
                // Get departments from Person records
                const allPersons = await base44.asServiceRole.entities.Person.filter({});
                const departments = [...new Set(allPersons.map(p => p.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));

                setAvailableFilters({ years, symbols, departments });
            } catch (error) {
                console.error('Error loading filter options:', error);
            }
        };
        loadFilterOptions();
    }, []);

    // Group by year for accordion
    const groupedByYear = React.useMemo(() => {
        if (!byYearSymbol?.rows) return {};
        
        const grouped = {};
        byYearSymbol.rows.forEach(row => {
            if (!grouped[row.admission_year]) {
                grouped[row.admission_year] = {
                    year: row.admission_year,
                    total: 0,
                    voted_yes: 0,
                    voted_no: 0,
                    symbols: []
                };
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

        // Create CSV content with UTF-8 BOM for Excel Greek support
        const BOM = '\uFEFF';
        let csv = BOM + 'Αναφορά Προβλέψεων\n\n';
        
        // By Symbol
        csv += 'Ανά Σύμβολο Πρόβλεψης\n';
        csv += 'Σύμβολο,Σύνολο,Ψήφισαν,Δεν Ψήφισαν,% Ψήφισαν\n';
        bySymbol.rows.forEach(row => {
            const percent = row.total > 0 ? (row.voted_yes / row.total * 100).toFixed(2) : '0.00';
            csv += `${row.symbol},${row.total},${row.voted_yes},${row.voted_no},${percent}%\n`;
        });

        // By Year-Symbol
        csv += '\n\nΑνά Έτος Εισδοχής και Σύμβολο\n';
        csv += 'Έτος,Σύμβολο,Σύνολο,Ψήφισαν,Δεν Ψήφισαν,% Ψήφισαν\n';
        byYearSymbol.rows.forEach(row => {
            const percent = row.total > 0 ? (row.voted_yes / row.total * 100).toFixed(2) : '0.00';
            csv += `${row.admission_year},${row.symbol},${row.total},${row.voted_yes},${row.voted_no},${percent}%\n`;
        });

        // Download with UTF-8 BOM for proper Greek character display in Excel
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `provlepseis_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const loading = kpisLoading || symbolLoading || yearSymbolLoading;

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
                        onClick={() => setAutoRefresh(!autoRefresh)}
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

            {/* Debug Info (temporary) */}
            {(kpis?.debug || kpisError || symbolError || yearSymbolError) && (
                <Card className="bg-yellow-50 border-yellow-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Debug Info</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs space-y-1">
                            {kpisError && <div className="text-red-600 font-bold">KPIs Error: {kpisError.message}</div>}
                            {symbolError && <div className="text-red-600 font-bold">Symbol Error: {symbolError.message}</div>}
                            {yearSymbolError && <div className="text-red-600 font-bold">YearSymbol Error: {yearSymbolError.message}</div>}
                            {kpis?.debug && (
                                <>
                                    <div>Active Dataset ID: {kpis.debug.activeDatasetId}</div>
                                    <div>Dataset Status: {kpis.debug.activeDatasetStatus}</div>
                                    <div>Persons in Dataset: {kpis.debug.personsInDataset}</div>
                                    <div>After Filters: {kpis.debug.filteredPersons}</div>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card>
                    <CardHeader className="pb-2 sm:pb-3">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 sm:gap-2">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="truncate">Σύνολο</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                            {loading ? '...' : kpis?.total?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2 sm:pb-3">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 sm:gap-2">
                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                            <span className="truncate">Ψήφισαν</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-green-600">
                            {loading ? '...' : kpis?.voted_yes?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2 sm:pb-3">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 sm:gap-2">
                            <XCircle className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                            <span className="truncate">Δεν Ψήφισαν</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-orange-600">
                            {loading ? '...' : kpis?.voted_no?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2 sm:pb-3">
                        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 sm:gap-2">
                            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                            <span className="truncate">% Ψήφισαν</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl sm:text-3xl font-bold text-blue-600">
                            {loading ? '...' : `${kpis?.voted_yes_percent || 0}%`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* By Symbol Table */}
            <Card>
                <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Ανά Σύμβολο Πρόβλεψης</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto -mx-2 sm:mx-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs sm:text-sm">Σύμβολο</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">Σύνολο</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Ψήφισαν</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Δεν Ψήφισαν</TableHead>
                                <TableHead className="text-right text-xs sm:text-sm">%</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        Φόρτωση...
                                    </TableCell>
                                </TableRow>
                            ) : bySymbol?.rows?.length > 0 ? (
                                <>
                                    {bySymbol.rows.map((row, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs sm:text-sm">{row.symbol}</TableCell>
                                            <TableCell className="text-right font-bold text-xs sm:text-sm">{row.total.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-green-600 text-xs sm:text-sm hidden sm:table-cell">{row.voted_yes.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600 text-xs sm:text-sm hidden sm:table-cell">{row.voted_no.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-xs sm:text-sm">
                                                {row.total > 0 ? `${((row.voted_yes / row.total) * 100).toFixed(0)}%` : '0%'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-slate-50 dark:bg-slate-800 font-bold">
                                        <TableCell>Σύνολο</TableCell>
                                        <TableCell className="text-right">{kpis?.total?.toLocaleString('el-GR') || 0}</TableCell>
                                        <TableCell className="text-right text-green-600">{kpis?.voted_yes?.toLocaleString('el-GR') || 0}</TableCell>
                                        <TableCell className="text-right text-orange-600">{kpis?.voted_no?.toLocaleString('el-GR') || 0}</TableCell>
                                        <TableCell className="text-right">{kpis?.voted_yes_percent || 0}%</TableCell>
                                    </TableRow>
                                </>
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        Δεν υπάρχουν δεδομένα
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* By Year Accordion */}
            <Card>
                <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Ανά Έτος Εισδοχής</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500 dark:text-slate-400">Φόρτωση...</div>
                    ) : Object.values(groupedByYear).length > 0 ? (
                        Object.values(groupedByYear).map((yearData) => (
                            <Collapsible key={yearData.year} className="border rounded-lg">
                                <CollapsibleTrigger className="w-full p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ChevronDown className="h-5 w-5 text-slate-400" />
                                            <span className="font-semibold text-lg">{yearData.year}</span>
                                        </div>
                                        <div className="flex gap-6 text-sm">
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Σύνολο</div>
                                                <div className="font-bold">{yearData.total.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Ψήφισαν</div>
                                                <div className="font-bold text-green-600">{yearData.voted_yes.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">Δεν Ψήφισαν</div>
                                                <div className="font-bold text-orange-600">{yearData.voted_no.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600 dark:text-slate-400">%</div>
                                                <div className="font-bold text-blue-600">
                                                    {yearData.total > 0 ? `${((yearData.voted_yes / yearData.total) * 100).toFixed(2)}%` : '0.00%'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="border-t dark:border-slate-700 p-4">
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
                        <div className="text-center py-8 text-slate-500 dark:text-slate-400">Δεν υπάρχουν δεδομένα</div>
                    )}
                </CardContent>
            </Card>

            {/* Vote Flow Chart */}
            <VoteFlowChart />
        </div>
    );
}