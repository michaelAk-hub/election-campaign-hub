import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw } from 'lucide-react';

export default function AutoRefreshModal({ open, onClose, settings, onSave, onRefreshNow }) {
    const [enabled, setEnabled] = useState(settings.enabled);
    const [intervalSec, setIntervalSec] = useState(String(settings.intervalSec));

    // Resync local state every time the modal opens or settings change externally
    useEffect(() => {
        if (open) {
            setEnabled(settings.enabled);
            setIntervalSec(String(settings.intervalSec));
        }
    }, [open, settings]);

    const handleSave = () => {
        const sec = Math.max(10, parseInt(intervalSec, 10) || 30);
        onSave({ enabled, intervalSec: sec });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Ρυθμίσεις Αυτόματης Ανανέωσης</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Αυτόματη Ανανέωση</Label>
                        <Switch checked={enabled} onCheckedChange={setEnabled} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Διάστημα ανανέωσης (δευτερόλεπτα)</Label>
                        <Input
                            type="number"
                            min={10}
                            value={intervalSec}
                            onChange={e => setIntervalSec(e.target.value)}
                            disabled={!enabled}
                            className="w-full"
                            placeholder="30"
                        />
                        <p className="text-xs text-slate-400">Ελάχιστο: 10 δευτερόλεπτα</p>
                    </div>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => { onRefreshNow(); onClose(); }}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Ανανέωση Τώρα
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
                    <Button onClick={handleSave}>Εφαρμογή</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}