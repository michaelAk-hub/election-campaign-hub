import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from 'sonner';
import { debounce } from 'lodash';
import ConflictResolutionDialog from '../components/datagrid/ConflictResolutionDialog';
import {
    Search,
    Filter,
    Download,
    RefreshCw,
    RotateCcw,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Clock
} from 'lucide-react';

const GRID_KEY = 'data_grid_person';
const POLL_INTERVAL = 8000;

export default function DataGrid() {
    const gridRef = useRef();
    const queryClient = useQueryClient();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(true);
    const [lastSync, setLastSync] = useState(null);
    const [gridStatus, setGridStatus] = useState('idle');
    const [rowData, setRowData] = useState([]);
    const [conflictDialog, setConflictDialog] = useState(null);
    const [savingCells, setSavingCells] = useState(new Set());
    const [activeFilters, setActiveFilters] = useState({});

    // Custom set filter component for Access-like behavior
    const AccessLikeSetFilter = React.forwardRef((props, ref) => {
        const [filterValues, setFilterValues] = React.useState([]);
        const [distinctValues, setDistinctValues] = React.useState([]);
        const [hasBlanks, setHasBlanks] = React.useState(false);
        const [loading, setLoading] = React.useState(true);

        React.useImperativeHandle(ref, () => ({
            isFilterActive: () => {
                return filterValues.length > 0;
            },
            doesFilterPass: (params) => {
                if (filterValues.length === 0) return true;
                
                const value = params.data[props.colDef.field];
                
                for (const filterValue of filterValues) {
                    if (filterValue === '__BLANKS__') {
                        if (value === null || value === undefined || value === '') {
                            return true;
                        }
                    } else {
                        if (value === filterValue) {
                            return true;
                        }
                    }
                }
                return false;
            },
            getModel: () => {
                if (filterValues.length === 0) return null;
                return { values: filterValues };
            },
            setModel: (model) => {
                setFilterValues(model?.values || []);
            }
        }));

        React.useEffect(() => {
            loadDistinctValues();
        }, [activeFilters]);

        const loadDistinctValues = async () => {
            setLoading(true);
            try {
                const { data } = await base44.functions.invoke('personGridGetDistinct', {
                    columnName: props.colDef.field,
                    activeFilters: { ...activeFilters }
                });
                setDistinctValues(data.values || []);
                setHasBlanks(data.hasBlanks || false);
            } catch (error) {
                console.error('Failed to load distinct values:', error);
            } finally {
                setLoading(false);
            }
        };

        const handleApply = () => {
            const newFilters = { ...activeFilters };
            if (filterValues.length === 0) {
                delete newFilters[props.colDef.field];
            } else {
                newFilters[props.colDef.field] = filterValues;
            }
            setActiveFilters(newFilters);
            props.filterChangedCallback();
        };

        const handleSelectAll = () => {
            setFilterValues([]);
            handleApply();
        };

        const handleClearAll = () => {
            setFilterValues([]);
            handleApply();
        };

        const toggleValue = (value) => {
            setFilterValues(prev => 
                prev.includes(value) 
                    ? prev.filter(v => v !== value)
                    : [...prev, value]
            );
        };

        const isAllSelected = filterValues.length === 0;

        return (
            <div style={{ padding: '8px', width: '200px', maxHeight: '400px', overflow: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>Φόρτωση...</div>
                ) : (
                    <>
                        <div style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                    style={{ marginRight: '8px' }}
                                />
                                <strong>(Select All)</strong>
                            </label>
                        </div>

                        {hasBlanks && (
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={filterValues.includes('__BLANKS__')}
                                    onChange={() => toggleValue('__BLANKS__')}
                                    style={{ marginRight: '8px' }}
                                />
                                <em>(Blanks)</em>
                            </label>
                        )}

                        {distinctValues.map(value => (
                            <label key={value} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllSelected || filterValues.includes(value)}
                                    onChange={() => toggleValue(value)}
                                    style={{ marginRight: '8px' }}
                                />
                                {String(value)}
                            </label>
                        ))}

                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '4px' }}>
                            <button
                                onClick={handleApply}
                                style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Apply
                            </button>
                            <button
                                onClick={handleClearAll}
                                style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    backgroundColor: '#e2e8f0',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    });

    // Load grid preferences
    const { data: preferences } = useQuery({
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
            filter: AccessLikeSetFilter,
            pinned: 'left',
            width: 120
        },
        {
            field: 'first_name',
            headerName: 'Όνομα',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 150
        },
        {
            field: 'last_name',
            headerName: 'Επώνυμο',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 150
        },
        {
            field: 'mobile_phone',
            headerName: 'Κινητό',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 140
        },
        {
            field: 'department',
            headerName: 'Τμήμα',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 200
        },
        {
            field: 'admission_year',
            headerName: 'Έτος Εισδοχής',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 140
        },
        {
            field: 'academic_level',
            headerName: 'Επίπεδο',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 150
        },
        {
            field: 'ucid',
            headerName: 'UCID',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 120
        },
        {
            field: 'contact_person_1',
            headerName: 'Άτομο 1',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 150
        },
        {
            field: 'contact_person_2',
            headerName: 'Άτομο 2',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 150
        },
        {
            field: 'member',
            headerName: 'Μέλος',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 120
        },
        {
            field: 'prediction_symbol',
            headerName: 'Σύμβολο Πρόβλεψης',
            editable: true,
            filter: AccessLikeSetFilter,
            width: 160
        },
        {
            field: 'voted',
            headerName: 'Ψήφισε',
            editable: true,
            filter: AccessLikeSetFilter,
            cellRenderer: (params) => params.value ? 'Ναι' : 'Όχι',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: [true, false],
                valueListGap: 0,
                formatValue: (value) => value ? 'Ναι' : 'Όχι'
            },
            width: 100
        },
        {
            field: 'notes',
            headerName: 'Σημειώσεις',
            editable: true,
            filter: AccessLikeSetFilter,
            cellEditor: 'agLargeTextCellEditor',
            width: 200
        },
        {
            field: 'dataset_id',
            headerName: 'Dataset ID',
            editable: false,
            filter: AccessLikeSetFilter,
            width: 150,
            cellStyle: { backgroundColor: '#f8fafc', color: '#64748b' }
        },
        {
            field: 'created_date',
            headerName: 'Δημιουργήθηκε',
            editable: false,
            filter: 'agDateColumnFilter',
            filterParams: {
                comparator: (filterDate, cellValue) => {
                    if (!cellValue) return -1;
                    const cellDate = new Date(cellValue);
                    cellDate.setHours(0, 0, 0, 0);
                    if (cellDate < filterDate) return -1;
                    if (cellDate > filterDate) return 1;
                    return 0;
                }
            },
            valueFormatter: (params) => {
                if (!params.value) return '-';
                return new Date(params.value).toLocaleString('el-GR');
            },
            width: 180,
            cellStyle: { backgroundColor: '#f8fafc', color: '#64748b' }
        }
    ], []);

    // Default grid options
    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        filter: true,
        floatingFilter: showFilters,
        editable: false,
        singleClickEdit: false
    }), [showFilters]);

    // Fetch data
    const { data: gridData, isLoading, refetch } = useQuery({
        queryKey: ['personGrid', searchQuery, activeFilters],
        queryFn: async () => {
            const params = {
                page: 1,
                pageSize: 10000,
                sortField: 'created_date',
                sortDirection: 'desc',
                search: searchQuery,
                filters: JSON.stringify(activeFilters)
            };

            const { data } = await base44.functions.invoke('personGridFetch', params);
            setLastSync(new Date().toISOString());
            return data;
        },
        refetchInterval: POLL_INTERVAL
    });

    // Update row data when grid data changes
    useEffect(() => {
        if (gridData?.data) {
            setRowData(gridData.data);
        }
    }, [gridData]);

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
            
            // Update the row data with new version
            if (data.data) {
                setRowData(prevData => 
                    prevData.map(row => 
                        row.id === variables.id 
                            ? { ...row, ...data.data }
                            : row
                    )
                );
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

    // Apply grid preferences
    useEffect(() => {
        if (preferences?.state_json && gridRef.current) {
            const api = gridRef.current.api;
            const state = preferences.state_json;
            
            if (state.columnState) {
                api.applyColumnState({ state: state.columnState, applyOrder: true });
            }
        }
    }, [preferences]);

    // Save grid preferences (debounced)
    const savePreferences = useMemo(
        () => debounce(async (api) => {
            try {
                const columnState = api.getColumnState();
                await base44.functions.invoke('gridPreferencesSave', {
                    grid_key: GRID_KEY,
                    state_json: { columnState }
                });
            } catch (error) {
                console.error('Failed to save preferences:', error);
            }
        }, 1000),
        []
    );

    // Grid events
    const onColumnMoved = useCallback(() => {
        if (gridRef.current) {
            savePreferences(gridRef.current.api);
        }
    }, [savePreferences]);

    const onColumnResized = useCallback(() => {
        if (gridRef.current) {
            savePreferences(gridRef.current.api);
        }
    }, [savePreferences]);

    const onColumnVisible = useCallback(() => {
        if (gridRef.current) {
            savePreferences(gridRef.current.api);
        }
    }, [savePreferences]);

    // Export to CSV
    const handleExport = useCallback(() => {
        if (gridRef.current) {
            gridRef.current.api.exportDataAsCsv({
                fileName: `person_data_${new Date().toISOString().split('T')[0]}.csv`
            });
            toast.success('Τα δεδομένα εξήχθησαν επιτυχώς');
        }
    }, []);

    // Reset layout
    const handleResetLayout = async () => {
        try {
            await base44.functions.invoke('gridPreferencesReset', { grid_key: GRID_KEY });
            queryClient.invalidateQueries(['gridPreferences']);
            if (gridRef.current) {
                gridRef.current.api.resetColumnState();
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

    return (
        <div className="space-y-4">
            <Card>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-white border-b">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Αναζήτηση σε όλα τα πεδία..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    
                    <Button
                        variant={showFilters ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter className="h-4 w-4 mr-2" />
                        Φίλτρα
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Ανανέωση
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleResetLayout}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset Layout
                    </Button>
                </div>

                {/* AG Grid */}
                <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        onCellValueChanged={onCellValueChanged}
                        onColumnMoved={onColumnMoved}
                        onColumnResized={onColumnResized}
                        onColumnVisible={onColumnVisible}
                        animateRows={true}
                        rowSelection="multiple"
                        enableRangeSelection={true}
                        suppressMovableColumns={false}
                        enableCellChangeFlash={true}
                        stopEditingWhenCellsLoseFocus={true}
                        singleClickEdit={false}
                        enterNavigatesVertically={true}
                        enterNavigatesVerticallyAfterEdit={true}
                        undoRedoCellEditing={true}
                        undoRedoCellEditingLimit={20}
                        enableFillHandle={true}
                        fillHandleDirection="y"
                        getRowId={(params) => params.data.id}
                        loading={isLoading}
                        overlayLoadingTemplate='<span class="ag-overlay-loading-center">Φόρτωση δεδομένων...</span>'
                        overlayNoRowsTemplate='<span class="ag-overlay-no-rows-center">Δεν βρέθηκαν εγγραφές</span>'
                    />
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t text-xs text-slate-600">
                    <div className="flex items-center gap-4">
                        <span>
                            Εγγραφές: <strong>{rowData.length}</strong> / {gridData?.total || 0}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {lastSync && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleTimeString('el-GR')}
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
            `}</style>
        </div>
    );
}