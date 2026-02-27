import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function DataGrid({
  data = [],
  columns = [],
  onRowClick,
  onEdit,
  onDelete,
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
  className
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const filteredData = useMemo(() => {
    let result = [...data];
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(row => 
        columns.some(col => {
          const val = row[col.key];
          return val && String(val).toLowerCase().includes(searchLower);
        })
      );
    }
    
    // Filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        result = result.filter(row => String(row[key]) === value);
      }
    });
    
    // Sort
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        const cmp = String(aVal).localeCompare(String(bVal), 'el');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    
    return result;
  }, [data, search, filters, sortField, sortDir, columns]);

  const pageCount = Math.ceil(filteredData.length / pageSize);
  const pagedData = filteredData.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getUniqueValues = (key) => {
    const values = [...new Set(data.map(row => row[key]).filter(Boolean))];
    return values.sort((a, b) => String(a).localeCompare(String(b), 'el'));
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and Filter Bar */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "bg-slate-100")}
          >
            <Filter className="h-4 w-4 mr-2" />
            Φίλτρα
          </Button>
        )}
        
        {bulkActions && selectedIds.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-slate-600">{selectedIds.length} επιλεγμένα</span>
            {bulkActions}
          </div>
        )}
        
        {(!bulkActions || selectedIds.length === 0) && (
          <div className="text-sm text-slate-500 ml-auto">
            {filteredData.length} εγγραφές
          </div>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-lg">
          {columns.filter(col => col.filterable !== false).map(col => (
            <div key={col.key} className="min-w-[150px]">
              <label className="text-xs text-slate-500 mb-1 block">{col.label}</label>
              <Select
                value={filters[col.key] || 'all'}
                onValueChange={(v) => { setFilters({...filters, [col.key]: v}); setPage(0); }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλα</SelectItem>
                  {getUniqueValues(col.key).map(v => (
                    <SelectItem key={v} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({})}
            className="self-end"
          >
            <X className="h-4 w-4 mr-1" />
            Καθαρισμός
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                {selectable && (
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={filteredData.length > 0 && filteredData.every(row => selectedIds.includes(row.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange?.(filteredData.map(r => r.id));
                        } else {
                          onSelectionChange?.([]);
                        }
                      }}
                      className="rounded"
                    />
                  </TableHead>
                )}
                {columns.map(col => (
                  <TableHead 
                    key={col.key}
                    className={cn(
                      "font-semibold text-slate-700",
                      sortable && col.sortable !== false && "cursor-pointer hover:bg-slate-100 select-none"
                    )}
                    onClick={() => sortable && col.sortable !== false && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortable && col.sortable !== false && (
                        sortField === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300" />
                        )
                      )}
                    </div>
                  </TableHead>
                ))}
                {actions && <TableHead className="w-24">Ενέργειες</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedData.length === 0 ? (
                <TableRow>
                  <TableCell 
                    colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                    className="text-center py-8 text-slate-500"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                pagedData.map((row, idx) => (
                  <TableRow 
                    key={row.id || idx}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      onRowClick && "cursor-pointer",
                      selectedIds.includes(row.id) && "bg-blue-50"
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onSelectionChange?.([...selectedIds, row.id]);
                            } else {
                              onSelectionChange?.(selectedIds.filter(id => id !== row.id));
                            }
                          }}
                          className="rounded"
                        />
                      </TableCell>
                    )}
                    {columns.map(col => (
                      <TableCell key={col.key} className="text-sm">
                        {col.render ? col.render(row[col.key], row) : (
                          row[col.key] ?? '-'
                        )}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {actions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Σελίδα {page + 1} από {pageCount}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}