import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const queryParams = new URLSearchParams(body.queryParams || '');
        const sessionToken = queryParams.get('session_token');

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized: No session token' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Invalid session' }, { status: 401 });

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return Response.json({ error: 'Session expired' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (!users?.length) return Response.json({ error: 'User not found' }, { status: 401 });
        const user = users[0];
        if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!activeDatasets?.length) {
            return Response.json({ rows: [], meta: { generated_at: new Date().toISOString() } });
        }

        const datasetId = activeDatasets[0].id;

        // Read from cache — fetch up to 500 rows (covers all year+symbol combos)
        const yearSymbolStats = await base44.asServiceRole.entities.PredictionStatsByYearSymbol.filter(
            { dataset_id: datasetId }, 'admission_year', 500
        );

        // Defensive deduplication: merge by admission_year + symbol in case stale duplicates survived
        const merged = {};
        for (const s of (yearSymbolStats || [])) {
            const key = `${s.admission_year}::${s.symbol}`;
            if (!merged[key]) {
                merged[key] = { admission_year: s.admission_year, symbol: s.symbol, total: 0, voted_yes: 0, voted_no: 0 };
            }
            merged[key].total += s.total || 0;
            merged[key].voted_yes += s.voted_yes || 0;
            merged[key].voted_no += s.voted_no || 0;
        }

        const rows = Object.values(merged).sort((a, b) => {
            if (a.admission_year !== b.admission_year) {
                if (a.admission_year === '(Άγνωστο)') return 1;
                if (b.admission_year === '(Άγνωστο)') return -1;
                return b.admission_year.localeCompare(a.admission_year);
            }
            if (b.total !== a.total) return b.total - a.total;
            return a.symbol.localeCompare(b.symbol, 'el');
        });

        return Response.json({
            rows,
            meta: { generated_at: new Date().toISOString() }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});