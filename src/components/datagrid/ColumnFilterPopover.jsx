import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Search, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";

/**
 * ColumnFilterPopover — standalone multi-select filter popover for DataGrid columns.
 * Decoupled from AG Grid; works with Records.jsx backend filter architecture.
 *
 * Props:
 *   columnKey     — field key
 *   columnLabel   — display label for the column
 *   partition     — 'all' | 'postgrad' | 'undergrad' | 'unknown'
 *   currentModel  — { filterType:'set', values:[], includeBlanks:bool } | undefined
 *   onApply       — (model | null) => void
 */
export default function ColumnFilterPopover({ columnKey, columnLabel, partition = 'all', currentModel, onApply }) {
  const [open, setOpen] = useState(false);
  const [filterValues, setFilterValues] = useState([]);
  const [hasBlanks, setHasBlanks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedValues, setSelectedValues] = useState(new Set());
  const [blanksSelected, setBlanksSelected] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [minSearchChars, setMinSearchChars] = useState(0);
  const debounceRef = useRef(null);
  const isActive = !!(currentModel && (currentModel.values?.length > 0 || currentModel.includeBlanks));

  // Sync local state when popover opens
  useEffect(() => {
    if (!open) return;
    setSearchText('');
    setInfoMessage('');
    // Restore from currentModel
    setSelectedValues(new Set(currentModel?.values || []));
    setBlanksSelected(!!currentModel?.includeBlanks);
    loadFilterValues('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, columnKey, partition]);

  const loadFilterValues = async (search = '') => {
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke('personGridFilterValues', {
        columnKey,
        searchText: search,
        partition,
      });
      setFilterValues(data.values || []);
      setHasBlanks(!!data.hasBlanks);
      setInfoMessage(data.message || '');
      setMinSearchChars(Number(data.minSearchChars || 0));
    } catch (e) {
      console.error('ColumnFilterPopover: error loading values', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value) => {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadFilterValues(value), 250);
  };

  const handleSelectAll = () => {
    const allSelected = selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected);
    if (allSelected) {
      setSelectedValues(new Set());
      setBlanksSelected(false);
    } else {
      setSelectedValues(new Set(filterValues.map(v => String(v))));
      setBlanksSelected(hasBlanks);
    }
  };

  const handleValueToggle = (value) => {
    const sv = String(value);
    const next = new Set(selectedValues);
    if (next.has(sv)) next.delete(sv);
    else next.add(sv);
    setSelectedValues(next);
  };

  const handleApply = () => {
    if (selectedValues.size === 0 && !blanksSelected) {
      onApply(null); // clear
    } else {
      onApply({ filterType: 'set', values: Array.from(selectedValues), includeBlanks: blanksSelected });
    }
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedValues(new Set());
    setBlanksSelected(false);
    onApply(null);
    setOpen(false);
  };

  const renderValueLabel = (v) => {
    if (v === true || v === 'true') return 'Ναι';
    if (v === false || v === 'false') return 'Όχι';
    return String(v);
  };

  const totalSelected = selectedValues.size + (blanksSelected ? 1 : 0);
  const totalAvailable = filterValues.length + (hasBlanks ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className={cn(
            "ml-1 p-0.5 rounded transition-colors flex-shrink-0",
            isActive
              ? "text-blue-600 hover:text-blue-700"
              : "text-slate-300 hover:text-slate-500"
          )}
          title={isActive ? `Φίλτρο ενεργό: ${currentModel?.values?.join(', ')}` : `Φίλτρο: ${columnLabel}`}
        >
          <Filter className="h-3 w-3" fill={isActive ? 'currentColor' : 'none'} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-64 p-3"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-slate-600 mb-2">{columnLabel}</p>

        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={minSearchChars ? `Αναζήτηση (${minSearchChars}+ χαρακτήρες)...` : "Αναζήτηση..."}
            value={searchText}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-200">
          <Checkbox
            id={`sa-${columnKey}`}
            checked={filterValues.length > 0 && selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected)}
            onCheckedChange={handleSelectAll}
          />
          <label htmlFor={`sa-${columnKey}`} className="text-sm font-medium cursor-pointer select-none flex-1">
            Επιλογή Όλων
          </label>
          <span className="text-xs text-slate-400">{totalSelected}/{totalAvailable}</span>
        </div>

        <ScrollArea className="h-44 mb-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-1.5">
              {infoMessage && (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-2">
                  {infoMessage}
                </div>
              )}
              {hasBlanks && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`blank-${columnKey}`}
                    checked={blanksSelected}
                    onCheckedChange={() => setBlanksSelected(v => !v)}
                  />
                  <label htmlFor={`blank-${columnKey}`} className="text-sm italic text-slate-500 cursor-pointer select-none">
                    (Κενά)
                  </label>
                </div>
              )}
              {filterValues.map((v, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <Checkbox
                    id={`v-${columnKey}-${idx}`}
                    checked={selectedValues.has(String(v))}
                    onCheckedChange={() => handleValueToggle(v)}
                  />
                  <label
                    htmlFor={`v-${columnKey}-${idx}`}
                    className="text-sm cursor-pointer select-none flex-1 truncate"
                    title={renderValueLabel(v)}
                  >
                    {renderValueLabel(v)}
                  </label>
                </div>
              ))}
              {filterValues.length === 0 && !hasBlanks && !infoMessage && (
                <div className="text-sm text-slate-400 text-center py-4">Δεν βρέθηκαν τιμές</div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleClear} className="flex-1 h-8 text-xs">
            Καθαρισμός
          </Button>
          <Button size="sm" onClick={handleApply} className="flex-1 h-8 text-xs">
            Εφαρμογή
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}