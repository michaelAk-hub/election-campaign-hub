import React, { useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Download, RefreshCw, RotateCcw, Plus } from 'lucide-react';

export default function DataGridToolbar({
    searchValue,
    onSearchChange,
    showFilters,
    onToggleFilters,
    onExport,
    onRefresh,
    onResetLayout,
    onAddNew,
    canCreate = false
}) {
    const debounceRef = useRef(null);

    const handleSearchInput = (e) => {
        const value = e.target.value;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onSearchChange(value), 300);
    };

    return (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-white border-b">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Αναζήτηση σε όλα τα πεδία..."
                    defaultValue={searchValue}
                    onChange={handleSearchInput}
                    className="pl-9"
                />
            </div>
            
            <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                onClick={onToggleFilters}
            >
                <Filter className="h-4 w-4 mr-2" />
                Φίλτρα
            </Button>

            <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
            </Button>

            <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Ανανέωση
            </Button>

            <Button variant="outline" size="sm" onClick={onResetLayout}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Layout
            </Button>

            {canCreate && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={onAddNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Νέα Εγγραφή
                </Button>
            )}
        </div>
    );
}