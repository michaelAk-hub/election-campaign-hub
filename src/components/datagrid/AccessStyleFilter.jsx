import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

const MIN_SEARCH_CHARS_HIGH = 2;
const HIGH_CARD_FIELDS = new Set(["person_id", "ucid", "mobile_phone", "first_name", "last_name", "monadikos_kanali"]);

function isBlank(v) {
  return v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
}

function sortValues(values) {
  const bools = values.filter(v => typeof v === "boolean").sort((a, b) => Number(a) - Number(b));
  const rest = values.filter(v => typeof v !== "boolean").map(v => String(v));
  rest.sort((a, b) => a.localeCompare(b, "el"));
  return [...bools, ...rest];
}

const AccessStyleFilter = forwardRef((props, ref) => {
  const columnKey = props.colDef.field;

  const [filterValues, setFilterValues] = useState([]);
  const [hasBlanks, setHasBlanks] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedValues, setSelectedValues] = useState(new Set());
  const [blanksSelected, setBlanksSelected] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");

  const debounceRef = useRef(null);

  const computeValuesFromGrid = (search = "") => {
    const api = props.api;
    if (!api) return { values: [], hasBlanks: false, message: "" };

    const isHigh = HIGH_CARD_FIELDS.has(columnKey) || String(columnKey).startsWith("custom:");
    const st = String(search || "").trim();

    if (isHigh && st.length > 0 && st.length < MIN_SEARCH_CHARS_HIGH) {
      return {
        values: [],
        hasBlanks: false,
        message: `Πληκτρολόγησε ${MIN_SEARCH_CHARS_HIGH}+ χαρακτήρες για να εμφανιστούν τιμές.`,
      };
    }

    const set = new Set();
    let blanks = false;

    api.forEachNode((node) => {
      if (!node?.data) return;
      const v = node.data[columnKey];

      if (isBlank(v)) {
        blanks = true;
        return;
      }

      if (st) {
        const s = String(v).toLowerCase();
        if (!s.includes(st.toLowerCase())) return;
      }

      set.add(typeof v === "boolean" ? v : String(v));
    });

    return { values: sortValues(Array.from(set)), hasBlanks: blanks, message: "" };
  };

  const loadFilterValues = (search = "") => {
    const res = computeValuesFromGrid(search);
    setFilterValues(res.values);
    setHasBlanks(res.hasBlanks);
    setInfoMessage(res.message || "");
  };

  useEffect(() => {
    setSearchText("");
    setInfoMessage("");
    loadFilterValues("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnKey]);

  const handleSearchChange = (value) => {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadFilterValues(value), 200);
  };

  const handleSelectAll = () => {
    if (selectedValues.size === filterValues.length && (!hasBlanks || blanksSelected)) {
      setSelectedValues(new Set());
      setBlanksSelected(false);
    } else {
      setSelectedValues(new Set(filterValues.map(v => (typeof v === "boolean" ? v : String(v)))));
      setBlanksSelected(hasBlanks);
    }
  };

  const handleValueToggle = (value) => {
    const key = typeof value === "boolean" ? value : String(value);
    const next = new Set(selectedValues);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedValues(next);
  };

  useImperativeHandle(ref, () => ({
    doesFilterPass(params) {
      const value = props.valueGetter ? props.valueGetter(params) : params.data[columnKey];
      const blank = isBlank(value);

      if (selectedValues.size === 0 && !blanksSelected) return true;
      if (blank) return blanksSelected;

      const key = typeof value === "boolean" ? value : String(value);
      return selectedValues.has(key);
    },

    isFilterActive() {
      return selectedValues.size > 0 || blanksSelected;
    },

    getModel() {
      if (selectedValues.size === 0 && !blanksSelected) return null;
      return { filterType: "set", values: Array.from(selectedValues), includeBlanks: blanksSelected };
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
  }));

  const renderValueLabel = (v) => {
    if (v === true) return "Ναι";
    if (v === false) return "Όχι";
    return String(v);
  };

  return (
    <div className="w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-3">
      <div className="relative mb-3">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Αναζήτηση..."
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
        <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
          Επιλογή Όλων
        </label>
      </div>

      <ScrollArea className="h-48 mb-3">
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

          {filterValues.map((v, idx) => {
            const key = typeof v === "boolean" ? v : String(v);
            return (
              <div key={idx} className="flex items-center space-x-2">
                <Checkbox
                  id={`v-${idx}`}
                  checked={selectedValues.has(key)}
                  onCheckedChange={() => handleValueToggle(v)}
                />
                <label htmlFor={`v-${idx}`} className="text-sm cursor-pointer select-none flex-1 truncate" title={renderValueLabel(v)}>
                  {renderValueLabel(v)}
                </label>
              </div>
            );
          })}

          {filterValues.length === 0 && !hasBlanks && !infoMessage && (
            <div className="text-sm text-slate-400 text-center py-4">Δεν βρέθηκαν τιμές</div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedValues(new Set());
            setBlanksSelected(false);
            props.filterChangedCallback?.();
          }}
          className="flex-1 h-8 text-xs"
        >
          Καθαρισμός
        </Button>
        <Button size="sm" onClick={() => props.filterChangedCallback?.()} className="flex-1 h-8 text-xs">
          Εφαρμογή
        </Button>
      </div>
    </div>
  );
});

AccessStyleFilter.displayName = "AccessStyleFilter";
export default AccessStyleFilter;