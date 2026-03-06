import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';

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
  fetchLatestRow, // async (rowId: string) => Promise<rowData> — provided by parent
  onRowRefreshed, // ({ id, newData }) => void — updates parent state for that row only
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const [editing, setEditing] = useState(null); // { rowId, key }
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(null); // { rowId, key }
  const [loadingEditCell, setLoadingEditCell] = useState(null); // { rowId, key } — per-cell fetch indicator

  // --- Keyboard navigation state ---
  const [focusedCell, setFocusedCell] = useState(null); // { rowIndex, colIndex }
  const cellRefs = useRef(new Map()); // key: "rowIndex-colIndex" → DOM element
  const scrollContainerRef = useRef(null);

  // Only data columns participate in keyboard navigation (no checkbox, no actions)
  const navColumns = useMemo(() => columns, [columns]);

  const filteredData = useMemo(() => {
    let result = [...data];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(row =>
        columns.some(col => {
          const val = row[col.key];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(searchLower);
        })
      );
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        result = result.filter(row => String(row[key]) === value);
      }
    });

    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        let cmp;
        if (aVal != null && bVal != null && !Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), 'el', { numeric: true, sensitivity: 'base' });
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [data, search, filters, sortField, sortDir, columns]);

  useEffect(() => {
    if (mode !== 'paged') return;
    const pc = Math.ceil(filteredData.length / pageSize);
    if (page > 0 && page >= pc) setPage(0);
  }, [filteredData.length, pageSize, mode]);

  // Clear focusedCell when page/search/filters change so stale refs don't stay active
  useEffect(() => {
    setFocusedCell(null);
  }, [page, search, filters, sortField, sortDir]);

  const pageCount = Math.ceil(filteredData.length / pageSize);
  const pagedData = filteredData.slice(page * pageSize, (page + 1) * pageSize);
  const displayData = mode === 'paged' ? pagedData : filteredData;

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getUniqueValues = (key) => {
    const values = [...new Set(
      data.map(row => row[key]).filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    )];
    return values.sort((a, b) => String(a).localeCompare(String(b), 'el', { numeric: true, sensitivity: 'base' }));
  };

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
    const nextRow = Math.max(0, Math.min(displayData.length - 1, rowIndex + rowDelta));
    const nextCol = Math.max(0, Math.min(navColumns.length - 1, colIndex + colDelta));
    focusCell(nextRow, nextCol);
  }, [focusedCell, displayData.length, navColumns.length, focusCell]);

  // --- Edit helpers ---
  const startEdit = (row, col, rowIndex, colIndex) => {
    if (!editable || !col.editable || col.type === 'boolean') return;
    setFocusedCell({ rowIndex, colIndex });
    setEditing({ rowId: row.id, key: col.key });
    setDraft(String(row[col.key] ?? ''));
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
    // Restore focus to cell after edit
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

  // --- Cell keydown handler (navigation mode, not editing) ---
  const handleCellKeyDown = useCallback((e, row, col, rowIndex, colIndex) => {
    // If currently editing this cell, let the input handle everything
    if (editing?.rowId === row.id && editing?.key === col.key) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(0, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(0, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (editable && col.editable && col.type !== 'boolean') {
          startEdit(row, col, rowIndex, colIndex);
        }
        break;
      case ' ':
        // Space toggles boolean editable cells
        if (editable && col.editable && col.type === 'boolean' && onCellUpdate) {
          e.preventDefault();
          setSaving({ rowId: row.id, key: col.key });
          onCellUpdate({ row, key: col.key, value: !row[col.key] }).finally(() => setSaving(null));
        }
        break;
      default:
        break;
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
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
        )}

        {filterable && (
          <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)} className={cn(showFilters && "bg-slate-100")}>
            <Filter className="h-4 w-4 mr-2" />
            Φίλτρα
          </Button>
        )}

        {bulkActions && selectedIds.length > 0 ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-slate-600">{selectedIds.length} επιλεγμένα</span>
            {bulkActions}
          </div>
        ) : (
          <div className="text-sm text-slate-500 ml-auto flex items-center gap-2">
            <span>{filteredData.length} εγγραφές</span>
            {mode === 'infinite' && <span className="text-xs text-slate-400">(φορτωμένα)</span>}
          </div>
        )}
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-lg">
          {columns.filter(col => col.filterable !== false).map(col => (
            <div key={col.key} className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">{col.label}</label>
              <Select value={filters[col.key] || 'all'} onValueChange={(v) => { setFilters(f => ({ ...f, [col.key]: v })); setPage(0); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues(col.key).map(v => (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="self-end">
            <X className="h-4 w-4 mr-1" /> Καθαρισμός
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white">
        <div
          ref={scrollContainerRef}
          className={cn("overflow-x-auto", mode === 'infinite' && "overflow-y-auto")}
          style={height ? { maxHeight: height } : undefined}
          onScroll={handleInfiniteScroll}
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                {selectable && (
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={filteredData.length > 0 && filteredData.every(row => selectedIds.includes(row.id))}
                      onChange={(e) => {
                        if (e.target.checked) onSelectionChange?.(filteredData.map(r => r.id));
                        else onSelectionChange?.([]);
                      }}
                      className="rounded"
                    />
                  </TableHead>
                )}
                {columns.map(col => (
                  <TableHead
                    key={col.key}
                    className={cn("font-semibold text-slate-700", sortable && col.sortable !== false && "cursor-pointer hover:bg-slate-100 select-none")}
                    onClick={() => sortable && col.sortable !== false && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortable && col.sortable !== false && (
                        sortField === col.key
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </div>
                  </TableHead>
                ))}
                {actions && <TableHead className="w-24">Ενέργειες</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {displayData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="text-center py-8 text-slate-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                displayData.map((row, rowIndex) => (
                  <TableRow
                    key={row.id || rowIndex}
                    className={cn("hover:bg-slate-50 transition-colors", onRowClick && "cursor-pointer", selectedIds.includes(row.id) && "bg-blue-50")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(e) => {
                            if (e.target.checked) onSelectionChange?.([...selectedIds, row.id]);
                            else onSelectionChange?.(selectedIds.filter(id => id !== row.id));
                          }}
                          className="rounded"
                        />
                      </TableCell>
                    )}

                    {columns.map((col, colIndex) => {
                      const isEditing = editable && editing?.rowId === row.id && editing?.key === col.key;
                      const isSaving = saving?.rowId === row.id && saving?.key === col.key;
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
                            isFocused && !isEditing && "ring-2 ring-inset ring-blue-400 bg-blue-50"
                          )}
                          onFocus={() => setFocusedCell({ rowIndex, colIndex })}
                          onKeyDown={(e) => handleCellKeyDown(e, row, col, rowIndex, colIndex)}
                          onDoubleClick={() => startEdit(row, col, rowIndex, colIndex)}
                          onClick={e => {
                            if (isEditing || col.type === 'boolean') e.stopPropagation();
                          }}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                autoFocus
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                  // Stop arrow keys from bubbling to cell handler while editing
                                  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                    e.stopPropagation();
                                  }
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
                                onChange={async (e) => {
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
                              <div className={cn(canEdit && "hover:bg-slate-100 rounded px-1 -mx-1")} title={canEdit ? 'Διπλό κλικ για επεξεργασία' : undefined}>
                                {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                              </div>
                              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}

                    {actions && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        {actions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}

              {mode === 'infinite' && (hasMore || isLoadingMore) && (
                <TableRow>
                  <TableCell colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="py-4 text-center text-sm text-slate-500">
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