import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter } from 'lucide-react';
import { ColumnFilterPanel } from '@/components/datagrid/ColumnFilterPopover';

// Shared AG-Grid header used by BOTH the live Records grid and the scratch
// tables grid. Sorting + an Excel-style set-filter, identical everywhere.
//
// Everything table-specific comes from params.context:
//   columns            [{ key, label }]  — column list for the label + filter button
//   filterModel        current set-filter model, keyed by colId
//   onFilterChange     (nextModel) => void
//   partition          filter-values partition (live uses it; scratch passes 'all')
//   filterEndpoint     Edge Function for distinct values (defaults to live)
//   filterExtraParams  extra params for that function (e.g. { scratchDatasetId })
export default function GridColumnHeader(params) {
  const { displayName, column, api } = params;
  const colId = column.getColId();
  const columns = params.context?.columns || [];
  const filterModel = params.context?.filterModel || {};
  const onFilterChange = params.context?.onFilterChange;
  const partition = params.context?.partition || 'all';
  const filterEndpoint = params.context?.filterEndpoint;
  const filterExtraParams = params.context?.filterExtraParams;

  const [sortDir, setSortDir] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const isFiltered = !!(filterModel[colId] &&
    (filterModel[colId].values?.length > 0 || filterModel[colId].includeBlanks));

  // Sync sort from grid state
  useEffect(() => {
    const onSort = () => {
      const state = api.getColumnState();
      const col = state.find(c => c.colId === colId);
      setSortDir(col?.sort || null);
    };
    api.addEventListener('sortChanged', onSort);
    onSort();
    return () => { try { api.removeEventListener('sortChanged', onSort); } catch (_) {} };
  }, [api, colId]);

  const handleSort = useCallback(() => {
    const next = sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc';
    api.applyColumnState({ state: [{ colId, sort: next }], defaultState: { sort: null } });
  }, [api, colId, sortDir]);

  const openFilter = useCallback((e) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPanelPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setFilterOpen(true);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!filterOpen) return;
    const onMouseDown = (e) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target)) setFilterOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const col = columns.find(c => c.key === colId);

  return (
    <div className="flex items-center w-full overflow-hidden gap-1">
      <button
        onClick={handleSort}
        className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden text-left font-medium text-xs"
      >
        <span className="truncate">{displayName}</span>
        {sortDir === 'asc' && <span className="text-blue-600 flex-shrink-0">▲</span>}
        {sortDir === 'desc' && <span className="text-blue-600 flex-shrink-0">▼</span>}
      </button>
      {col && (
        <button
          ref={btnRef}
          onClick={openFilter}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${isFiltered ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}
          title={`Φίλτρο: ${displayName}`}
        >
          <Filter className="h-3 w-3" fill={isFiltered ? 'currentColor' : 'none'} />
        </button>
      )}
      {filterOpen && col && createPortal(
        <div
          ref={panelRef}
          data-column-filter-panel="true"
          style={{
            position: 'absolute',
            top: panelPos.top,
            left: panelPos.left,
            zIndex: 9999,
            minWidth: 256,
          }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3"
        >
          <ColumnFilterPanel
            columnKey={colId}
            columnLabel={col.label}
            partition={partition}
            endpoint={filterEndpoint}
            extraParams={filterExtraParams}
            currentModel={filterModel[colId]}
            onApply={(model) => {
              const next = { ...filterModel };
              if (model) next[colId] = model;
              else delete next[colId];
              onFilterChange?.(next);
            }}
            onClose={() => setFilterOpen(false)}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
