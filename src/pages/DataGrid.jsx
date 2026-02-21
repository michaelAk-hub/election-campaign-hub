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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Search,
    Filter,
    Download,
    RefreshCw,
    RotateCcw,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Clock,
    Columns3
} from 'lucide-react';

const GRID_KEY = 'data_grid_person';

export default function DataGrid() {
    const gridRef = useRef();
    const queryClient = useQueryClient();
    const [gridApi, setGridApi] = useState(null);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [gridStatus, setGridStatus] = useState('idle');
    const [conflictDialog, setConflictDialog] = useState(null);
    const [savingCells, setSavingCells] = useState(new Set());
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [gridTotal, setGridTotal] = useState(0);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Load grid preferences
    const { data: preferences, refetch: refetchPreferences } = useQuery({
        queryKey: ['gridPreferences', GRID_KEY],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('gridPreferencesLoad', { grid_key: GRID_KEY });
            return data.preference;
        }
    });

    // Column definitions based on Person schema
    const columnDefs = useMemo(() => [
        {
            field: 'person_id',
            headerName: 'ΑΤ (ID)',
            editable: true,
            filter: 'agTextColumnFilter',
            pinned: isMobile ? null : 'left',
            width: isMobile ? 100 : 120,
            hide: false
        },
        {
            field: 'first_name',
            headerName: 'Όνομα',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 150,
            hide: false
        },
        {
            field: 'last_name',
            headerName: 'Επώνυμο',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 150,
            hide: false
        },
        {
            field: 'mobile_phone',
            headerName: 'Κινητό',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 110 : 140,
            hide: isMobile
        },
        {
            field: 'department',
            headerName: 'Τμήμα',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 140 : 200,
            hide: isMobile
        },
        {
            field: 'admission_year',
            headerName: 'Έτος Εισδοχής',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 100 : 140,
            hide: isMobile
        },
        {
            field: 'academic_level',
            headerName: 'Επίπεδο',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 100 : 150,
            hide: isMobile
        },
        {
            field: 'ucid',
            headerName: 'UCID',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 100 : 120,
            hide: isMobile
        },
        {
            field: 'contact_person_1',
            headerName: 'Άτομο 1',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 150,
            hide: isMobile
        },
        {
            field: 'contact_person_2',
            headerName: 'Άτομο 2',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 150,
            hide: isMobile
        },
        {
            field: 'member',
            headerName: 'Μέλος',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 100 : 120,
            hide: isMobile
        },
        {
            field: 'prediction_symbol',
            headerName: 'Σύμβολο Πρόβλεψης',
            editable: true,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 160,
            hide: isMobile
        },
        {
            field: 'voted',
            headerName: 'Ψήφισε',
            editable: true,
            filter: 'agSetColumnFilter',
            cellRenderer: (params) => params.value ? 'Ναι' : 'Όχι',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: [true, false],
                valueListGap: 0,
                formatValue: (value) => value ? 'Ναι' : 'Όχι'
            },
            width: isMobile ? 80 : 100,
            hide: false
        },
        {
            field: 'notes',
            headerName: 'Σημειώσεις',
            editable: true,
            filter: 'agTextColumnFilter',
            cellEditor: 'agLargeTextCellEditor',
            width: isMobile ? 150 : 200,
            hide: isMobile
        },
        {
            field: 'dataset_id',
            headerName: 'Dataset ID',
            editable: false,
            filter: 'agTextColumnFilter',
            width: isMobile ? 120 : 150,
            cellStyle: { backgroundColor: '#f8fafc', color: '#64748b' },
            hide: true
        },
        {
            field: 'created_date',
            headerName: 'Δημιουργήθηκε',
            editable: false,
            filter: 'agDateColumnFilter',
            valueFormatter: (params) => {
                if (!params.value) return '-';
                return new Date(params.value).toLocaleString('el-GR');
            },
            width: isMobile ? 140 : 180,
            cellStyle: { backgroundColor: '#f8fafc', color: '#64748b' },
            hide: isMobile
        }
    ], [isMobile]);

    // Default grid options
    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        filter: true,
        floatingFilter: showFilters,
        editable: false,
        singleClickEdit: false
    }), [showFilters]);

    // Server-side Datasource for infinite scrolling
    const serverSideDatasource = useMemo(() => {
        return {
            getRows: async (params) => {
                try {
                    const currentPage = Math.floor(params.request.startRow / (params.request.endRow - params.request.startRow)) + 1;
                    const pageSize = params.request.endRow - params.request.startRow;

                    const sortModel = params.request.sortModel.length > 0 ? params.request.sortModel[0] : null;
                    const sortField = sortModel ? sortModel.colId : 'created_date';
                    const sortDirection = sortModel ? sortModel.sort : 'desc';

                    const filters = {};
                    Object.entries(params.request.filterModel).forEach(([key, value]) => {
                        if (value.filterType === 'text') {
                            filters[key] = { operator: value.type, value: value.filter };
                        } else if (value.filterType === 'set') {
                            filters[key] = { operator: 'in', value: value.values };
                        } else if (value.filterType === 'date') {
                            filters[key] = { operator: value.type, value: value.dateFrom };
                        }
                    });

                    const requestParams = {
                        page: currentPage,
                        pageSize: pageSize,
                        sortField: sortField,
                        sortDirection: sortDirection,
                        search: searchQuery,
                        filters: JSON.stringify(filters)
                    };

                    const { data } = await base44.functions.invoke('personGridFetch', requestParams);
                    setLastSync(new Date().toISOString());
                    
                    params.successCallback(data.data, data.total);
                    setGridTotal(data.total);
                } catch (error) {
                    console.error("Error fetching data:", error);
                    params.failCallback();
                    toast.error('Σφάλμα φόρτωσης δεδομένων');
                }
            }
        };
    }, [searchQuery]);

    const onGridReady = useCallback((params) => {
        setGridApi(params.api);
        params.api.setServerSideDatasource(serverSideDatasource);
        if (preferences?.state_json?.columnState) {
            try {
                params.api.applyColumnState({ state: preferences.state_json.columnState, applyOrder: true });
            } catch (error) {
                console.error("Error applying column state on grid ready:", error);
            }
        }
    }, [serverSideDatasource, preferences]);

    // Update datasource when search changes
    useEffect(() => {
        if (gridApi) {
            gridApi.setServerSideDatasource(serverSideDatasource);
        }
    }, [gridApi, serverSideDatasource]);

    const refetch = useCallback(() => {
        if (gridApi) {
            gridApi.setServerSideDatasource(serverSideDatasource);
        }
    }, [gridApi, serverSideDatasource]);

    // Cell edit mutation
    const cellEditMutation = useMutation({
        mutationFn: async ({ id, field, value, expected_row_version }) => {
            const { data } = await base44.functions.invoke('personGridUpdateCell', {
                person_id: id,
                field,
                value,
                expected_row_version
            });
            return data;
        },
        onMutate: async ({ id, field }) => {
            const cellKey = `${id}_${field}`;
            setSavingCells(prev => new Set([...prev, cellKey]));
            setGridStatus('saving');
        },
        onSuccess: (data, variables) => {
            const cellKey = `${variables.id}_${variables.field}`;
            setSavingCells(prev => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
            });
            
            setGridStatus('saved');
            setTimeout(() => setGridStatus('idle'), 2000);
            
            if (gridApi && data.data) {
                const rowNode = gridApi.getRowNode(variables.id);
                if (rowNode) {
                    rowNode.setData({ ...rowNode.data, ...data.data });
                }
            }
        },
        onError: (error, variables) => {
            const cellKey = `${variables.id}_${variables.field}`;
            setSavingCells(prev => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
            });

            if (error.response?.status === 409) {
                setGridStatus('conflict');
                const conflictData = error.response.data;
                setConflictDialog({
                    personId: variables.id,
                    field: variables.field,
                    yourValue: variables.value,
                    currentValue: conflictData.current_row?.[variables.field],
                    currentRow: conflictData.current_row
                });
            } else {
                setGridStatus('error');
                toast.error(error.response?.data?.error || 'Σφάλμα αποθήκευσης');
                setTimeout(() => setGridStatus('idle'), 3000);
            }
        }
    });

    // Cell value changed handler (auto-save)
    const onCellValueChanged = useCallback((params) => {
        const { data, colDef, newValue, oldValue } = params;
        
        if (newValue === oldValue) return;
        
        cellEditMutation.mutate({
            id: data.id,
            field: colDef.field,
            value: newValue,
            expected_row_version: data.row_version
        });
    }, [cellEditMutation]);

    // Save grid preferences (debounced)
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

    // Grid events
    const onColumnMoved = useCallback(() => {
        savePreferences();
    }, [savePreferences]);

    const onColumnResized = useCallback(() => {
        savePreferences();
    }, [savePreferences]);

    const onColumnVisible = useCallback(() => {
        savePreferences();
    }, [savePreferences]);

    // Export to CSV
    const handleExport = useCallback(() => {
        if (gridApi) {
            gridApi.exportDataAsCsv({
                fileName: `person_data_${new Date().toISOString().split('T')[0]}.csv`
            });
            toast.success('Τα δεδομένα εξήχθησαν επιτυχώς');
        }
    }, [gridApi]);

    // Reset layout
    const handleResetLayout = async () => {
        try {
            await base44.functions.invoke('gridPreferencesReset', { grid_key: GRID_KEY });
            await refetchPreferences();
            if (gridApi) {
                gridApi.setColumnState([]);
                gridApi.setServerSideDatasource(serverSideDatasource);
            }
            toast.success('Το layout επαναφέρθηκε');
        } catch (error) {
            toast.error('Σφάλμα επαναφοράς layout');
        }
    };

    // Conflict resolution handlers
    const handleReloadLatest = () => {
        setConflictDialog(null);
        refetch();
        setGridStatus('idle');
    };

    const handleOverwrite = () => {
        if (!conflictDialog) return;
        const { personId, field, yourValue, currentRow } = conflictDialog;
        
        cellEditMutation.mutate({
            id: personId,
            field,
            value: yourValue,
            expected_row_version: currentRow.row_version
        });
        
        setConflictDialog(null);
    };

    // Search handler
    const onSearchChange = useCallback((value) => {
        setSearchQuery(value);
    }, []);

    // Custom cell class rules for saving indicator
    const cellClassRules = useMemo(() => ({
        'cell-saving': (params) => {
            const cellKey = `${params.data?.id}_${params.colDef.field}`;
            return savingCells.has(cellKey);
        }
    }), [savingCells]);

    // Toggle column visibility
    const toggleColumnVisibility = useCallback((field) => {
        if (gridApi) {
            const columnState = gridApi.getColumnState();
            const column = columnState.find(col => col.colId === field);
            if (column) {
                gridApi.setColumnVisible(field, column.hide);
            }
        }
    }, [gridApi]);

    // Get visible columns
    const getVisibleColumns = useCallback(() => {
        if (!gridApi) return [];
        return gridApi.getColumnState().map(col => ({
            field: col.colId,
            hide: col.hide,
            headerName: columnDefs.find(c => c.field === col.colId)?.headerName || col.colId
        }));
    }, [gridApi, columnDefs]);

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
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 h-11 text-base"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        <Button
                            variant={showFilters ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                            className="h-10"
                        >
                            <Filter className="h-4 w-4 mr-1.5" />
                            Φίλτρα
                        </Button>

                        {isMobile && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setShowColumnPicker(true)}
                                className="h-10"
                            >
                                <Columns3 className="h-4 w-4 mr-1.5" />
                                Στήλες
                            </Button>
                        )}

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleExport}
                            className="h-10"
                        >
                            <Download className="h-4 w-4 mr-1.5" />
                            <span className="hidden sm:inline">Export</span>
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => refetch()}
                            className="h-10"
                        >
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                            <span className="hidden sm:inline">Ανανέωση</span>
                        </Button>

                        {!isMobile && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleResetLayout}
                                className="h-10"
                            >
                                <RotateCcw className="h-4 w-4 mr-1.5" />
                                Reset
                            </Button>
                        )}
                    </div>
                </div>

                {/* AG Grid */}
                <div className="ag-theme-alpine w-full" style={{ 
                    height: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 200px)', 
                    minHeight: isMobile ? '400px' : '500px' 
                }}>
                    <AgGridReact
                        ref={gridRef}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        onGridReady={onGridReady}
                        onCellValueChanged={onCellValueChanged}
                        onColumnMoved={onColumnMoved}
                        onColumnResized={onColumnResized}
                        onColumnVisible={onColumnVisible}
                        animateRows={true}
                        suppressMovableColumns={isMobile}
                        stopEditingWhenCellsLoseFocus={true}
                        singleClickEdit={isMobile}
                        enterNavigatesVertically={true}
                        enterNavigatesVerticallyAfterEdit={true}
                        undoRedoCellEditing={true}
                        undoRedoCellEditingLimit={20}
                        getRowId={(params) => params.data.id}
                        rowModelType={'serverSide'}
                        pagination={true}
                        paginationPageSize={100}
                        cacheBlockSize={100}
                        maxBlocksInCache={10}
                        overlayLoadingTemplate='<span class="ag-overlay-loading-center">Φόρτωση δεδομένων...</span>'
                        overlayNoRowsTemplate='<span class="ag-overlay-no-rows-center">Δεν βρέθηκαν εγγραφές</span>'
                    />
                </div>

                {/* Status Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2 bg-slate-50 border-t text-xs text-slate-600 gap-2">
                    <div className="flex items-center gap-4">
                        <span>
                            Σύνολο Εγγραφών: <strong>{gridTotal}</strong>
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        {lastSync && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span className="hidden sm:inline">Τελευταίος συγχρονισμός:</span>
                                <span className="sm:hidden">Sync:</span>
                                {new Date(lastSync).toLocaleTimeString('el-GR')}
                            </span>
                        )}
                        
                        {gridStatus === 'saving' && (
                            <span className="flex items-center gap-1 font-medium text-blue-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Αποθήκευση...
                            </span>
                        )}
                        
                        {gridStatus === 'saved' && (
                            <span className="flex items-center gap-1 font-medium text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                Αποθηκεύτηκε
                            </span>
                        )}
                        
                        {gridStatus === 'error' && (
                            <span className="flex items-center gap-1 font-medium text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                Σφάλμα
                            </span>
                        )}
                        
                        {gridStatus === 'conflict' && (
                            <span className="flex items-center gap-1 font-medium text-yellow-600">
                                <AlertCircle className="h-4 w-4" />
                                Σύγκρουση
                            </span>
                        )}
                    </div>
                </div>
            </Card>

            {/* Column Picker Dialog for Mobile */}
            {isMobile && (
                <Dialog open={showColumnPicker} onOpenChange={setShowColumnPicker}>
                    <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Επιλογή Στηλών</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                            {getVisibleColumns().map(col => (
                                <div key={col.field} className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-50">
                                    <span className="text-sm">{col.headerName}</span>
                                    <Button
                                        variant={col.hide ? "outline" : "default"}
                                        size="sm"
                                        onClick={() => toggleColumnVisibility(col.field)}
                                        className="h-8"
                                    >
                                        {col.hide ? 'Εμφάνιση' : 'Απόκρυψη'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Conflict Resolution Dialog */}
            <ConflictResolutionDialog
                open={!!conflictDialog}
                onClose={() => setConflictDialog(null)}
                conflict={conflictDialog}
                onReloadLatest={handleReloadLatest}
                onOverwrite={handleOverwrite}
            />

            {/* Custom CSS for saving cells */}
            <style jsx global>{`
                .cell-saving {
                    background-color: #dbeafe !important;
                    border: 1px solid #3b82f6 !important;
                }
                
                .ag-theme-alpine .ag-root-wrapper {
                    border: none;
                }
                
                .ag-theme-alpine .ag-header {
                    background-color: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                }
                
                .ag-theme-alpine .ag-header-cell {
                    font-weight: 600;
                    color: #475569;
                }
                
                .ag-theme-alpine .ag-row-hover {
                    background-color: #f8fafc;
                }
                
                .ag-theme-alpine .ag-row-selected {
                    background-color: #eff6ff;
                }
                
                .ag-overlay-loading-center,
                .ag-overlay-no-rows-center {
                    padding: 20px;
                    color: #64748b;
                }
                
                /* Mobile optimizations */
                @media (max-width: 768px) {
                    .ag-theme-alpine {
                        font-size: 13px;
                    }
                    
                    .ag-theme-alpine .ag-header {
                        font-size: 12px;
                    }
                    
                    .ag-theme-alpine .ag-header-cell {
                        padding: 10px 6px;
                        min-height: 48px;
                    }
                    
                    .ag-theme-alpine .ag-cell {
                        padding: 12px 6px;
                        min-height: 48px;
                        line-height: 1.4;
                    }
                    
                    .ag-theme-alpine .ag-row {
                        min-height: 48px;
                    }
                    
                    /* Better touch targets for editors */
                    .ag-theme-alpine .ag-cell-inline-editing {
                        height: 48px;
                        padding: 8px;
                    }
                    
                    .ag-theme-alpine input[type="text"],
                    .ag-theme-alpine textarea {
                        font-size: 16px;
                        min-height: 44px;
                        padding: 10px;
                    }
                    
                    /* Horizontal scrolling indicator */
                    .ag-theme-alpine .ag-body-horizontal-scroll-viewport {
                        height: 12px;
                    }
                    
                    .ag-theme-alpine .ag-horizontal-left-spacer,
                    .ag-theme-alpine .ag-horizontal-right-spacer {
                        height: 12px;
                    }
                }
            `}</style>
        </div>
    );
}