import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2 } from 'lucide-react';

const AccessStyleFilter = forwardRef((props, ref) => {
    const [filterValues, setFilterValues] = useState([]);
    const [hasBlanks, setHasBlanks] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedValues, setSelectedValues] = useState(new Set());
    const [blanksSelected, setBlanksSelected] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [minSearchChars, setMinSearchChars] = useState(0);

    const debounceRef = useRef(null);

    const columnKey = props.colDef.field;
    const partition = props?.context?.partition ?? 'postgrad';

    useEffect(() => {
        setSearchText('');
        setInfoMessage('');
        setMinSearchChars(0);
        loadFilterValues('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnKey, partition]);

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
            console.error('Error loading filter values:', e);
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
        if (selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected)) {
            setSelectedValues(new Set());
            setBlanksSelected(false);
        } else {
            setSelectedValues(new Set(filterValues));
            setBlanksSelected(hasBlanks);
        }
    };

    const handleValueToggle = (value) => {
        const next = new Set(selectedValues);
        if (next.has(value) || next.has(String(value))) {
            next.delete(value);
            next.delete(String(value));
        } else {
            next.add(value);
        }
        setSelectedValues(next);
    };

    useImperativeHandle(ref, () => ({
        doesFilterPass(params) {
            const value = props.valueGetter ? props.valueGetter(params) : params.data[columnKey];
            const blank = value === null || value === undefined || value === '' ||
                (typeof value === 'string' && value.trim() === '');

            if (selectedValues.size === 0 && !blanksSelected) return true;
            if (blank) return blanksSelected;
            if (selectedValues.has(value)) return true;
            return selectedValues.has(String(value));
        },

        isFilterActive() {
            return selectedValues.size > 0 || blanksSelected;
        },

        getModel() {
            if (selectedValues.size === 0 && !blanksSelected) return null;
            return { filterType: 'set', values: Array.from(selectedValues), includeBlanks: blanksSelected };
        },

        setModel(model) {
            if (!model) {
                setSelectedValues(new Set());
                setBlanksSelected(false);
                return;
            }
            setSelectedValues(new Set(model.values || []));
            setBlanksSelected(!!model.includeBlanks);
        },

        getModelAsString() {
            const count = selectedValues.size + (blanksSelected ? 1 : 0);
            return count > 0 ? `${count} selected` : '';
        }
    }));

    const renderValueLabel = (v) => {
        if (v === true) return 'Ναι';
        if (v === false) return 'Όχι';
        return String(v);
    };

    const totalSelected = selectedValues.size + (blanksSelected ? 1 : 0);
    const totalAvailable = filterValues.length + (hasBlanks ? 1 : 0);

    return (
        <div className="w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-3">
            <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder={minSearchChars ? `Αναζήτηση (${minSearchChars}+ χαρακτήρες)...` : "Αναζήτηση..."}
                    value={searchText}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-8 text-sm"
                />
            </div>

            <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-200">
                <Checkbox
                    id="select-all"
                    checked={filterValues.length > 0 && selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected)}
                    onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none flex-1">
                    Επιλογή Όλων
                </label>
                <span className="text-xs text-slate-400">{totalSelected}/{totalAvailable}</span>
            </div>

            <ScrollArea className="h-48 mb-3">
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
                                    id="blanks"
                                    checked={blanksSelected}
                                    onCheckedChange={() => setBlanksSelected(!blanksSelected)}
                                />
                                <label htmlFor="blanks" className="text-sm italic text-slate-500 cursor-pointer select-none">
                                    (Blanks)
                                </label>
                            </div>
                        )}

                        {filterValues.map((v, idx) => (
                            <div key={idx} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`v-${idx}`}
                                    checked={selectedValues.has(v) || selectedValues.has(String(v))}
                                    onCheckedChange={() => handleValueToggle(v)}
                                />
                                <label
                                    htmlFor={`v-${idx}`}
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
                <Button size="sm" variant="outline" onClick={() => {
                    setSelectedValues(new Set());
                    setBlanksSelected(false);
                    props.filterChangedCallback?.();
                }} className="flex-1 h-8 text-xs">
                    Καθαρισμός
                </Button>
                <Button size="sm" onClick={() => props.filterChangedCallback?.()} className="flex-1 h-8 text-xs">
                    Εφαρμογή
                </Button>
            </div>
        </div>
    );
});

AccessStyleFilter.displayName = 'AccessStyleFilter';
export default AccessStyleFilter;