import React, { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Check, X, Loader2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EditableDataGrid({ 
  data, 
  columns, 
  onUpdate,
  isUpdating,
  onColumnReorder
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const handleCellClick = (rowId, colKey, currentValue) => {
    setEditingCell({ rowId, colKey });
    setEditValue(currentValue ?? '');
  };

  const handleSave = async () => {
    if (!editingCell) return;
    
    const row = data.find(r => r.id === editingCell.rowId);
    const col = columns.find(c => c.key === editingCell.colKey);
    
    let finalValue = editValue;
    if (col.type === 'boolean') {
      finalValue = editValue === 'true' || editValue === true;
    }
    
    if (finalValue !== row[editingCell.colKey]) {
      await onUpdate(editingCell.rowId, { [editingCell.colKey]: finalValue });
    }
    
    setEditingCell(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination || !onColumnReorder) return;
    onColumnReorder(result.source.index, result.destination.index);
  };

  return (
    <div className="overflow-x-auto border rounded-lg bg-white">
      <table className="w-full border-collapse">
        <DragDropContext onDragEnd={handleDragEnd}>
          <thead>
            <tr className="bg-slate-50 border-b">
              <Droppable droppableId="columns" direction="horizontal">
                {(provided) => (
                  <th 
                    ref={provided.innerRef} 
                    {...provided.droppableProps}
                    className="contents"
                  >
                    {columns.map((col, index) => (
                      <Draggable key={col.key} draggableId={col.key} index={index}>
                        {(provided, snapshot) => (
                          <th
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "px-3 py-3 text-left text-xs font-semibold text-slate-700 border-r last:border-r-0 sticky top-0 bg-slate-50 z-10",
                              snapshot.isDragging && "bg-slate-200 shadow-lg"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-4 w-4 text-slate-400" />
                              </span>
                              {col.label}
                            </div>
                          </th>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </th>
                )}
              </Droppable>
            </tr>
          </thead>
        </DragDropContext>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b hover:bg-slate-50/50">
              {columns.map((col) => {
                const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key;
                const cellValue = row[col.key];
                
                return (
                  <td 
                    key={`${row.id}-${col.key}`}
                    className={cn(
                      "px-3 py-2 text-sm border-r last:border-r-0 relative group",
                      isEditing && "p-0"
                    )}
                    onClick={() => !isEditing && handleCellClick(row.id, col.key, cellValue)}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1 p-2">
                        {col.type === 'boolean' ? (
                          <Switch
                            checked={editValue === true || editValue === 'true'}
                            onCheckedChange={(checked) => {
                              setEditValue(checked);
                              setTimeout(() => {
                                onUpdate(row.id, { [col.key]: checked });
                                setEditingCell(null);
                              }, 100);
                            }}
                          />
                        ) : col.type === 'textarea' ? (
                          <Textarea
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="min-h-[60px] text-sm"
                            rows={2}
                          />
                        ) : (
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSave}
                            className="h-8 text-sm"
                          />
                        )}
                        {col.type !== 'boolean' && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={handleSave}
                              className="p-1 hover:bg-green-100 rounded text-green-600"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancel}
                              className="p-1 hover:bg-red-100 rounded text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="min-h-[24px] cursor-pointer hover:bg-blue-50/50 -m-2 p-2 rounded">
                        {col.render ? col.render(cellValue, row) : (
                          <span className="text-slate-700">
                            {cellValue === true ? '✓' : cellValue === false ? '✗' : (cellValue || '-')}
                          </span>
                        )}
                      </div>
                    )}
                    {isUpdating === row.id && (
                      <div className="absolute inset-0 bg-blue-50/50 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}