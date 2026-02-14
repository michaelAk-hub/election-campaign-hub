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
        if (filters.years.length > 0) params.set('year', filters.years.join(','));
        if (filters.symbols.length > 0) params.set('symbol', filters.symbols.join(','));
        if (filters.departments.length > 0) params.set('department', filters.departments.join(','));
        return params.toString();
    };

    // Fetch KPIs
    const { data: kpis, refetch: refetchKPIs, isLoading: kpisLoading } = useQuery({
        queryKey: ['predictionKPIs', filters],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('predictionKPIs', {
                queryParams: buildFilterParams()
            });
            return data;
        },
        refetchInterval: autoRefresh ? 8000 : false
    });

    // Fetch by symbol
    const { data: bySymbol, refetch: refetchBySymbol, isLoading: symbolLoading } = useQuery({
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
    const { data: byYearSymbol, refetch: refetchByYearSymbol, isLoading: yearSymbolLoading } = useQuery({
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
                const { data: persons } = await base44.functions.invoke('predictionByYearSymbol', {
                    queryParams: ''
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
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Προβλέψεις</h1>
                    <p className="text-slate-600 mt-1">Ανάλυση συμβόλων πρόβλεψης και ψηφοφορίας</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(autoRefresh && "bg-blue-50 border-blue-300")}
                    >
                        <RefreshCw className={cn("h-4 w-4 mr-2", autoRefresh && "animate-spin")} />
                        Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                    </Button>
                    <Button variant="outline" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Ανανέωση
                    </Button>
                    <Button onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Εξαγωγή
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Φίλτρα</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Έτος Εισδοχής</label>
                            <Select
                                value={filters.years.length > 0 ? 'selected' : 'all'}
                                onValueChange={(value) => {
                                    if (value === 'all') setFilters(prev => ({ ...prev, years: [] }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Όλα τα έτη" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Όλα τα έτη</SelectItem>
                                    {availableFilters.years.map(year => (
                                        <SelectItem key={year} value={year}>{year}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Σύμβολο Πρόβλεψης</label>
                            <Select
                                value={filters.symbols.length > 0 ? 'selected' : 'all'}
                                onValueChange={(value) => {
                                    if (value === 'all') setFilters(prev => ({ ...prev, symbols: [] }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Όλα τα σύμβολα" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Όλα τα σύμβολα</SelectItem>
                                    {availableFilters.symbols.map(symbol => (
                                        <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Τμήμα</label>
                            <Select
                                value={filters.departments.length > 0 ? 'selected' : 'all'}
                                onValueChange={(value) => {
                                    if (value === 'all') setFilters(prev => ({ ...prev, departments: [] }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Όλα τα τμήματα" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Όλα τα τμήματα</SelectItem>
                                    {availableFilters.departments.map(dept => (
                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Σύνολο Εγγραφών
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">
                            {loading ? '...' : kpis?.total?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-600">
                            {loading ? '...' : kpis?.voted_yes?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-orange-600" />
                            Δεν Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-orange-600">
                            {loading ? '...' : kpis?.voted_no?.toLocaleString('el-GR') || 0}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-600" />
                            % Ψήφισαν
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-600">
                            {loading ? '...' : `${kpis?.voted_yes_percent || 0}%`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* By Symbol Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Ανά Σύμβολο Πρόβλεψης</CardTitle>
                </CardHeader>
                <CardContent>
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
                                            <TableCell className="font-medium">{row.symbol}</TableCell>
                                            <TableCell className="text-right font-bold">{row.total.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-green-600">{row.voted_yes.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600">{row.voted_no.toLocaleString('el-GR')}</TableCell>
                                            <TableCell className="text-right font-bold">
                                                {row.total > 0 ? `${((row.voted_yes / row.total) * 100).toFixed(2)}%` : '0.00%'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-slate-50 font-bold">
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
                <CardHeader>
                    <CardTitle>Ανά Έτος Εισδοχής</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Φόρτωση...</div>
                    ) : Object.values(groupedByYear).length > 0 ? (
                        Object.values(groupedByYear).map((yearData) => (
                            <Collapsible key={yearData.year} className="border rounded-lg">
                                <CollapsibleTrigger className="w-full p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ChevronDown className="h-5 w-5 text-slate-400" />
                                            <span className="font-semibold text-lg">{yearData.year}</span>
                                        </div>
                                        <div className="flex gap-6 text-sm">
                                            <div className="text-right">
                                                <div className="text-slate-600">Σύνολο</div>
                                                <div className="font-bold">{yearData.total.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600">Ψήφισαν</div>
                                                <div className="font-bold text-green-600">{yearData.voted_yes.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600">Δεν Ψήφισαν</div>
                                                <div className="font-bold text-orange-600">{yearData.voted_no.toLocaleString('el-GR')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-600">%</div>
                                                <div className="font-bold text-blue-600">
                                                    {yearData.total > 0 ? `${((yearData.voted_yes / yearData.total) * 100).toFixed(2)}%` : '0.00%'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="border-t p-4">
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
        </div>
    );
}