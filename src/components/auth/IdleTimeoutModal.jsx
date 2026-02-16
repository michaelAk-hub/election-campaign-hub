import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function IdleTimeoutModal({ open, onContinue, onLogout, remainingSeconds }) {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <DialogTitle>Η συνεδρία σας θα λήξει σύντομα</DialogTitle>
                            <DialogDescription>
                                Λόγω αδράνειας, η συνεδρία σας θα λήξει σε:
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="py-6">
                    <div className="text-center">
                        <div className="text-5xl font-bold text-slate-900 mb-2">
                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                        </div>
                        <p className="text-sm text-slate-600">
                            Κάντε κλικ στο "Συνέχεια" για να παραμείνετε συνδεδεμένοι
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={onLogout}
                        className="w-full sm:w-auto"
                    >
                        Αποσύνδεση
                    </Button>
                    <Button
                        onClick={onContinue}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                    >
                        Συνέχεια
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}