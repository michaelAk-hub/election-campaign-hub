import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from 'lucide-react';
import ScenarioCard from './ScenarioCard';
import ScenarioFormModal from './ScenarioFormModal';
import ScenarioDetailModal from './ScenarioDetailModal';

export default function ScenarioSection({ sessionToken, refreshSignal }) {
    const [scenarios, setScenarios] = useState([]);
    const [results, setResults] = useState({});
    const [loadingResults, setLoadingResults] = useState({});
    const [resultErrors, setResultErrors] = useState({});
    const [showForm, setShowForm] = useState(false);
    const [editScenario, setEditScenario] = useState(null);
    const [detailScenario, setDetailScenario] = useState(null);
    const [detailResult, setDetailResult] = useState(null);

    const loadScenarios = useCallback(async () => {
        if (!sessionToken) return;
        const { data } = await base44.functions.invoke('scenarioList', { session_token: sessionToken });
        const list = data?.scenarios || [];
        setScenarios(list);
        return list;
    }, [sessionToken]);

    const calculateAll = useCallback(async (list) => {
        const ids = (list || []).map(s => s.id);
        const loadingMap = {};
        ids.forEach(id => loadingMap[id] = true);
        setLoadingResults(loadingMap);
        setResultErrors({});

        await Promise.all(ids.map(async (id) => {
            try {
                const { data } = await base44.functions.invoke('scenarioCalculate', { session_token: sessionToken, scenario_id: id });
                if (data?.error) {
                    setResultErrors(prev => ({ ...prev, [id]: data.message || data.error }));
                } else {
                    setResults(prev => ({ ...prev, [id]: data }));
                }
            } catch (e) {
                setResultErrors(prev => ({ ...prev, [id]: e.message || 'Σφάλμα υπολογισμού' }));
            } finally {
                setLoadingResults(prev => ({ ...prev, [id]: false }));
            }
        }));
    }, [sessionToken]);

    const refresh = useCallback(async () => {
        const list = await loadScenarios();
        if (list?.length) await calculateAll(list);
    }, [loadScenarios, calculateAll]);

    useEffect(() => { refresh(); }, [refresh, refreshSignal]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(refresh, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [refresh]);

    const removeScenarioFromState = (id) => {
        setScenarios(prev => prev.filter(s => s.id !== id));
        setResults(prev => { const n = { ...prev }; delete n[id]; return n; });
        setLoadingResults(prev => { const n = { ...prev }; delete n[id]; return n; });
        setResultErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const handleDelete = async (scenario) => {
        if (!confirm(`Διαγραφή "${scenario.name}";`)) return;
        try {
            await base44.functions.invoke('scenarioDelete', { session_token: sessionToken, scenario_id: scenario.id });
            removeScenarioFromState(scenario.id);
        } catch (err) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.message;
            if (status === 401) {
                alert('Η συνεδρία σας έχει λήξει. Παρακαλώ συνδεθείτε ξανά.');
            } else if (status === 404) {
                removeScenarioFromState(scenario.id);
            } else if (status === 500) {
                alert('Σφάλμα διακομιστή κατά τη διαγραφή. Παρακαλώ δοκιμάστε ξανά.');
            } else {
                alert(msg || 'Αποτυχία διαγραφής. Παρακαλώ δοκιμάστε ξανά.');
            }
        }
    };

    const handleEdit = (scenario) => { setEditScenario(scenario); setShowForm(true); };
    const handleNew = () => { setEditScenario(null); setShowForm(true); };
    const handleView = (scenario, result) => { setDetailScenario(scenario); setDetailResult(result); };

    const atMax = scenarios.length >= 4;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Προβλέψεις Σεναρίων</h2>
                <Button
                    onClick={handleNew}
                    disabled={atMax}
                    className="h-9"
                    title={atMax ? 'Υπάρχουν ήδη 4 σενάρια. Διαγράψτε ένα πρώτα.' : ''}
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Δημιουργία Πρόβλεψης
                </Button>
            </div>

            {atMax && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Έχετε φτάσει το μέγιστο των 4 σεναρίων. Διαγράψτε ένα για να δημιουργήσετε νέο.
                </div>
            )}

            {scenarios.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm border rounded-xl border-dashed">
                    Δεν υπάρχουν αποθηκευμένα σενάρια πρόβλεψης.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {scenarios.map(s => (
                        <ScenarioCard
                            key={s.id}
                            scenario={s}
                            result={results[s.id]}
                            loading={!!loadingResults[s.id]}
                            error={resultErrors[s.id] || null}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onView={handleView}
                        />
                    ))}
                </div>
            )}

            <ScenarioFormModal
                open={showForm}
                onClose={() => setShowForm(false)}
                onSaved={refresh}
                editScenario={editScenario}
                sessionToken={sessionToken}
            />

            <ScenarioDetailModal
                open={!!detailScenario}
                onClose={() => setDetailScenario(null)}
                scenario={detailScenario}
                result={detailResult}
            />
        </div>
    );
}