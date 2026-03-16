import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown, X, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import ColumnFilterPopover from '@/components/datagrid/ColumnFilterPopover';

export default function DataGrid({
  data = [],
  columns = [],
  onRowClick,
  pageSize = 20,
  searchable = true,
  filterable = true,
  sortable = true,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  actions,
  bulkActions,
  emptyMessage = "Δεν βρέθηκαν εγγραφές",
  className,
  // infinite scroll
  mode = 'paged', // 'paged' | 'infinite'
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  height,
  // inline edit
  editable = false,
  onCellUpdate, // async ({ row, key, value }) => Promise<void>
  fetchLatestRow, // async (rowId) => Promise<row>
  onRowRefreshed, // (id, newRowData) => void
  // column reordering
  columnOrder,
  onColumnOrderChange,
  // ── SERVER FILTERING ────────────────────────────────────────────────────
  // When true: local per-column filtering is disabled; sort changes propagate to parent
  serverFiltering = false,
  filterModel = {},          // controlled: { [colKey]: { filterType:'set', values:[], includeBlanks:bool } }
  onFilterModelChange,       // (newFilterModel) => void
  sortModel = null,          // controlled: { field: string, dir: 'asc'|'desc' } | null
  onSortModelChange,         // (field, dir) => void
  partition = 'all',         // passed through to ColumnFilterPopover for filter-value loading
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  // Local sort state — only used when serverFiltering is false
  const [localSortField, setLocalSortField] = useState(null);
  const [localSortDir, setLocalSortDir] = useState('asc');

  const [editing, setEditing] = useState(null); // { rowId, key }
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(null); // { rowId, key }
  const [loadingEditCell, setLoadingEditCell] = useState(null); // { rowId, key }

  // keyboard navigation
  const [focusedCell, setFocusedCell] = useState(null); // { rowIndex, colIndex }
  const cellRefs = useRef(new Map());
  const scrollContainerRef = useRef(null);

  // Derived: which sort field / dir to show in column headers
  const activeSortField = serverFiltering ? sortModel?.field : localSortField;
  const activeSortDir   = serverFiltering ? sortModel?.dir   : localSortDir;

  // Apply column order — preserves original positions of non-reorderable columns
  const orderedColumns = useMemo(() => {
    if (!columnOrder || columnOrder.length === 0) return columns;
    const reorderableMap = new Map(columns.filter(c => c.reorderable).map(c => [c.key, c]));
    // Build ordered list of reorderable columns respecting columnOrder, then append any not yet in order
    const ordered = columnOrder.map(k => reorderableMap.get(k)).filter(Boolean);
    reorderableMap.forEach((col, k) => { if (!columnOrder.includes(k)) ordered.push(col); });

    // Merge: walk original column array, substitute reorderable slots with ordered reorderable columns
    const reorderableQueue = [...ordered];
    return columns.map(col => {
      if (!col.reorderable) return col;
      return reorderableQueue.shift() ?? col;
    });
  }, [columns, columnOrder]);

  const navColumns = useMemo(() => orderedColumns, [orderedColumns]);

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const reorderableKeys = columns.filter(c => c.reorderable).map(c => c.key);
    const currentOrder = columnOrder && columnOrder.length > 0
      ? columnOrder.filter(k => reorderableKeys.includes(k))
      : [...reorderableKeys];
    reorderableKeys.forEach(k => { if (!currentOrder.includes(k)) currentOrder.push(k); });
    const newOrder = [...currentOrder];
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    onColumnOrderChange?.(newOrder);
  }, [columns, columnOrder, onColumnOrderChange]);

  // displayData:
  //   - serverFiltering=true  → data is already backend-filtered/sorted; only apply local search
  //   - serverFiltering=false → apply local search + local sort (no per-column filter — filters panel removed)
  const displayData = useMemo(() => {
    let result = [...data];

    if (searchable && search) {
      const lower = search.toLowerCase();
      result = result.filter(row =>
        orderedColumns.some(col => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(lower);
        })
      );
    }

    // Local sort only when not in server mode
    if (!serverFiltering && localSortField) {
      result.sort((a, b) => {
        const aVal = a[localSortField];
        const bVal = b[localSortField];
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        let cmp;
        if (aVal != null && bVal != null && !Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), 'el', { numeric: true, sensitivity: 'base' });
        }
        return localSortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [data, searchable, search, serverFiltering, localSortField, localSortDir, orderedColumns]);

  useEffect(() => {
    if (mode !== 'paged') return;
    const pc = Math.ceil(displayData.length / pageSize);
    if (page > 0 && page >= pc) setPage(0);
  }, [displayData.length, pageSize, mode]);

  useEffect(() => {
    setFocusedCell(null);
  }, [page, search, localSortField, localSortDir]);

  const pageCount = Math.ceil(displayData.length / pageSize);
  const pagedData = displayData.slice(page * pageSize, (page + 1) * pageSize);
  const visibleData = mode === 'paged' ? pagedData : displayData;

  const handleSort = useCallback((field) => {
    if (serverFiltering) {
      if (!onSortModelChange) return;
      const currentDir = sortModel?.field === field ? sortModel.dir : 'asc';
      const newDir = sortModel?.field === field ? (currentDir === 'asc' ? 'desc' : 'asc') : 'asc';
      onSortModelChange(field, newDir);
    } else {
      if (localSortField === field) setLocalSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setLocalSortField(field); setLocalSortDir('asc'); }
    }
  }, [serverFiltering, onSortModelChange, sortModel, localSortField]);

  // Server filter: update a single column's model and propagate to parent
  const handleColumnFilterChange = useCallback((colKey, model) => {
    if (!onFilterModelChange) return;
    const next = { ...filterModel };
    if (model == null) {
      delete next[colKey];
    } else {
      next[colKey] = model;
    }
    onFilterModelChange(next);
  }, [filterModel, onFilterModelChange]);

  const handleClearAllFilters = useCallback(() => {
    if (serverFiltering) {
      onFilterModelChange?.({});
    }
  }, [serverFiltering, onFilterModelChange]);

  const activeFilterCount = Object.keys(filterModel || {}).length;

  // --- Focus helpers ---
  const focusCell = useCallback((rowIndex, colIndex) => {
    const key = `${rowIndex}-${colIndex}`;
    const el = cellRefs.current.get(key);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    setFocusedCell({ rowIndex, colIndex });
  }, []);

  const moveFocus = useCallback((rowDelta, colDelta) => {
    if (!focusedCell) return;
    const { rowIndex, colIndex } = focusedCell;
    const nextRow = Math.max(0, Math.min(visibleData.length - 1, rowIndex + rowDelta));
    const nextCol = Math.max(0, Math.min(navColumns.length - 1, colIndex + colDelta));
    focusCell(nextRow, nextCol);
  }, [focusedCell, visibleData.length, navColumns.length, focusCell]);

  // --- Edit helpers ---
  const startEdit = async (row, col, rowIndex, colIndex) => {
    if (!editable || !col.editable || col.type === 'boolean') return;
    if (loadingEditCell) return;
    setFocusedCell({ rowIndex, colIndex });
    if (fetchLatestRow) {
      setLoadingEditCell({ rowId: row.id, key: col.key });
      try {
        const latestRow = await fetchLatestRow(row.id);
        if (!latestRow) {
          toast.error('Η εγγραφή δεν βρέθηκε ή έχει διαγραφεί.');
          return;
        }
        onRowRefreshed?.(row.id, latestRow);
        setDraft(String(latestRow[col.key] ?? ''));
        setEditing({ rowId: row.id, key: col.key });
      } catch {
        toast.error('Αδυναμία φόρτωσης τελευταίας έκδοσης εγγραφής.');
      } finally {
        setLoadingEditCell(null);
      }
    } else {
      setEditing({ rowId: row.id, key: col.key });
      setDraft(String(row[col.key] ?? ''));
    }
  };

  const commitEdit = useCallback(async (restoreRowIndex, restoreColIndex) => {
    if (!editing) return;
    const { rowId, key } = editing;
    const row = data.find(r => r.id === rowId);
    const shouldSave = row && String(row[key] ?? '') !== String(draft ?? '') && onCellUpdate;
    setEditing(null);
    if (shouldSave) {
      try {
        setSaving({ rowId, key });
        await onCellUpdate({ row, key, value: draft });
      } finally {
        setSaving(null);
      }
    }
    if (restoreRowIndex != null && restoreColIndex != null) {
      setTimeout(() => focusCell(restoreRowIndex, restoreColIndex), 0);
    }
  }, [editing, draft, data, onCellUpdate, focusCell]);

  const cancelEdit = useCallback((restoreRowIndex, restoreColIndex) => {
    setEditing(null);
    if (restoreRowIndex != null && restoreColIndex != null) {
      setTimeout(() => focusCell(restoreRowIndex, restoreColIndex), 0);
    }
  }, [focusCell]);

  const handleCellKeyDown = useCallback((e, row, col, rowIndex, colIndex) => {
    if (editing?.rowId === row.id && editing?.key === col.key) return;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); moveFocus(0, 1); break;
      case 'ArrowLeft':  e.preventDefault(); moveFocus(0, -1); break;
      case 'ArrowDown':  e.preventDefault(); moveFocus(1, 0); break;
      case 'ArrowUp':    e.preventDefault(); moveFocus(-1, 0); break;
      case 'Enter':
        e.preventDefault();
        if (editable && col.editable && col.type !== 'boolean') startEdit(row, col, rowIndex, colIndex);
        break;
      case ' ':
        if (editable && col.editable && col.type === 'boolean' && onCellUpdate) {
          e.preventDefault();
          setSaving({ rowId: row.id, key: col.key });
          onCellUpdate({ row, key: col.key, value: !row[col.key] }).finally(() => setSaving(null));
        }
        break;
      default: break;
    }
  }, [editing, moveFocus, editable, onCellUpdate]);

  const handleInfiniteScroll = (e) => {
    if (mode !== 'infinite' || !hasMore || isLoadingMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 250) onLoadMore?.();
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-3 items-center">
        {searchable && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Αναζήτηση..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
        )}

        {/* Active backend filter badge + clear-all */}
        {serverFiltering && activeFilterCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {activeFilterCount} φίλτρο{activeFilterCount !== 1 ? 'α' : ''} ενεργό{activeFilterCount !== 1 ? '' : ''}
            </span>
            <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="h-7 text-xs text-slate-500 hover:text-red-600">
              <X className="h-3 w-3 mr-1" /> Καθαρισμός όλων
            </Button>
          </div>
        )}

        {bulkActions && selectedIds.length > 0 ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-slate-600">{selectedIds.length} επιλεγμένα</span>
            {bulkActions}
          </div>
        ) : (
          <div className="text-sm text-slate-500 ml-auto flex items-center gap-2">
            <span>{displayData.length} εγγραφές</span>
            {mode === 'infinite' && <span className="text-xs text-slate-400">(φορτωμένα)</span>}
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-950 dark:border-slate-700">
        <div
          ref={scrollContainerRef}
          className={cn("overflow-x-auto", mode === 'infinite' && "overflow-y-auto")}
          style={height ? { maxHeight: height } : undefined}
          onScroll={handleInfiniteScroll}
        >
          <Table>
            <TableHeader>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="column-headers" direction="horizontal">
                  {(provided) => (
                    <TableRow
                      className="bg-slate-50 dark:bg-slate-900"
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {selectable && (
                        <TableHead className="w-12">
                          <input
                            type="checkbox"
                            checked={displayData.length > 0 && displayData.every(row => selectedIds.includes(row.id))}
                            ref={el => {
                              if (el) {
                                const someSelected = displayData.some(row => selectedIds.includes(row.id));
                                const allSelected = displayData.length > 0 && displayData.every(row => selectedIds.includes(row.id));
                                el.indeterminate = someSelected && !allSelected;
                              }
                            }}
                            onChange={e => {
                              if (e.target.checked) onSelectionChange?.(displayData.map(r => r.id));
                              else onSelectionChange?.([]);
                            }}
                            className="rounded"
                          />
                        </TableHead>
                      )}

                      {orderedColumns.map((col) => {
                        const isReorderable = !!col.reorderable && !!onColumnOrderChange;
                        const reorderableIndex = orderedColumns.filter(c => c.reorderable).findIndex(c => c.key === col.key);
                        const hasActiveFilter = serverFiltering && !!(filterModel?.[col.key]);

                        const headerContent = (dragProvided, snapshot) => (
                          <div className="flex items-center gap-0.5">
                            {isReorderable && (
                              <span
                                {...(dragProvided?.dragHandleProps || {})}
                                onClick={e => e.stopPropagation()}
                                className="cursor-grab text-slate-300 hover:text-slate-500 flex-shrink-0"
                              >
                                <GripVertical className="h-3 w-3" />
                              </span>
                            )}
                            <span className={cn(hasActiveFilter && "text-blue-700 font-bold")}>
                              {col.label}
                            </span>
                            {sortable && col.sortable !== false && (
                              activeSortField === col.key
                                ? (activeSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                : <ArrowUpDown className="h-3 w-3 text-slate-300" />
                            )}
                            {/* Per-column multi-select filter popover — server mode only */}
                            {serverFiltering && filterable && col.filterable !== false && (
                              <ColumnFilterPopover
                                columnKey={col.key}
                                columnLabel={col.label}
                                partition={partition}
                                currentModel={filterModel?.[col.key]}
                                onApply={model => handleColumnFilterChange(col.key, model)}
                              />
                            )}
                          </div>
                        );

                        if (isReorderable) {
                          return (
                            <Draggable key={col.key} draggableId={col.key} index={reorderableIndex}>
                              {(dragProvided, snapshot) => (
                                <TableHead
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={cn(
                                  "font-semibold text-slate-700 dark:text-slate-200 select-none",
                                  sortable && col.sortable !== false && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800",
                                  snapshot.isDragging && "bg-blue-50 dark:bg-blue-900/40 shadow-lg opacity-90",
                                  hasActiveFilter && "bg-blue-50 dark:bg-blue-900/40"
                                )}
                                  onClick={() => !snapshot.isDragging && sortable && col.sortable !== false && handleSort(col.key)}
                                >
                                  {headerContent(dragProvided, snapshot)}
                                </TableHead>
                              )}
                            </Draggable>
                          );
                        }

                        return (
                          <TableHead
                            key={col.key}
                            className={cn(
                              "font-semibold text-slate-700 dark:text-slate-200",
                              sortable && col.sortable !== false && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none",
                              hasActiveFilter && "bg-blue-50 dark:bg-blue-900/40"
                            )}
                            onClick={() => sortable && col.sortable !== false && handleSort(col.key)}
                          >
                            {headerContent(null, null)}
                          </TableHead>
                        );
                      })}

                      {provided.placeholder}
                      {actions && <TableHead className="w-24">Ενέργειες</TableHead>}
                    </TableRow>
                  )}
                </Droppable>
              </DragDropContext>
            </TableHeader>

            <TableBody>
              {visibleData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={orderedColumns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="text-center py-8 text-slate-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                visibleData.map((row, rowIndex) => (
                  <TableRow
                    key={row.id || rowIndex}
                    className={cn("hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors", onRowClick && "cursor-pointer", selectedIds.includes(row.id) && "bg-blue-50 dark:bg-blue-900/40")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={e => {
                            if (e.target.checked) onSelectionChange?.([...selectedIds, row.id]);
                            else onSelectionChange?.(selectedIds.filter(id => id !== row.id));
                          }}
                          className="rounded"
                        />
                      </TableCell>
                    )}

                    {orderedColumns.map((col, colIndex) => {
                      const isEditing = editable && editing?.rowId === row.id && editing?.key === col.key;
                      const isSaving = saving?.rowId === row.id && saving?.key === col.key;
                      const isLoadingEdit = loadingEditCell?.rowId === row.id && loadingEditCell?.key === col.key;
                      const canEdit = editable && col.editable;
                      const isFocused = focusedCell?.rowIndex === rowIndex && focusedCell?.colIndex === colIndex;
                      const refKey = `${rowIndex}-${colIndex}`;

                      return (
                        <TableCell
                          key={col.key}
                          ref={el => {
                            if (el) cellRefs.current.set(refKey, el);
                            else cellRefs.current.delete(refKey);
                          }}
                          tabIndex={isFocused ? 0 : -1}
                          className={cn(
                            "text-sm outline-none",
                            canEdit && "cursor-text",
                            isFocused && !isEditing && "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:ring-blue-600 dark:bg-blue-900/40"
                          )}
                          onFocus={() => setFocusedCell({ rowIndex, colIndex })}
                          onKeyDown={e => handleCellKeyDown(e, row, col, rowIndex, colIndex)}
                          onDoubleClick={() => startEdit(row, col, rowIndex, colIndex)}
                          onClick={e => {
                            if (isEditing || col.type === 'boolean') e.stopPropagation();
                          }}
                        >
                          {isLoadingEdit ? (
                            <div className="flex items-center gap-2 text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs">Φόρτωση...</span>
                            </div>
                          ) : isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                autoFocus
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
                                  if (e.key === 'Enter') { e.preventDefault(); void commitEdit(rowIndex, colIndex); }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(rowIndex, colIndex); }
                                }}
                                onBlur={() => void commitEdit(rowIndex, colIndex)}
                                className="h-8"
                              />
                              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </div>
                          ) : col.type === 'boolean' && canEdit ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!!row[col.key]}
                                onChange={async e => {
                                  e.stopPropagation();
                                  if (!onCellUpdate) return;
                                  try {
                                    setSaving({ rowId: row.id, key: col.key });
                                    await onCellUpdate({ row, key: col.key, value: e.target.checked });
                                  } finally {
                                    setSaving(null);
                                  }
                                }}
                              />
                              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className={cn(canEdit && "hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-1 -mx-1")} title={canEdit ? 'Διπλό κλικ για επεξεργασία' : undefined}>
                                {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                              </div>
                              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}

                    {actions && (
                      <TableCell className="relative overflow-visible" onClick={e => e.stopPropagation()}>
                        {actions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}

              {mode === 'infinite' && (hasMore || isLoadingMore) && (
                <TableRow>
                  <TableCell colSpan={orderedColumns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="py-4 text-center text-sm text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className={cn("h-4 w-4", isLoadingMore ? "animate-spin" : "opacity-40")} />
                      {isLoadingMore ? 'Φόρτωση περισσότερων...' : 'Κύλιση για περισσότερα'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {mode === 'paged' && pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Σελίδα {page + 1} από {pageCount}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}