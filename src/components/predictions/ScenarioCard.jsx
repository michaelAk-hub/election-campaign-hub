import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Loader2, AlertCircle } from 'lucide-react';

export default function ScenarioCard({ scenario, result, loading, error, onEdit, onDelete, onView }) {
    const parties = result?.parties || [];
    const totalVotes = result?.total_predicted_votes || 0;

    return (
        <Card className="relative border-2 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                        {scenario.name}
                    </CardTitle>
                    <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(scenario)}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(scenario)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                    {scenario.total_seats} έδρες · {result ? `${result.actual_voted_count?.toLocaleString('el-GR')} ψήφοι` : ''}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 py-4 px-1 text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-xs">{error}</span>
                    </div>
                ) : parties.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-4">Δεν υπάρχουν δεδομένα</div>
                ) : (
                    <div className="space-y-2 mt-1">
                        {parties.map((party, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: party.color || '#6b7280' }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                                        <span className="truncate">{party.name}</span>
                                        <div className="flex gap-2 shrink-0 text-right">
                                            <span className="text-slate-500">{party.percentage?.toFixed(1)}%</span>
                                            <span className="font-bold">{party.seats?.toFixed(2)} έδρ.</span>
                                        </div>
                                    </div>
                                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${Math.min(party.percentage || 0, 100)}%`, backgroundColor: party.color || '#6b7280' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!error && result && (
                    <button
                        onClick={() => onView(scenario, result)}
                        className="mt-3 w-full text-xs text-blue-600 hover:underline text-center"
                    >
                        Αναλυτικά →
                    </button>
                )}
            </CardContent>
        </Card>
    );
}