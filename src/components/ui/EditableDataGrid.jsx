import React, { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Phone } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function EditableDataGrid({ 
  data = [], 
  columns = [], 
  onCellUpdate,
  pageSize = 50,
  className 
}) {
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const totalPages = Math.ceil(data.length / pageSize);
  const startIdx = page * pageSize;
  const endIdx = Math.min(startIdx + pageSize, data.length);
  const pageData = data.slice(startIdx, endIdx);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = (rowIdx, colKey, currentValue, row) => {
    setEditingCell({ rowIdx, colKey });
    setEditValue(currentValue ?? '');
  };

  const handleSave = async () => {
    if (!editingCell) return;
    const row = pageData[editingCell.rowIdx];
    const col = columns.find(c => c.key === editingCell.colKey);
    
    let finalValue = editValue;
    if (col.type === 'boolean') {
      finalValue = editValue === 'true' || editValue === true;
    }
    
    await onCellUpdate(row.id, editingCell.colKey, finalValue);
    setEditingCell(null);
  };

  const handleCancel = () => {
    setEditingCell(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const renderCell = (row, col, rowIdx) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colKey === col.key;
    const value = row[col.key];

    if (isEditing) {
      if (col.type === 'boolean') {
        return (
          <div className="flex items-center gap-2 p-2">
            <Switch
              ref={inputRef}
              checked={editValue === true || editValue === 'true'}
              onCheckedChange={(v) => {
                setEditValue(v);
                onCellUpdate(row.id, col.key, v);
                setEditingCell(null);
              }}
            />
            <span className="text-xs text-slate-500">ESC για ακύρωση</span>
          </div>
        );
      }
      
      if (col.type === 'textarea') {
        return (
          <Textarea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="min-h-[60px]"
            rows={2}
          />
        );
      }

      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-8"
        />
      );
    }

    // Display mode
    if (col.render) {
      return col.render(value, row);
    }

    if (col.type === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'} className={value ? 'bg-emerald-100 text-emerald-700' : ''}>
          {value ? 'ΝΑΙ' : 'ΟΧΙ'}
        </Badge>
      );
    }

    if (col.key === 'mobile_phone' && value) {
      return (
        <a href={`tel:${value}`} className="text-blue-600 hover:underline flex items-center gap-1">
          <Phone className="h-3 w-3" /> {value}
        </a>
      );
    }

    return <span className="truncate block">{value || '-'}</span>;
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageData.map((row, rowIdx) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={`${row.id}-${col.key}`}
                      className="px-4 py-2 text-sm text-slate-900 cursor-pointer hover:bg-blue-50 transition-colors"
                      onClick={() => !col.readonly && handleCellClick(rowIdx, col.key, row[col.key], row)}
                    >
                      {renderCell(row, col, rowIdx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Εμφάνιση {startIdx + 1}-{endIdx} από {data.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-4 py-2 text-sm">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}