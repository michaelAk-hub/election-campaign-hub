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
    
    const columnKey = props.colDef.field;

    useEffect(() => {
        loadFilterValues();
    }, [columnKey]);

    const loadFilterValues = async (search = '') => {
        setLoading(true);
        try {
            const { data } = await base44.functions.invoke('personGridFilterValues', {
                columnKey,
                searchText: search
            });
            
            setFilterValues(data.values || []);
            setHasBlanks(data.hasBlanks || false);
        } catch (error) {
            console.error('Error loading filter values:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (value) => {
        setSearchText(value);
        loadFilterValues(value);
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
        const newSelected = new Set(selectedValues);
        if (newSelected.has(value)) {
            newSelected.delete(value);
        } else {
            newSelected.add(value);
        }
        setSelectedValues(newSelected);
    };

    const handleBlanksToggle = () => {
        setBlanksSelected(!blanksSelected);
    };

    const handleApply = () => {
        const model = {
            filterType: 'set',
            values: Array.from(selectedValues),
            includeBlanks: blanksSelected
        };
        
        props.filterChangedCallback();
    };

    const handleClear = () => {
        setSelectedValues(new Set());
        setBlanksSelected(false);
        props.filterChangedCallback();
    };

    // Expose methods to AG Grid
    useImperativeHandle(ref, () => ({
        doesFilterPass(params) {
            const value = props.valueGetter(params.node);
            const isBlank = value === null || value === undefined || value === '' || 
                           (typeof value === 'string' && value.trim() === '');
            
            if (selectedValues.size === 0 && !blanksSelected) {
                return true; // No filter applied
            }
            
            if (isBlank) {
                return blanksSelected;
            }
            
            return selectedValues.has(String(value));
        },
        
        isFilterActive() {
            return selectedValues.size > 0 || blanksSelected;
        },
        
        getModel() {
            if (selectedValues.size === 0 && !blanksSelected) {
                return null;
            }
            return {
                filterType: 'set',
                values: Array.from(selectedValues),
                includeBlanks: blanksSelected
            };
        },
        
        setModel(model) {
            if (!model) {
                setSelectedValues(new Set());
                setBlanksSelected(false);
                return;
            }
            setSelectedValues(new Set(model.values || []));
            setBlanksSelected(model.includeBlanks || false);
        }
    }));

    const totalSelected = selectedValues.size + (blanksSelected ? 1 : 0);
    const totalAvailable = filterValues.length + (hasBlanks ? 1 : 0);

    return (
        <div className="w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-3">
            {/* Search box */}
            <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Αναζήτηση..."
                    value={searchText}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-8 text-sm"
                />
            </div>

            {/* Select All */}
            <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-200">
                <Checkbox
                    id="select-all"
                    checked={selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected)}
                    onCheckedChange={handleSelectAll}
                />
                <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer select-none"
                >
                    Επιλογή Όλων
                </label>
            </div>

            {/* Count */}
            <div className="text-xs text-slate-500 mb-2">
                Επιλεγμένα: {totalSelected} / {totalAvailable}
            </div>

            {/* Values list */}
            <ScrollArea className="h-48 mb-3">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {hasBlanks && (
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="blanks"
                                    checked={blanksSelected}
                                    onCheckedChange={handleBlanksToggle}
                                />
                                <label
                                    htmlFor="blanks"
                                    className="text-sm cursor-pointer select-none italic text-slate-500"
                                >
                                    (Blanks)
                                </label>
                            </div>
                        )}
                        
                        {filterValues.map((value, idx) => (
                            <div key={idx} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`value-${idx}`}
                                    checked={selectedValues.has(value)}
                                    onCheckedChange={() => handleValueToggle(value)}
                                />
                                <label
                                    htmlFor={`value-${idx}`}
                                    className="text-sm cursor-pointer select-none flex-1 truncate"
                                    title={value}
                                >
                                    {value}
                                </label>
                            </div>
                        ))}
                        
                        {filterValues.length === 0 && !hasBlanks && (
                            <div className="text-sm text-slate-400 text-center py-4">
                                Δεν βρέθηκαν τιμές
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>

            {/* Buttons */}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClear}
                    className="flex-1 h-8 text-xs"
                >
                    Καθαρισμός
                </Button>
                <Button
                    size="sm"
                    onClick={handleApply}
                    className="flex-1 h-8 text-xs"
                >
                    Εφαρμογή
                </Button>
            </div>
        </div>
    );
});

AccessStyleFilter.displayName = 'AccessStyleFilter';

export default AccessStyleFilter;