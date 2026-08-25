import React, { useMemo, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { base44 } from '@/api/base44Client';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz;

const defaultColDef = {
  resizable: true,
  sortable: false,
  filter: false,
  suppressMovable: false,
  minWidth: 80,
};

export default function RecordsAgGrid({
  activeDatasetId,
  partition,
  serverSearchTerm,
  filterModel,
  sortModel,
  columnDefs,
  context,
  onCellValueChanged,
  onSortModelChange,
  onColumnOrderChange,
  onRowDoubleClick,
  gridRef,
  height = '70vh',
}) {
  const datasource = useMemo(() => {
    if (!activeDatasetId) return null;
    return {
      getRows: async (params) => {
        try {
          const { data } = await base44.functions.invoke('personGridFetch', {
            session_token: localStorage.getItem('app_session_token'),
            datasetId: activeDatasetId,
            partition,
            startRow: params.startRow,
            endRow: params.endRow,
            sortField: sortModel?.field || 'created_date',
            sortDirection: sortModel?.dir || 'desc',
            filters: filterModel && Object.keys(filterModel).length > 0 ? filterModel : null,
            search: serverSearchTerm || undefined,
          });
          const rows = data?.rows ?? [];
          const lastRow = data?.lastRow ?? -1;
          params.successCallback(rows, lastRow >= 0 ? lastRow : undefined);
        } catch (err) {
          console.error('[RecordsAgGrid] getRows error:', err);
          params.failCallback();
        }
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatasetId, partition, serverSearchTerm, JSON.stringify(filterModel), JSON.stringify(sortModel)]);

  // Reinstall datasource whenever it changes
  useEffect(() => {
    const api = gridRef?.current?.api;
    if (!api || !datasource) return;
    api.setGridOption('datasource', datasource);
    api.purgeInfiniteCache();
  }, [datasource, gridRef]);

  const onGridReady = useCallback((params) => {
    if (datasource) {
      params.api.setGridOption('datasource', datasource);
    }
  }, [datasource]);

  const getRowId = useCallback((params) => params.data?.id, []);

  const onSortChanged = useCallback((params) => {
    const colState = params.api.getColumnState();
    const sorted = colState.find(c => c.sort);
    if (sorted) {
      onSortModelChange?.(sorted.colId, sorted.sort);
    }
  }, [onSortModelChange]);

  const onDragStopped = useCallback((params) => {
    const colState = params.api.getColumnState();
    const order = colState
      .filter(c => !c.hide)
      .map(c => c.colId);
    onColumnOrderChange?.(order);
  }, [onColumnOrderChange]);

  return (
    <div style={{ height, width: '100%' }}>
      <AgGridReact
        ref={gridRef}
        theme={theme}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowModelType="infinite"
        cacheBlockSize={500}
        maxBlocksInCache={10}
        rowHeight={32}
        headerHeight={36}
        getRowId={getRowId}
        context={context}
        onGridReady={onGridReady}
        onCellValueChanged={onCellValueChanged}
        onSortChanged={onSortChanged}
        onDragStopped={onDragStopped}
        onRowDoubleClicked={onRowDoubleClick}
        enableCellEditingOnBackspace={true}
        stopEditingWhenCellsLoseFocus={true}
        suppressDragLeaveHidesColumns={true}
      />
    </div>
  );
}