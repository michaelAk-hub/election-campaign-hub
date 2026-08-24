import React from 'react';
import { CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function DataGridStatusBar({
    totalRows,
    loadedRows,
    selectedRows = 0,
    status = 'idle', // 'idle', 'saving', 'saved', 'error', 'conflict'
    lastSync = null
}) {
    const statusConfig = {
        idle: { icon: null, text: '', color: '' },
        saving: { icon: Loader2, text: 'Αποθήκευση...', color: 'text-blue-600' },
        saved: { icon: CheckCircle2, text: 'Αποθηκεύτηκε', color: 'text-green-600' },
        error: { icon: AlertCircle, text: 'Σφάλμα', color: 'text-red-600' },
        conflict: { icon: AlertCircle, text: 'Σύγκρουση', color: 'text-yellow-600' }
    };

    const config = statusConfig[status] || statusConfig.idle;
    const StatusIcon = config.icon;

    return (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800 border-t text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-4">
                <span>
                    Εγγραφές: <strong>{loadedRows}</strong> / {totalRows}
                </span>
                {selectedRows > 0 && (
                    <span>
                        Επιλεγμένες: <strong>{selectedRows}</strong>
                    </span>
                )}
            </div>

            <div className="flex items-center gap-4">
                {lastSync && (
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Τελευταίος συγχρονισμός: {new Date(lastSync).toLocaleTimeString('el-GR')}
                    </span>
                )}
                
                {StatusIcon && (
                    <span className={cn("flex items-center gap-1 font-medium", config.color)}>
                        <StatusIcon className={cn("h-4 w-4", status === 'saving' && "animate-spin")} />
                        {config.text}
                    </span>
                )}
            </div>
        </div>
    );
}