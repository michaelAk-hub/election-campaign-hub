import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw } from 'lucide-react';

function secToHMS(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { h, m, s };
}

function hmsTosec(h, m, s) {
    return (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
}

export default function AutoRefreshModal({ open, onClose, settings, onSave, onRefreshNow }) {
    const [enabled, setEnabled] = useState(settings.enabled);
    const [h, setH] = useState(0);
    const [m, setM] = useState(0);
    const [s, setS] = useState(30);

    useEffect(() => {
        if (open) {
            setEnabled(settings.enabled);
            const hms = secToHMS(settings.intervalSec);
            setH(hms.h);
            setM(hms.m);
            setS(hms.s);
        }
    }, [open, settings]);

    const handleSave = () => {
        const totalSec = Math.max(10, hmsTosec(h, m, s));
        onSave({ enabled, intervalSec: totalSec });
        onClose();
    };

    const totalSec = hmsTosec(h, m, s);
    const tooShort = totalSec < 10;

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
                        <Label className="text-sm">Διάστημα ανανέωσης</Label>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    min={0}
                                    value={h}
                                    onChange={e => setH(e.target.value)}
                                    disabled={!enabled}
                                    placeholder="0"
                                />
                                <p className="text-xs text-slate-400 text-center mt-0.5">ώρες</p>
                            </div>
                            <span className="text-slate-400 font-bold pb-4">:</span>
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={m}
                                    onChange={e => setM(e.target.value)}
                                    disabled={!enabled}
                                    placeholder="0"
                                />
                                <p className="text-xs text-slate-400 text-center mt-0.5">λεπτά</p>
                            </div>
                            <span className="text-slate-400 font-bold pb-4">:</span>
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={s}
                                    onChange={e => setS(e.target.value)}
                                    disabled={!enabled}
                                    placeholder="30"
                                />
                                <p className="text-xs text-slate-400 text-center mt-0.5">δευτ.</p>
                            </div>
                        </div>
                        {tooShort && enabled && (
                            <p className="text-xs text-red-500">Ελάχιστο: 10 δευτερόλεπτα</p>
                        )}
                        {!tooShort && enabled && (
                            <p className="text-xs text-slate-400">Σύνολο: {totalSec} δευτερόλεπτα</p>
                        )}
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
                    <Button onClick={handleSave} disabled={enabled && tooShort}>Εφαρμογή</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}