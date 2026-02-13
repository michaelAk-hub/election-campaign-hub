import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2 } from 'lucide-react';

export default function AccessLikeGrid({
    data,
    columns,
    onCellEdit,
    onCellCommit,
    loading,
    rowKeyField = 'id',
    savingCells = {},
    errorCells = {},
    conflictCells = {},
    columnOrder,
    columnSizing,
    columnVisibility,
    onColumnOrderChange,
    onColumnSizingChange,
    onColumnVisibilityChange
}) {
    const [activeCell, setActiveCell] = useState(null);
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');
    const tableRef = useRef(null);
    const inputRef = useRef(null);

    const orderedColumns = useMemo(() => {
        if (!columnOrder || columnOrder.length === 0) return columns;
        const ordered = [];
        columnOrder.forEach(colId => {
            const col = columns.find(c => c.id === colId);
            if (col) ordered.push(col);
        });
        // Add any columns not in order
        columns.forEach(col => {
            if (!ordered.find(c => c.id === col.id)) {
                ordered.push(col);
            }
        });
        return ordered;
    }, [columns, columnOrder]);

    const table = useReactTable({
        data,
        columns: orderedColumns,
        getCoreRowModel: getCoreRowModel(),
        state: {
            columnSizing,
            columnVisibility
        },
        onColumnSizingChange,
        columnResizeMode: 'onChange',
        enableColumnResizing: true
    });

    // Focus input when editing
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCell]);

    const handleCellClick = (rowIndex, columnId, value) => {
        const col = orderedColumns.find(c => c.id === columnId);
        if (col && !col.editable) return;
        
        setActiveCell({ rowIndex, columnId });
    };

    const handleCellDoubleClick = (rowIndex, columnId, value) => {
        const col = orderedColumns.find(c => c.id === columnId);
        if (col && !col.editable) return;

        setEditingCell({ rowIndex, columnId });
        setEditValue(value === null || value === undefined ? '' : String(value));
    };

    const handleKeyDown = (e, rowIndex, columnId) => {
        const col = orderedColumns.find(c => c.id === columnId);
        
        if (editingCell) {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
                moveDown();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                commitEdit();
                if (e.shiftKey) {
                    moveLeft();
                } else {
                    moveRight();
                }
            }
        } else {
            if (e.key === 'Enter' && col?.editable) {
                e.preventDefault();
                handleCellDoubleClick(rowIndex, columnId, data[rowIndex][columnId]);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveDown();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveUp();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveRight();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveLeft();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    moveLeft();
                } else {
                    moveRight();
                }
            } else if (col?.editable && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
                // Start editing on typing
                handleCellDoubleClick(rowIndex, columnId, '');
                setEditValue(e.key);
            }
        }
    };

    const commitEdit = () => {
        if (!editingCell) return;
        const { rowIndex, columnId } = editingCell;
        const row = data[rowIndex];
        const oldValue = row[columnId];
        
        if (editValue !== String(oldValue)) {
            const col = orderedColumns.find(c => c.id === columnId);
            let parsedValue = editValue;
            
            // Type conversion
            if (col?.type === 'number') {
                parsedValue = editValue === '' ? null : Number(editValue);
            } else if (col?.type === 'boolean') {
                parsedValue = editValue === 'true' || editValue === '1';
            }
            
            onCellCommit(row[rowKeyField], columnId, parsedValue, row.row_version);
        }
        
        setEditingCell(null);
    };

    const cancelEdit = () => {
        setEditingCell(null);
    };

    const moveDown = () => {
        if (!activeCell) return;
        const newRow = Math.min(activeCell.rowIndex + 1, data.length - 1);
        setActiveCell({ ...activeCell, rowIndex: newRow });
    };

    const moveUp = () => {
        if (!activeCell) return;
        const newRow = Math.max(activeCell.rowIndex - 1, 0);
        setActiveCell({ ...activeCell, rowIndex: newRow });
    };

    const moveRight = () => {
        if (!activeCell) return;
        const visibleCols = orderedColumns.filter(c => columnVisibility?.[c.id] !== false);
        const currentIndex = visibleCols.findIndex(c => c.id === activeCell.columnId);
        if (currentIndex < visibleCols.length - 1) {
            setActiveCell({ ...activeCell, columnId: visibleCols[currentIndex + 1].id });
        } else {
            // Wrap to next row
            moveDown();
            setActiveCell({ rowIndex: Math.min(activeCell.rowIndex + 1, data.length - 1), columnId: visibleCols[0].id });
        }
    };

    const moveLeft = () => {
        if (!activeCell) return;
        const visibleCols = orderedColumns.filter(c => columnVisibility?.[c.id] !== false);
        const currentIndex = visibleCols.findIndex(c => c.id === activeCell.columnId);
        if (currentIndex > 0) {
            setActiveCell({ ...activeCell, columnId: visibleCols[currentIndex - 1].id });
        } else {
            // Wrap to previous row
            if (activeCell.rowIndex > 0) {
                setActiveCell({ rowIndex: activeCell.rowIndex - 1, columnId: visibleCols[visibleCols.length - 1].id });
            }
        }
    };

    return (
        <div className="border rounded-lg overflow-hidden" ref={tableRef}>
            <div className="overflow-auto" style={{ maxHeight: '600px' }}>
                <table className="w-full border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th
                                        key={header.id}
                                        className="px-3 py-2 text-left text-xs font-medium text-slate-600 border-b border-r relative"
                                        style={{ width: header.getSize() }}
                                    >
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        <div
                                            onMouseDown={header.getResizeHandler()}
                                            onTouchStart={header.getResizeHandler()}
                                            className={cn(
                                                "absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500",
                                                header.column.getIsResizing() && "bg-blue-500"
                                            )}
                                        />
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={orderedColumns.length} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={orderedColumns.length} className="text-center py-8 text-slate-500">
                                    Δεν βρέθηκαν εγγραφές
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row, rowIndex) => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                    {row.getVisibleCells().map(cell => {
                                        const columnId = cell.column.id;
                                        const isActive = activeCell?.rowIndex === rowIndex && activeCell?.columnId === columnId;
                                        const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;
                                        const cellKey = `${row.original[rowKeyField]}_${columnId}`;
                                        const isSaving = savingCells[cellKey];
                                        const hasError = errorCells[cellKey];
                                        const hasConflict = conflictCells[cellKey];
                                        const col = orderedColumns.find(c => c.id === columnId);

                                        return (
                                            <td
                                                key={cell.id}
                                                className={cn(
                                                    "px-3 py-2 border-b border-r text-sm relative",
                                                    isActive && "ring-2 ring-blue-500 ring-inset",
                                                    hasError && "bg-red-50",
                                                    hasConflict && "bg-yellow-50",
                                                    !col?.editable && "bg-slate-50 text-slate-500"
                                                )}
                                                onClick={() => handleCellClick(rowIndex, columnId, cell.getValue())}
                                                onDoubleClick={() => handleCellDoubleClick(rowIndex, columnId, cell.getValue())}
                                                onKeyDown={(e) => handleKeyDown(e, rowIndex, columnId)}
                                                tabIndex={0}
                                            >
                                                {isEditing ? (
                                                    <Input
                                                        ref={inputRef}
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onBlur={commitEdit}
                                                        className="h-7 px-1 -mx-1"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                                                        {isSaving && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                                                    </div>
                                                )}
                                                {hasError && (
                                                    <div className="absolute top-0 right-0 w-0 h-0 border-t-8 border-r-8 border-t-red-500 border-r-transparent" />
                                                )}
                                                {hasConflict && (
                                                    <div className="absolute top-0 right-0 w-0 h-0 border-t-8 border-r-8 border-t-yellow-500 border-r-transparent" />
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}