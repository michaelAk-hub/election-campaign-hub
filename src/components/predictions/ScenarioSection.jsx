import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from 'lucide-react';
import ScenarioCard from './ScenarioCard';
import ScenarioFormModal from './ScenarioFormModal';
import ScenarioDetailModal from './ScenarioDetailModal';

export default function ScenarioSection({ sessionToken, refreshSignal }) {
    const [scenarios, setScenarios] = useState([]);
    const [results, setResults] = useState({}); // keyed by scenario.id
    const [loadingResults, setLoadingResults] = useState({});
    const [resultErrors, setResultErrors] = useState({}); // keyed by scenario.id
    const [sessionExpired, setSessionExpired] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editScenario, setEditScenario] = useState(null);
    const [detailScenario, setDetailScenario] = useState(null);
    const [detailResult, setDetailResult] = useState(null);

    const is401 = (e) => e?.response?.status === 401 || e?.status === 401;
    const is502 = (e) => e?.response?.status === 502 || e?.status === 502 ||
        (typeof e?.message === 'string' && (e.message.includes('502') || e.message.toLowerCase().includes('bad gateway')));

    const loadScenarios = useCallback(async () => {
        if (!sessionToken) {
            console.warn('[ScenarioSection] loadScenarios: sessionToken is missing, skipping.');
            return;
        }
        console.log('[ScenarioSection] loadScenarios: token present, fetching list...');
        try {
            const { data } = await base44.functions.invoke('scenarioList', { session_token: sessionToken });
            if (data?.error === 'Unauthorized' || data?.status === 401) {
                setSessionExpired(true);
                return;
            }
            const list = data?.scenarios || [];
            setScenarios(list);
            return list;
        } catch (e) {
            if (is401(e)) {
                console.warn('[ScenarioSection] scenarioList returned 401 — session expired.');
                setSessionExpired(true);
                return;
            }
            throw e;
        }
    }, [sessionToken]);

    const calculateAll = useCallback(async (list) => {
        if (!sessionToken) {
            console.warn('[ScenarioSection] calculateAll: sessionToken is missing, skipping.');
            return;
        }
        const ids = (list || []).map(s => s.id);
        // Mark all as loading upfront
        const loadingMap = {};
        ids.forEach(id => loadingMap[id] = true);
        setLoadingResults(loadingMap);
        setResultErrors({});

        // Sequential — one at a time so a 502 on one doesn't block others
        for (const id of ids) {
            try {
                console.log(`[ScenarioSection] scenarioCalculate: scenario ${id} (sequential)`);
                const { data } = await base44.functions.invoke('scenarioCalculate', { session_token: sessionToken, scenario_id: id });
                if (data?.error === 'Unauthorized' || data?.status === 401) {
                    setSessionExpired(true);
                    setLoadingResults(prev => ({ ...prev, [id]: false }));
                    continue;
                }
                if (data?.error) {
                    setResultErrors(prev => ({ ...prev, [id]: data.message || data.error }));
                } else {
                    setResults(prev => ({ ...prev, [id]: data }));
                }
            } catch (e) {
                if (is401(e)) {
                    console.warn(`[ScenarioSection] scenarioCalculate 401 for scenario ${id}`);
                    setSessionExpired(true);
                    setLoadingResults(prev => ({ ...prev, [id]: false }));
                    continue;
                }
                if (is502(e)) {
                    console.warn(`[ScenarioSection] scenarioCalculate 502 for scenario ${id}`);
                    setResultErrors(prev => ({ ...prev, [id]: 'Προσωρινό σφάλμα υπολογισμού (gateway error). Δοκιμάστε ξανά σε λίγο.' }));
                } else {
                    setResultErrors(prev => ({ ...prev, [id]: e.message || 'Σφάλμα υπολογισμού' }));
                }
            } finally {
                setLoadingResults(prev => ({ ...prev, [id]: false }));
            }
        }
    }, [sessionToken]);

    const refresh = useCallback(async () => {
        if (!sessionToken) {
            console.warn('[ScenarioSection] refresh: no sessionToken, aborting.');
            return;
        }
        console.log('[ScenarioSection] refresh: starting...');
        const list = await loadScenarios();
        if (list?.length) await calculateAll(list);
    }, [loadScenarios, calculateAll, sessionToken]);

    // Reset expired state if token changes (e.g. re-login)
    useEffect(() => { setSessionExpired(false); }, [sessionToken]);

    useEffect(() => { refresh(); }, [refresh, refreshSignal]);

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
                console.warn('[ScenarioSection] scenarioDelete 401 — session expired.');
                setSessionExpired(true);
            } else if (status === 404) {
                // Already gone — clean up stale row
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

    if (sessionExpired || !sessionToken) {
        return (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Η συνεδρία έχει λήξει. Παρακαλώ ανανεώστε τη σελίδα για να συνδεθείτε ξανά.
            </div>
        );
    }

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