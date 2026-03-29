import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Authoritative blank symbol — must match predictionFilterOptions and all other prediction functions
const BLANK_SYMBOL = '(Κενό)';

async function strictAuth(base44, session_token) {
    if (!session_token) return { error: 'Unauthorized: No session token', status: 401 };
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (!sessions?.length) return { error: 'Invalid session', status: 401 };
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) return { error: 'Session expired', status: 401 };
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
    if (!users?.length) return { error: 'User not found', status: 401 };
    const user = users[0];
    if (!user.is_active && user.role !== 'ADMIN') return { error: 'Account inactive', status: 401 };
    if (session.session_version_at_login !== undefined && user.session_version !== undefined &&
        session.session_version_at_login !== user.session_version) return { error: 'Session invalidated', status: 401 };
    if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) return { error: 'Forbidden', status: 403 };
    return { user, session };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));

        const auth = await strictAuth(base44, body.session_token);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!datasets?.length) return Response.json({ symbols: [], academic_levels: [], admission_years: [] });

        const datasetId = datasets[0].id;

        // Use PredictionFilterCache as the authoritative source — same as predictionFilterOptions
        // This ensures Vote Flow and Scenario symbol lists never drift
        const caches = await base44.asServiceRole.entities.PredictionFilterCache.filter({ dataset_id: datasetId });

        if (caches?.length) {
            const cache = caches[0];
            const rawSymbols = cache.symbols_json?.data || [];

            // Same normalization as predictionFilterOptions: empty/null → BLANK_SYMBOL; real "-" stays "-"
            const normalizedSymbols = rawSymbols.map(s => {
                const trimmed = (s ?? '').trim();
                return trimmed !== '' ? trimmed : BLANK_SYMBOL;
            });
            const symbols = [...new Set(normalizedSymbols)].sort();
            // Cache has years_json and departments_json but not academic_levels.
            // For admission_years we can use cache; for academic_levels we must live-scan.
            const admission_years = (cache.years_json?.data || []).sort();

            // Live scan only for academic_levels (not in cache)
            const levelSet = new Set();
            let skip2 = 0;
            while (true) {
                const batch = await base44.asServiceRole.entities.Person.filter({ dataset_id: datasetId }, '-created_date', 500, skip2);
                if (!batch?.length) break;
                for (const p of batch) {
                    if (p.academic_level?.trim()) levelSet.add(p.academic_level.trim());
                }
                if (batch.length < 500) break;
                skip2 += 500;
            }

            return Response.json({ symbols, academic_levels: [...levelSet].sort(), admission_years });
        }

        // Fallback: live scan if cache missing — with identical normalization
        const symbolSet = new Set();
        const levelSet = new Set();
        const yearSet = new Set();

        let skip = 0;
        const batchSize = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter({ dataset_id: datasetId }, '-created_date', batchSize, skip);
            if (!batch?.length) break;

            for (const p of batch) {
                const sym = p.prediction_symbol?.trim();
                symbolSet.add((sym && sym !== '') ? sym : BLANK_SYMBOL);
                if (p.academic_level?.trim()) levelSet.add(p.academic_level.trim());
                if (p.admission_year?.trim()) yearSet.add(p.admission_year.trim());
            }

            if (batch.length < batchSize) break;
            skip += batchSize;
        }

        return Response.json({
            symbols: [...symbolSet].sort(),
            academic_levels: [...levelSet].sort(),
            admission_years: [...yearSet].sort(),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});