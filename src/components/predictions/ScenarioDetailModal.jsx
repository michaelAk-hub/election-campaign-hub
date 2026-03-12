import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ScenarioDetailModal({ open, onClose, scenario, result }) {
    if (!scenario || !result) return null;
    const parties = result.parties || [];
    const groups = result.group_breakdown || [];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold">{scenario.name}</DialogTitle>
                    <div className="text-sm text-slate-500">
                        {scenario.total_seats} έδρες · Σύνολο Ψήφων: {Math.round(result.total_predicted_votes)} · Μέτρο: {result.quota?.toFixed(2)}
                    </div>
                </DialogHeader>

                {/* Party table */}
                <div className="mt-4">
                    <h3 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Αποτελέσματα ανά Παράταξη</h3>
                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Παράταξη</TableHead>
                                    <TableHead>Σύμβολα / Πολ/στές</TableHead>
                                    <TableHead className="text-right">Ψήφοι</TableHead>
                                    <TableHead className="text-right">%</TableHead>
                                    <TableHead className="text-right">Έδρες</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parties.map((party, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: party.color || '#6b7280' }} />
                                                <span className="font-medium">{party.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {(party.symbolDetails || []).map((sd, i) => (
                                                    <Badge key={i} variant="outline" className="text-xs">
                                                        {sd.symbol} ×{sd.multiplier} ({sd.voted_count})
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{party.predictedVotes?.toFixed(1)}</TableCell>
                                        <TableCell className="text-right font-bold">{party.percentage?.toFixed(2)}%</TableCell>
                                        <TableCell className="text-right font-bold text-blue-700 dark:text-blue-400">{party.seats?.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* Academic group breakdown */}
                {groups.length > 0 && (
                    <div className="mt-6">
                        <h3 className="font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300">Ανάλυση ανά Ακαδ. Ομάδα</h3>
                        <div className="space-y-4">
                            {groups.map((group, gi) => (
                                <div key={gi} className="rounded-lg border overflow-hidden">
                                    <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 flex items-center justify-between">
                                        <span className="font-medium text-sm">{group.group_name}</span>
                                        <span className="text-xs text-slate-500">{group.total_persons} ψήφοι · {group.global_share_percent?.toFixed(1)}% του συνόλου</span>
                                    </div>
                                    <Table>
                                        <TableBody>
                                            {(group.party_results || []).map((pr, pi) => (
                                                <TableRow key={pi}>
                                                    <TableCell className="text-sm">{pr.name}</TableCell>
                                                    <TableCell className="text-right text-sm">{pr.predictedVotes?.toFixed(1)}</TableCell>
                                                    <TableCell className="text-right text-sm font-bold">{pr.percentage?.toFixed(2)}%</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}