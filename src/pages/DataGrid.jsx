import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AccessLikeGrid from '../components/datagrid/AccessLikeGrid';
import DataGridToolbar from '../components/datagrid/DataGridToolbar';
import DataGridStatusBar from '../components/datagrid/DataGridStatusBar';
import ConflictResolutionDialog from '../components/datagrid/ConflictResolutionDialog';
import { Card } from "@/components/ui/card";
import { toast } from 'sonner';
import { debounce } from 'lodash';

const GRID_KEY = 'data_grid_person';
const POLL_INTERVAL = 8000; // 8 seconds

export default function DataGrid() {
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [columnFilters, setColumnFilters] = useState({});
    const [sortField, setSortField] = useState('created_date');
    const [sortDirection, setSortDirection] = useState('desc');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [savingCells, setSavingCells] = useState({});
    const [errorCells, setErrorCells] = useState({});
    const [conflictCells, setConflictCells] = useState({});
    const [conflictDialog, setConflictDialog] = useState(null);
    const [lastSync, setLastSync] = useState(null);
    const [gridStatus, setGridStatus] = useState('idle');

    // Grid preferences state
    const [columnOrder, setColumnOrder] = useState([]);
    const [columnSizing, setColumnSizing] = useState({});
    const [columnVisibility, setColumnVisibility] = useState({});

    const queryClient = useQueryClient();

    // Define columns based on Person schema
    const columns = useMemo(() => [
        { id: 'person_id', header: 'ΑΤ (ID)', accessorKey: 'person_id', editable: true, type: 'text' },
        { id: 'first_name', header: 'Όνομα', accessorKey: 'first_name', editable: true, type: 'text' },
        { id: 'last_name', header: 'Επώνυμο', accessorKey: 'last_name', editable: true, type: 'text' },
        { id: 'mobile_phone', header: 'Κινητό', accessorKey: 'mobile_phone', editable: true, type: 'text' },
        { id: 'department', header: 'Τμήμα', accessorKey: 'department', editable: true, type: 'text' },
        { id: 'admission_year', header: 'Έτος Εισδοχής', accessorKey: 'admission_year', editable: true, type: 'text' },
        { id: 'academic_level', header: 'Επίπεδο', accessorKey: 'academic_level', editable: true, type: 'text' },
        { id: 'ucid', header: 'UCID', accessorKey: 'ucid', editable: true, type: 'text' },
        { id: 'contact_person_1', header: 'Άτομο 1', accessorKey: 'contact_person_1', editable: true, type: 'text' },
        { id: 'contact_person_2', header: 'Άτομο 2', accessorKey: 'contact_person_2', editable: true, type: 'text' },
        { id: 'member', header: 'Μέλος', accessorKey: 'member', editable: true, type: 'text' },
        { id: 'prediction_symbol', header: 'Σύμβολο Πρόβλεψης', accessorKey: 'prediction_symbol', editable: true, type: 'text' },
        { id: 'voted', header: 'Ψήφισε', accessorKey: 'voted', editable: true, type: 'boolean', cell: ({ getValue }) => getValue() ? 'Ναι' : 'Όχι' },
        { id: 'notes', header: 'Σημειώσεις', accessorKey: 'notes', editable: true, type: 'text' },
        { id: 'dataset_id', header: 'Dataset ID', accessorKey: 'dataset_id', editable: false, type: 'text' },
        { id: 'created_date', header: 'Δημιουργήθηκε', accessorKey: 'created_date', editable: false, type: 'text', cell: ({ getValue }) => getValue() ? new Date(getValue()).toLocaleString('el-GR') : '-' }
    ], []);

    // Load grid preferences
    const { data: preferences } = useQuery({
        queryKey: ['gridPreferences', GRID_KEY],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('gridPreferencesLoad', { grid_key: GRID_KEY });
            return data.preference;
        }
    });

    useEffect(() => {
        if (preferences?.state_json) {
            const state = preferences.state_json;
            if (state.columnOrder) setColumnOrder(state.columnOrder);
            if (state.columnSizing) setColumnSizing(state.columnSizing);
            if (state.columnVisibility) setColumnVisibility(state.columnVisibility);
        }
    }, [preferences]);

    // Save grid preferences (debounced)
    const savePreferences = useMemo(
        () => debounce(async (state) => {
            try {
                await base44.functions.invoke('gridPreferencesSave', {
                    grid_key: GRID_KEY,
                    state_json: state
                });
            } catch (error) {
                console.error('Failed to save preferences:', error);
            }
        }, 1000),
        []
    );

    useEffect(() => {
        if (columnOrder.length > 0 || Object.keys(columnSizing).length > 0 || Object.keys(columnVisibility).length > 0) {
            savePreferences({
                columnOrder,
                columnSizing,
                columnVisibility
            });
        }
    }, [columnOrder, columnSizing, columnVisibility, savePreferences]);

    // Fetch data
    const { data: gridData, isLoading, refetch } = useQuery({
        queryKey: ['personGrid', page, pageSize, sortField, sortDirection, searchQuery, columnFilters],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                sortField,
                sortDirection,
                search: searchQuery,
                filters: JSON.stringify(columnFilters)
            });

            const { data } = await base44.functions.invoke('personGridFetch', {}, `?${params}`);
            setLastSync(new Date().toISOString());
            return data;
        },
        refetchInterval: POLL_INTERVAL
    });

    // Polling for changes
    useEffect(() => {
        if (!lastSync) return;

        const checkChanges = async () => {
            try {
                const { data } = await base44.functions.invoke('personGridGetChanges', {}, `?since=${lastSync}`);
                if (data.changes && data.changes.length > 0) {
                    // Soft refresh changed rows
                    queryClient.invalidateQueries(['personGrid']);
                }
            } catch (error) {
                console.error('Failed to check changes:', error);
            }
        };

        const interval = setInterval(checkChanges, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [lastSync, queryClient]);

    // Cell edit mutation
    const cellEditMutation = useMutation({
        mutationFn: async ({ person_id, field, value, expected_row_version }) => {
            const { data } = await base44.functions.invoke('personGridUpdateCell', {
                person_id,
                field,
                value,
                expected_row_version
            });
            return data;
        },
        onMutate: async ({ person_id, field }) => {
            const cellKey = `${person_id}_${field}`;
            setSavingCells(prev => ({ ...prev, [cellKey]: true }));
            setGridStatus('saving');
        },
        onSuccess: (data, variables) => {
            const cellKey = `${variables.person_id}_${variables.field}`;
            setSavingCells(prev => {
                const next = { ...prev };
                delete next[cellKey];
                return next;
            });
            setErrorCells(prev => {
                const next = { ...prev };
                delete next[cellKey];
                return next;
            });
            setConflictCells(prev => {
                const next = { ...prev };
                delete next[cellKey];
                return next;
            });
            setGridStatus('saved');
            setTimeout(() => setGridStatus('idle'), 2000);
            queryClient.invalidateQueries(['personGrid']);
        },
        onError: (error, variables) => {
            const cellKey = `${variables.person_id}_${variables.field}`;
            setSavingCells(prev => {
                const next = { ...prev };
                delete next[cellKey];
                return next;
            });

            if (error.response?.status === 409) {
                // Conflict
                setConflictCells(prev => ({ ...prev, [cellKey]: true }));
                setGridStatus('conflict');
                const conflictData = error.response.data;
                setConflictDialog({
                    personId: variables.person_id,
                    field: variables.field,
                    yourValue: variables.value,
                    currentValue: conflictData.current_row?.[variables.field],
                    currentRow: conflictData.current_row
                });
            } else {
                setErrorCells(prev => ({ ...prev, [cellKey]: true }));
                setGridStatus('error');
                toast.error(error.response?.data?.error || 'Σφάλμα αποθήκευσης');
            }
        }
    });

    const handleCellCommit = (personId, field, value, rowVersion) => {
        cellEditMutation.mutate({
            person_id: personId,
            field,
            value,
            expected_row_version: rowVersion
        });
    };

    const handleReloadLatest = () => {
        setConflictDialog(null);
        queryClient.invalidateQueries(['personGrid']);
        setConflictCells({});
        setGridStatus('idle');
    };

    const handleOverwrite = () => {
        if (!conflictDialog) return;
        const { personId, field, yourValue, currentRow } = conflictDialog;
        
        // Force update with current version
        cellEditMutation.mutate({
            person_id: personId,
            field,
            value: yourValue,
            expected_row_version: currentRow.row_version
        });
        
        setConflictDialog(null);
    };

    const handleExport = () => {
        if (!gridData?.data) return;

        const csvData = [
            columns.map(col => col.header).join(','),
            ...gridData.data.map(row => 
                columns.map(col => {
                    const value = row[col.accessorKey];
                    if (value === null || value === undefined) return '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `person_data_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        toast.success('Τα δεδομένα εξήχθησαν επιτυχώς');
    };

    const handleResetLayout = async () => {
        try {
            await base44.functions.invoke('gridPreferencesReset', { grid_key: GRID_KEY });
            setColumnOrder([]);
            setColumnSizing({});
            setColumnVisibility({});
            queryClient.invalidateQueries(['gridPreferences']);
            toast.success('Το layout επαναφέρθηκε');
        } catch (error) {
            toast.error('Σφάλμα επαναφοράς layout');
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <DataGridToolbar
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    showFilters={showFilters}
                    onToggleFilters={() => setShowFilters(!showFilters)}
                    onExport={handleExport}
                    onRefresh={() => refetch()}
                    onResetLayout={handleResetLayout}
                    canCreate={false}
                />

                <AccessLikeGrid
                    data={gridData?.data || []}
                    columns={columns}
                    onCellCommit={handleCellCommit}
                    loading={isLoading}
                    rowKeyField="id"
                    savingCells={savingCells}
                    errorCells={errorCells}
                    conflictCells={conflictCells}
                    columnOrder={columnOrder}
                    columnSizing={columnSizing}
                    columnVisibility={columnVisibility}
                    onColumnOrderChange={setColumnOrder}
                    onColumnSizingChange={setColumnSizing}
                    onColumnVisibilityChange={setColumnVisibility}
                />

                <DataGridStatusBar
                    totalRows={gridData?.total || 0}
                    loadedRows={gridData?.data?.length || 0}
                    status={gridStatus}
                    lastSync={lastSync}
                />
            </Card>

            <ConflictResolutionDialog
                open={!!conflictDialog}
                onClose={() => setConflictDialog(null)}
                conflict={conflictDialog}
                onReloadLatest={handleReloadLatest}
                onOverwrite={handleOverwrite}
            />
        </div>
    );
}