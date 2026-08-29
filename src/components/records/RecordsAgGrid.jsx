import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { base44 } from '@/api/base44Client';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz;

// Grid sizing — the body is sized to show a fixed number of rows.
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 33;
const VISIBLE_ROWS = 21;
const HSCROLL = 15; // room for the horizontal scrollbar so it doesn't eat a row
// Height of the AG-Grid element itself (header + 23 rows + horizontal scrollbar).
const GRID_BODY_HEIGHT = HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT + HSCROLL;

const defaultColDef = {
  resizable: true,
  sortable: false,
  filter: false,
  suppressMovable: false,
  minWidth: 80,
};

// Excel-style multi-cell/column range selection and a sum-of-selection status
// bar are AG Grid Enterprise (paid) features. In the free Community edition we
// give the closest equivalent: click + ctrl/shift row multi-select with a live
// selected-count, plus an MS-Access-style total row-count footer bottom-left.
const rowSelection = { mode: 'multiRow', checkboxes: false, headerCheckbox: false, enableClickSelection: true };

export default function RecordsAgGrid({
  activeDatasetId,
  scratchDatasetId,   // when set, the grid reads a scratch table instead of the live roll
  partition,
  serverSearchTerm,
  filterModel,
  sortModel,
  columnDefs,
  context,
  onCellValueChanged,
  onSortModelChange,
  onColumnOrderChange,
  onFilterModelChange,
  onRowDoubleClick,
  gridRef,
  height = '70vh',
}) {
  const [totalCount, setTotalCount] = useState(null);
  const [selectedCount, setSelectedCount] = useState(0);

  const isScratch = !!scratchDatasetId;
  const sourceId = isScratch ? scratchDatasetId : activeDatasetId;

  const datasource = useMemo(() => {
    if (!sourceId) return null;
    return {
      getRows: async (params) => {
        try {
          const fn = isScratch ? 'scratchGridFetch' : 'personGridFetch';
          const idParams = isScratch ? { scratchDatasetId } : { datasetId: activeDatasetId };
          const { data } = await base44.functions.invoke(fn, {
            session_token: localStorage.getItem('app_session_token'),
            ...idParams,
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
          if (typeof data?.total === 'number') setTotalCount(data.total);
          params.successCallback(rows, lastRow >= 0 ? lastRow : undefined);
        } catch (err) {
          console.error('[RecordsAgGrid] getRows error:', err);
          params.failCallback();
        }
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatasetId, scratchDatasetId, partition, serverSearchTerm, JSON.stringify(filterModel), JSON.stringify(sortModel)]);

  // Reinstall datasource whenever it changes
  useEffect(() => {
    const api = gridRef?.current?.api;
    if (!api || !datasource) return;
    api.setGridOption('datasource', datasource);
    api.purgeInfiniteCache();
    setSelectedCount(0);
  }, [datasource, gridRef]);

  const onGridReady = useCallback((params) => {
    if (datasource) {
      params.api.setGridOption('datasource', datasource);
    }
  }, [datasource]);

  const getRowId = useCallback((params) => params.data?.id, []);

  const onSelectionChanged = useCallback((params) => {
    setSelectedCount(params.api.getSelectedRows().length);
  }, []);

  const onSortChanged = useCallback((params) => {
    const colState = params.api.getColumnState();
    const sorted = colState.find(c => c.sort);
    if (sorted) {
      onSortModelChange?.(sorted.colId, sorted.sort);
    } else {
      onSortModelChange?.('created_date', 'desc'); // sort cleared → default
    }
  }, [onSortModelChange]);

  // AG built-in column filters (used by the scratch grid) → push the model up so
  // the datasource re-fetches. Harmless for the live grid (its columns set
  // filter:false, so AG never produces a filter model here).
  const onFilterChanged = useCallback((params) => {
    onFilterModelChange?.(params.api.getFilterModel() || {});
  }, [onFilterModelChange]);

  const onDragStopped = useCallback((params) => {
    const colState = params.api.getColumnState();
    const order = colState
      .filter(c => !c.hide)
      .map(c => c.colId);
    onColumnOrderChange?.(order);
  }, [onColumnOrderChange]);

  return (
    <div style={{ width: '100%' }} className="flex flex-col">
      <div style={{ height: GRID_BODY_HEIGHT, width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          theme={theme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowModelType="infinite"
          cacheBlockSize={500}
          maxBlocksInCache={10}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          getRowId={getRowId}
          context={context}
          rowSelection={rowSelection}
          onGridReady={onGridReady}
          onCellValueChanged={onCellValueChanged}
          onSelectionChanged={onSelectionChanged}
          onSortChanged={onSortChanged}
          onFilterChanged={onFilterChanged}
          onDragStopped={onDragStopped}
          onRowDoubleClicked={onRowDoubleClick}
          enableCellEditingOnBackspace={true}
          stopEditingWhenCellsLoseFocus={true}
          suppressDragLeaveHidesColumns={true}
        />
      </div>
      {/* MS-Access-style status footer: total row count bottom-left, selection right. */}
      <div className="flex items-center justify-between gap-4 px-3 py-1 text-xs border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 select-none">
        <span>
          Σύνολο:{' '}
          <strong className="text-slate-900 dark:text-slate-100">
            {totalCount == null ? '…' : totalCount.toLocaleString('el-GR')}
          </strong>{' '}
          εγγραφές
        </span>
        {selectedCount > 0 && (
          <span className="text-blue-600 dark:text-blue-400">
            {selectedCount.toLocaleString('el-GR')} επιλεγμένες
          </span>
        )}
      </div>
    </div>
  );
}
