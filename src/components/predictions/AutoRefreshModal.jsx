import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from 'lucide-react';

// Manual-only refresh — no interval scheduling
export default function AutoRefreshModal({ open, onClose, onRefreshNow }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Ανανέωση Δεδομένων</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Πατήστε το παρακάτω κουμπί για να φορτωθούν ξανά τα δεδομένα.
                    </p>
                    <Button
                        className="w-full"
                        onClick={() => { onRefreshNow(); onClose(); }}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Ανανέωση Τώρα
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Κλείσιμο</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}