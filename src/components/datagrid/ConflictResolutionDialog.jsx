import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from 'lucide-react';

export default function ConflictResolutionDialog({
    open,
    onClose,
    conflict,
    onReloadLatest,
    onOverwrite
}) {
    if (!conflict) return null;

    const { field, yourValue, currentValue, currentRow } = conflict;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="h-5 w-5" />
                        Σύγκρουση Δεδομένων
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Ένας άλλος χρήστης έχει τροποποιήσει αυτή την εγγραφή ενώ εσείς επεξεργαζόσασταν το πεδίο <strong>{field}</strong>.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <div className="text-xs font-medium text-blue-900 mb-2">Η Τιμή Σας</div>
                            <div className="text-sm text-blue-700 font-mono break-words">
                                {yourValue === null || yourValue === undefined ? '(κενό)' : String(yourValue)}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 mb-2">Τρέχουσα Τιμή (από άλλον χρήστη)</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 font-mono break-words">
                                {currentValue === null || currentValue === undefined ? '(κενό)' : String(currentValue)}
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        <strong>Προτείνεται:</strong> Επιλέξτε "Φόρτωση Τελευταίας" για να δείτε όλες τις αλλαγές του άλλου χρήστη,
                        ή "Αντικατάσταση" για να επιβάλετε τη δική σας τιμή.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Ακύρωση
                    </Button>
                    <Button variant="outline" onClick={onReloadLatest}>
                        Φόρτωση Τελευταίας
                    </Button>
                    <Button variant="destructive" onClick={onOverwrite}>
                        Αντικατάσταση
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}