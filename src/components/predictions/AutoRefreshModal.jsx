import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw } from 'lucide-react';

// Minimum allowed interval in seconds to prevent abuse
const MIN_INTERVAL_SECONDS = 10;

export default function AutoRefreshModal({ open, onClose, settings, onApply, onRefreshNow }) {
    const [enabled, setEnabled] = useState(settings.enabled);
    const [hours, setHours] = useState(String(settings.hours));
    const [minutes, setMinutes] = useState(String(settings.minutes));
    const [seconds, setSeconds] = useState(String(settings.seconds));
    const [error, setError] = useState('');

    // Sync local state when modal opens with current settings
    useEffect(() => {
        if (open) {
            setEnabled(settings.enabled);
            setHours(String(settings.hours));
            setMinutes(String(settings.minutes));
            setSeconds(String(settings.seconds));
            setError('');
        }
    }, [open, settings]);

    const parsePositiveInt = (val, fallback = 0) => {
        const n = parseInt(val, 10);
        return isNaN(n) || n < 0 ? fallback : n;
    };

    const getTotalSeconds = () => {
        return parsePositiveInt(hours) * 3600
            + parsePositiveInt(minutes) * 60
            + parsePositiveInt(seconds);
    };

    const handleApply = () => {
        const total = getTotalSeconds();
        if (enabled && total < MIN_INTERVAL_SECONDS) {
            setError(`Το ελάχιστο διάστημα είναι ${MIN_INTERVAL_SECONDS} δευτερόλεπτα.`);
            return;
        }
        setError('');
        onApply({
            enabled,
            hours: parsePositiveInt(hours),
            minutes: parsePositiveInt(minutes),
            seconds: parsePositiveInt(seconds),
        });
        onClose();
    };

    const handleRefreshNow = () => {
        onRefreshNow();
    };

    const inputClass = "w-16 text-center";

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Ρυθμίσεις Ανανέωσης</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* ON/OFF toggle */}
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Αυτόματη Ανανέωση</Label>
                        <Switch checked={enabled} onCheckedChange={setEnabled} />
                    </div>

                    {/* Interval inputs */}
                    <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
                        <Label className="text-xs text-slate-500 mb-2 block">Διάστημα Ανανέωσης</Label>
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-center gap-1">
                                <Input
                                    type="number"
                                    min={0}
                                    value={hours}
                                    onChange={e => setHours(e.target.value)}
                                    className={inputClass}
                                />
                                <span className="text-xs text-slate-400">ώρες</span>
                            </div>
                            <span className="text-slate-400 font-bold pb-4">:</span>
                            <div className="flex flex-col items-center gap-1">
                                <Input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={minutes}
                                    onChange={e => setMinutes(e.target.value)}
                                    className={inputClass}
                                />
                                <span className="text-xs text-slate-400">λεπτά</span>
                            </div>
                            <span className="text-slate-400 font-bold pb-4">:</span>
                            <div className="flex flex-col items-center gap-1">
                                <Input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={seconds}
                                    onChange={e => setSeconds(e.target.value)}
                                    className={inputClass}
                                />
                                <span className="text-xs text-slate-400">δευτ.</span>
                            </div>
                        </div>
                        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                    </div>

                    {/* Refresh Now */}
                    <Button variant="outline" className="w-full" onClick={handleRefreshNow}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Ανανέωση Τώρα
                    </Button>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
                    <Button onClick={handleApply}>Εφαρμογή</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}