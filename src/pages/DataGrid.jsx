import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from 'sonner';
import { debounce } from 'lodash';
import ConflictResolutionDialog from '../components/datagrid/ConflictResolutionDialog';
import AccessStyleFilter from '../components/datagrid/AccessStyleFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Search, Filter, RefreshCw, RotateCcw,
    CheckCircle2, Loader2, AlertCircle, Clock, Columns3
} from 'lucide-react';

const GRID_KEY = 'data_grid_person';

export default function DataGrid() {
    const gridRef = useRef();
    const queryClient = useQueryClient();
    const [gridApi, setGridApi] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [partition, setPartition] = useState('postgrad');

    const [lastSync, setLastSync] = useState(null);
    const [gridStatus, setGridStatus] = useState('idle');
    const [conflictDialog, setConflictDialog] = useState(null);
    const [savingCells, setSavingCells] = useState(new Set());
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const [partitionTotal, setPartitionTotal] = useState(0);
    const [loadedRowsCount, setLoadedRowsCount] = useState(0);

    const [sortModel, setSortModel] = useState([{ colId: 'created_date', sort: 'desc' }]);
    const [filterModel, setFilterModel] = useState({});

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const { data: preferences, refetch: refetchPreferences } = useQuery({
        queryKey: ['gridPreferences', GRID_KEY],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('gridPreferencesLoad', { grid_key: GRID_KEY });
            return data.preference;
        }
    });

    const columnDefs = useMemo(() => ([
        { field: 'person_id', headerName: 'ΑΤ (ID)', editable: true, filter: AccessStyleFilter, pinned: isMobile ? null : 'left', width: isMobile ? 100 : 120 },
        { field: 'first_name', headerName: 'Όνομα', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 150 },
        { field: 'last_name', headerName: 'Επώνυμο', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 150 },
        { field: 'mobile_phone', headerName: 'Κινητό', editable: true, filter: AccessStyleFilter, width: isMobile ? 110 : 140, hide: isMobile },
        { field: 'department', headerName: 'Τμήμα', editable: true, filter: AccessStyleFilter, width: isMobile ? 140 : 200, hide: isMobile },
        { field: 'admission_year', headerName: 'Έτος Εισδοχής', editable: true, filter: AccessStyleFilter, width: isMobile ? 100 : 140, hide: isMobile },
        { field: 'academic_level', headerName: 'Επίπεδο', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 150 },
        { field: 'ucid', headerName: 'UCID', editable: true, filter: AccessStyleFilter, width: isMobile ? 100 : 120, hide: isMobile },
        { field: 'contact_person_1', headerName: 'Άτομο 1', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 150, hide: isMobile },
        { field: 'contact_person_2', headerName: 'Άτομο 2', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 150, hide: isMobile },
        { field: 'member', headerName: 'Μέλος', editable: true, filter: AccessStyleFilter, width: isMobile ? 100 : 120, hide: isMobile },
        { field: 'prediction_symbol', headerName: 'Σύμβολο Πρόβλεψης', editable: true, filter: AccessStyleFilter, width: isMobile ? 120 : 160, hide: isMobile },
        {
            field: 'voted', headerName: 'Ψήφισε', editable: true, filter: AccessStyleFilter,
            cellRenderer: (params) => params.value ? 'Ναι' : 'Όχι',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: [true, false], formatValue: (v) => v ? 'Ναι' : 'Όχι' },
            width: isMobile ? 80 : 100
        },
        { field: 'notes', headerName: 'Σημειώσεις', editable: true, filter: AccessStyleFilter, cellEditor: 'agLargeTextCellEditor', width: isMobile ? 150 : 200, hide: isMobile },
        { field: 'monadikos_kanali', headerName: 'Μοναδικός Κανάλι', editable: true, filter: AccessStyleFilter, width: isMobile ? 140 : 180, hide: isMobile },
        { field: 'dataset_id', headerName: 'Dataset ID', editable: false, hide: true },
        {
            field: 'created_date', headerName: 'Δημιουργήθηκε', editable: false, filter: false,
            valueFormatter: (params) => params.value ? new Date(params.value).toLocaleString('el-GR') : '-',
            width: isMobile ? 140 : 180, hide: isMobile,
            cellStyle: { backgroundColor: '#f8fafc', color: '#64748b' }
        }
    ]), [isMobile]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        filter: true,
        floatingFilter: showFilters,
        editable: false,
        singleClickEdit: isMobile,
        stopEditingWhenCellsLoseFocus: true
    }), [showFilters, isMobile]);

    const datasource = useMemo(() => ({
        getRows: async (params) => {
            try {
                const sortField = sortModel.length > 0 ? sortModel[0].colId : 'created_date';
                const sortDirection = sortModel.length > 0 ? sortModel[0].sort : 'desc';

                const { data } = await base44.functions.invoke('personGridFetch', {
                    startRow: params.startRow,
                    endRow: params.endRow,
                    sortField,
                    sortDirection,
                    search: searchQuery,
                    filters: JSON.stringify(filterModel),
                    partition,
                });

                setLastSync(new Date().toISOString());
                setLoadedRowsCount(params.startRow + (data.rows?.length || 0));
                setPartitionTotal(Number(data.partition_total || 0));

                params.successCallback(data.rows, data.lastRow);
            } catch (error) {
                console.error('Error fetching rows:', error);
                params.failCallback();
            }
        }
    }), [sortModel, filterModel, searchQuery, partition]);

    const onGridReady = useCallback((params) => {
        setGridApi(params.api);
        if (preferences?.state_json?.columnState) {
            try {
                params.api.applyColumnState({ state: preferences.state_json.columnState, applyOrder: true });
            } catch (e) {
                console.error("Error applying column state:", e);
            }
        }
    }, [preferences]);

    const onSortChanged = useCallback((params) => {
        const sm = params.api.getColumnState()
            .filter(col => col.sort != null)
            .map(col => ({ colId: col.colId, sort: col.sort }));
        setSortModel(sm);
    }, []);

    const onFilterChanged = useCallback((params) => {
        setFilterModel(params.api.getFilterModel());
        // Force immediate re-fetch on infinite row model
        params.api.purgeInfiniteCache();
    }, []);

    // Purge cache whenever partition/filters/search/sort change
    useEffect(() => {
        if (gridApi) {
            setLoadedRowsCount(0);
            gridApi.purgeInfiniteCache();
        }
    }, [gridApi, sortModel, filterModel, searchQuery, partition]);

    const savePreferences = useMemo(
        () => debounce(async () => {
            if (!gridApi) return;
            try {
                const columnState = gridApi.getColumnState();
                await base44.functions.invoke('gridPreferencesSave', {
                    grid_key: GRID_KEY,
                    state_json: { columnState }
                });
            } catch (error) {
                console.error('Failed to save preferences:', error);
            }
        }, 1000),
        [gridApi]
    );

    const onColumnMoved = useCallback(() => savePreferences(), [savePreferences]);
    const onColumnResized = useCallback(() => savePreferences(), [savePreferences]);
    const onColumnVisible = useCallback(() => savePreferences(), [savePreferences]);

    const handleResetLayout = async () => {
        try {
            await base44.functions.invoke('gridPreferencesReset', { grid_key: GRID_KEY });
            await refetchPreferences();
            if (gridApi) {
                gridApi.setColumnState([]);
                gridApi.purgeInfiniteCache();
            }
            toast.success('Το layout επαναφέρθηκε');
        } catch {
            toast.error('Σφάλμα επαναφοράς layout');
        }
    };

    const cellEditMutation = useMutation({
        mutationFn: async ({ id, field, value, expected_row_version }) => {
            const { data } = await base44.functions.invoke('personGridUpdateCell', {
                person_id: id, field, value, expected_row_version
            });
            return data;
        },
        onMutate: async ({ id, field }) => {
            setSavingCells(prev => new Set([...prev, `${id}_${field}`]));
            setGridStatus('saving');
        },
        onSuccess: (data, variables) => {
            setSavingCells(prev => { const n = new Set(prev); n.delete(`${variables.id}_${variables.field}`); return n; });
            setGridStatus('saved');
            setTimeout(() => setGridStatus('idle'), 1500);
            if (gridApi && data?.data) {
                const rowNode = gridApi.getRowNode(variables.id);
                if (rowNode) rowNode.setData({ ...rowNode.data, ...data.data });
            }
        },
        onError: (error, variables) => {
            setSavingCells(prev => { const n = new Set(prev); n.delete(`${variables.id}_${variables.field}`); return n; });
            if (error?.response?.status === 409) {
                setGridStatus('conflict');
                setConflictDialog({
                    personId: variables.id,
                    field: variables.field,
                    yourValue: variables.value,
                    currentValue: error.response.data.current_row?.[variables.field],
                    currentRow: error.response.data.current_row
                });
            } else {
                setGridStatus('error');
                toast.error(error?.response?.data?.error || 'Σφάλμα αποθήκευσης');
                setTimeout(() => setGridStatus('idle'), 2500);
            }
        }
    });

    const onCellValueChanged = useCallback((params) => {
        const { data, colDef, newValue, oldValue } = params;
        if (newValue === oldValue) return;
        cellEditMutation.mutate({ id: data.id, field: colDef.field, value: newValue, expected_row_version: data.row_version });
    }, [cellEditMutation]);

    const cellClassRules = useMemo(() => ({
        'cell-saving': (params) => savingCells.has(`${params.data?.id}_${params.colDef.field}`)
    }), [savingCells]);

    const getGroupLabel = () => {
        if (partition === 'postgrad') return 'Μεταπτυχιακοί';
        if (partition === 'undergrad') return 'Προπτυχιακοί';
        return 'Άγνωστοι';
    };

    const toggleColumnVisibility = useCallback((field) => {
        if (!gridApi) return;
        const col = gridApi.getColumnState().find(c => c.colId === field);
        if (col) gridApi.setColumnVisible(field, col.hide);
    }, [gridApi]);

    const getVisibleColumns = useCallback(() => {
        if (!gridApi) return [];
        return gridApi.getColumnState().map(col => ({
            field: col.colId,
            hide: col.hide,
            headerName: columnDefs.find(c => c.field === col.colId)?.headerName || col.colId
        }));
    }, [gridApi, columnDefs]);

    const handleReloadLatest = () => {
        setConflictDialog(null);
        gridApi?.purgeInfiniteCache();
        setGridStatus('idle');
    };

    const handleOverwrite = () => {
        if (!conflictDialog) return;
        const { personId, field, yourValue, currentRow } = conflictDialog;
        cellEditMutation.mutate({ id: personId, field, value: yourValue, expected_row_version: currentRow.row_version });
        setConflictDialog(null);
    };

    return (
        <div className="space-y-4 p-2 sm:p-0">
            <Card className="overflow-hidden">
                {/* Toolbar */}
                <div className="flex flex-col gap-2 p-3 sm:p-4 bg-white border-b">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <Input
                            placeholder="Αναζήτηση σε όλα τα πεδία..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-11 text-base"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 whitespace-nowrap">Ομάδα:</span>
                            <select
                                value={partition}
                                onChange={(e) => setPartition(e.target.value)}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                            >
                                <option value="postgrad">Μεταπτυχιακοί (Δ, Μ, Μεταπτυχιακός Εράσμους)</option>
                                <option value="undergrad">Προπτυχιακοί (Π, Προπτυχιακός Εράσμους)</option>
                                <option value="unknown">Άγνωστοι (Blanks)</option>
                            </select>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="h-10">
                                <Filter className="h-4 w-4 mr-1.5" />Φίλτρα
                            </Button>
                            {isMobile && (
                                <Button variant="outline" size="sm" onClick={() => setShowColumnPicker(true)} className="h-10">
                                    <Columns3 className="h-4 w-4 mr-1.5" />Στήλες
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => gridApi?.purgeInfiniteCache()} className="h-10">
                                <RefreshCw className="h-4 w-4 mr-1.5" /><span className="hidden sm:inline">Ανανέωση</span>
                            </Button>
                            {!isMobile && (
                                <Button variant="outline" size="sm" onClick={handleResetLayout} className="h-10">
                                    <RotateCcw className="h-4 w-4 mr-1.5" />Reset
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* AG Grid */}
                <div className="ag-theme-alpine w-full" style={{
                    height: isMobile ? 'calc(100vh - 260px)' : 'calc(100vh - 230px)',
                    minHeight: isMobile ? '400px' : '500px'
                }}>
                    <AgGridReact
                        ref={gridRef}
                        context={{ partition }}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        onGridReady={onGridReady}
                        onCellValueChanged={onCellValueChanged}
                        onColumnMoved={onColumnMoved}
                        onColumnResized={onColumnResized}
                        onColumnVisible={onColumnVisible}
                        onSortChanged={onSortChanged}
                        onFilterChanged={onFilterChanged}
                        cellClassRules={cellClassRules}
                        animateRows={false}
                        maxConcurrentDatasourceRequests={1}
                        suppressMovableColumns={isMobile}
                        stopEditingWhenCellsLoseFocus={true}
                        singleClickEdit={isMobile}
                        enterNavigatesVertically={true}
                        enterNavigatesVerticallyAfterEdit={true}
                        undoRedoCellEditing={true}
                        undoRedoCellEditingLimit={20}
                        getRowId={(params) => params.data.id}
                        rowModelType="infinite"
                        datasource={datasource}
                        cacheBlockSize={100}
                        maxBlocksInCache={6}
                        blockLoadDebounceMillis={100}
                        overlayLoadingTemplate='<span class="ag-overlay-loading-center">Φόρτωση δεδομένων...</span>'
                        overlayNoRowsTemplate='<span class="ag-overlay-no-rows-center">Δεν βρέθηκαν εγγραφές</span>'
                    />
                </div>

                {/* Status Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2 bg-slate-50 border-t text-xs text-slate-600 gap-2">
                    <div className="flex items-center gap-4">
                        <span>Φορτωμένες: <strong>{loadedRowsCount}</strong></span>
                        <span>Σύνολο: <strong>{partitionTotal || '—'}</strong></span>
                        <span className="text-slate-400">Ομάδα: <strong>{getGroupLabel()}</strong></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        {lastSync && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span className="hidden sm:inline">Sync:</span>
                                {new Date(lastSync).toLocaleTimeString('el-GR')}
                            </span>
                        )}
                        {gridStatus === 'saving' && <span className="flex items-center gap-1 font-medium text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />Αποθήκευση...</span>}
                        {gridStatus === 'saved' && <span className="flex items-center gap-1 font-medium text-green-600"><CheckCircle2 className="h-4 w-4" />Αποθηκεύτηκε</span>}
                        {gridStatus === 'error' && <span className="flex items-center gap-1 font-medium text-red-600"><AlertCircle className="h-4 w-4" />Σφάλμα</span>}
                        {gridStatus === 'conflict' && <span className="flex items-center gap-1 font-medium text-yellow-600"><AlertCircle className="h-4 w-4" />Σύγκρουση</span>}
                    </div>
                </div>
            </Card>

            {/* Column Picker (Mobile) */}
            {isMobile && (
                <Dialog open={showColumnPicker} onOpenChange={setShowColumnPicker}>
                    <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Επιλογή Στηλών</DialogTitle></DialogHeader>
                        <div className="space-y-2 py-4">
                            {getVisibleColumns().map(col => (
                                <div key={col.field} className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-50">
                                    <span className="text-sm">{col.headerName}</span>
                                    <Button variant={col.hide ? "outline" : "default"} size="sm" onClick={() => toggleColumnVisibility(col.field)} className="h-8">
                                        {col.hide ? 'Εμφάνιση' : 'Απόκρυψη'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            <ConflictResolutionDialog
                open={!!conflictDialog}
                onClose={() => setConflictDialog(null)}
                conflict={conflictDialog}
                onReloadLatest={handleReloadLatest}
                onOverwrite={handleOverwrite}
            />

            <style jsx global>{`
                .cell-saving { background-color: #dbeafe !important; border: 1px solid #3b82f6 !important; }
                .ag-theme-alpine .ag-root-wrapper { border: none; }
                .ag-theme-alpine .ag-header { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; }
                .ag-theme-alpine .ag-header-cell { font-weight: 600; color: #475569; }
                .ag-theme-alpine .ag-row-hover { background-color: #f8fafc; }
                .ag-theme-alpine .ag-row-selected { background-color: #eff6ff; }
                .ag-overlay-loading-center, .ag-overlay-no-rows-center { padding: 20px; color: #64748b; }
                @media (max-width: 768px) {
                    .ag-theme-alpine { font-size: 13px; }
                    .ag-theme-alpine .ag-header-cell { padding: 10px 6px; min-height: 48px; }
                    .ag-theme-alpine .ag-cell { padding: 12px 6px; min-height: 48px; }
                    .ag-theme-alpine .ag-row { min-height: 48px; }
                    .ag-theme-alpine input[type="text"], .ag-theme-alpine textarea { font-size: 16px; min-height: 44px; padding: 10px; }
                }
            `}</style>
        </div>
    );
}