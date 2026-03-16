import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, GripVertical, RotateCcw } from 'lucide-react';
import { printChreosiStatements } from './ChreosiPrintView';

const STORAGE_KEY = 'chreosi_print_settings';

const DEFAULT_SETTINGS = {
  orientation: 'landscape',
  rowsPerPage: 25,
  orderedColumns: ['admission_year', 'department', 'last_name', 'first_name', 'mobile_phone', 'notes'],
  orderedSortFields: ['admission_year', 'department', 'last_name', 'first_name'],
};

const COLUMN_LABELS = {
  admission_year: 'Έτος Εισδοχής',
  department: 'Τμήμα',
  last_name: 'Επίθετο',
  first_name: 'Όνομα',
  mobile_phone: 'Κινητό',
  notes: 'Σημειώσεις',
};

const SORT_LABELS = {
  admission_year: 'Έτος Εισδοχής',
  department: 'Τμήμα',
  last_name: 'Επίθετο',
  first_name: 'Όνομα',
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, orderedColumns: [...DEFAULT_SETTINGS.orderedColumns], orderedSortFields: [...DEFAULT_SETTINGS.orderedSortFields] };
    const p = JSON.parse(raw);

    const validCols = new Set(DEFAULT_SETTINGS.orderedColumns);
    const validSorts = new Set(DEFAULT_SETTINGS.orderedSortFields);

    const orientation = ['portrait', 'landscape'].includes(p.orientation)
      ? p.orientation : DEFAULT_SETTINGS.orientation;

    const rowsPerPage = (Number.isInteger(p.rowsPerPage) && p.rowsPerPage >= 1)
      ? p.rowsPerPage : DEFAULT_SETTINGS.rowsPerPage;

    const orderedColumns =
      Array.isArray(p.orderedColumns) &&
      p.orderedColumns.length === DEFAULT_SETTINGS.orderedColumns.length &&
      p.orderedColumns.every(c => validCols.has(c)) &&
      new Set(p.orderedColumns).size === DEFAULT_SETTINGS.orderedColumns.length
        ? p.orderedColumns : [...DEFAULT_SETTINGS.orderedColumns];

    const orderedSortFields =
      Array.isArray(p.orderedSortFields) &&
      p.orderedSortFields.length === DEFAULT_SETTINGS.orderedSortFields.length &&
      p.orderedSortFields.every(f => validSorts.has(f)) &&
      new Set(p.orderedSortFields).size === DEFAULT_SETTINGS.orderedSortFields.length
        ? p.orderedSortFields : [...DEFAULT_SETTINGS.orderedSortFields];

    return { orientation, rowsPerPage, orderedColumns, orderedSortFields };
  } catch {
    return { ...DEFAULT_SETTINGS, orderedColumns: [...DEFAULT_SETTINGS.orderedColumns], orderedSortFields: [...DEFAULT_SETTINGS.orderedSortFields] };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function reorder(list, from, to) {
  const result = [...list];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

function DragList({ items, droppableId, labels, onDragEnd, showArrow }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
            {items.map((key, index) => (
              <Draggable key={key} draggableId={`${droppableId}-${key}`} index={index}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm select-none
                      bg-white dark:bg-slate-800
                      ${snap.isDragging ? 'shadow-lg border-blue-400 dark:border-blue-500' : 'border-slate-200 dark:border-slate-700'}`}
                  >
                    <span {...prov.dragHandleProps} className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="text-xs text-slate-400 w-5 shrink-0">{index + 1}.</span>
                    <span className="flex-1">{labels[key]}</span>
                    {showArrow && <span className="text-xs text-slate-400">↑ Αύξ.</span>}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

// accounts: array of ChreosiAccount objects (one or many)
export default function ChreosiPrintDialog({ open, onClose, accounts, people }) {
  const account = accounts?.[0] ?? null; // for display name in header
  const [settings, setSettings] = useState(() => loadSettings());
  const [rppStr, setRppStr] = useState(() => String(loadSettings().rowsPerPage));
  const [rppError, setRppError] = useState('');

  useEffect(() => {
    if (open) {
      const s = loadSettings();
      setSettings(s);
      setRppStr(String(s.rowsPerPage));
      setRppError('');
    }
  }, [open]);

  const update = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const handleRppChange = (e) => {
    const str = e.target.value;
    setRppStr(str);
    setRppError('');
    if (/^\d+$/.test(str.trim()) && parseInt(str, 10) >= 1) {
      update({ rowsPerPage: parseInt(str, 10) });
    }
  };

  const handleReset = () => {
    const defaults = {
      ...DEFAULT_SETTINGS,
      orderedColumns: [...DEFAULT_SETTINGS.orderedColumns],
      orderedSortFields: [...DEFAULT_SETTINGS.orderedSortFields],
    };
    setSettings(defaults);
    setRppStr(String(defaults.rowsPerPage));
    setRppError('');
    saveSettings(defaults);
  };

  const handleColumnDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    update({ orderedColumns: reorder(settings.orderedColumns, result.source.index, result.destination.index) });
  };

  const handleSortDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    update({ orderedSortFields: reorder(settings.orderedSortFields, result.source.index, result.destination.index) });
  };

  const handlePrint = () => {
    if (!accounts || accounts.length === 0) return;
    const trimmed = rppStr.trim();
    const n = parseInt(trimmed, 10);
    if (!/^\d+$/.test(trimmed) || n < 1) {
      setRppError('Εισάγετε θετικό ακέραιο αριθμό');
      return;
    }
    const finalSettings = { ...settings, rowsPerPage: n };
    saveSettings(finalSettings);
    const hasOutput = printChreosiStatements({ accounts, people, ...finalSettings });
    if (!hasOutput) {
      alert('Δεν υπάρχουν εκτυπώσιμες εγγραφές για τους επιλεγμένους χρεωστικούς.');
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md flex flex-col max-h-[95vh]">
        <DialogHeader>
          <DialogTitle>Ρυθμίσεις Εκτύπωσης</DialogTitle>
          <DialogDescription>
            {accounts?.length > 1
              ? `${accounts.length} επιλεγμένοι χρεωστικοί`
              : (account?.display_name || account?.username || '')}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-5 py-2 pr-1">

          {/* Orientation */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Προσανατολισμός</Label>
            <div className="flex gap-5">
              {[
                { val: 'landscape', label: 'Οριζόντια (Landscape)' },
                { val: 'portrait', label: 'Κατακόρυφη (Portrait)' },
              ].map(({ val, label }) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="orientation"
                    value={val}
                    checked={settings.orientation === val}
                    onChange={() => update({ orientation: val })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Rows per page */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">Γραμμές ανά σελίδα</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Καθορίζει το ύψος κάθε γραμμής. Το ύψος υπολογίζεται αυτόματα από τον διαθέσιμο χώρο.
            </p>
            <Input
              type="number"
              min="1"
              value={rppStr}
              onChange={handleRppChange}
              className="w-32"
              placeholder="π.χ. 25"
            />
            {rppError && (
              <p className="text-xs text-red-500 mt-1">{rppError}</p>
            )}
          </div>

          {/* Column order */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">Σειρά Στηλών</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Σύρετε για αναδιάταξη. Και οι 6 στήλες εκτυπώνονται πάντα.
            </p>
            <DragList
              items={settings.orderedColumns}
              droppableId="columns"
              labels={COLUMN_LABELS}
              onDragEnd={handleColumnDragEnd}
              showArrow={false}
            />
          </div>

          {/* Sort priority */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">Σειρά Ταξινόμησης</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Σύρετε για αλλαγή προτεραιότητας. Πάντα αύξουσα.
            </p>
            <DragList
              items={settings.orderedSortFields}
              droppableId="sort"
              labels={SORT_LABELS}
              onDragEnd={handleSortDragEnd}
              showArrow={true}
            />
          </div>

        </div>

        <DialogFooter className="flex-row items-center justify-between pt-3 border-t dark:border-slate-700 gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Επαναφορά
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
            <Button onClick={handlePrint} disabled={!accounts || accounts.length === 0}>
              <Printer className="h-4 w-4 mr-1.5" />
              Εκτύπωση
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}