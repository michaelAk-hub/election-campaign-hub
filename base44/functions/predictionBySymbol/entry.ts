import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!activeDatasets?.length) {
            return Response.json({ rows: [], meta: { symbol_count: 0, cache_missing: false, generated_at: new Date().toISOString() } });
        }

        const datasetId = activeDatasets[0].id;

        // Load all symbol cache rows for this dataset
        let allRows = [];
        let skip = 0;
        const limit = 200;
        while (true) {
            const batch = await base44.asServiceRole.entities.PredictionStatsBySymbol.filter(
                { dataset_id: datasetId }, null, limit, skip
            );
            if (!batch?.length) break;
            allRows = allRows.concat(batch);
            if (batch.length < limit) break;
            skip += limit;
        }

        if (!allRows.length) {
            return Response.json({ rows: [], meta: { symbol_count: 0, cache_missing: true, generated_at: new Date().toISOString() } });
        }

        // Apply optional filters if passed
        const symbolFilter = body.symbol || null;
        if (symbolFilter) {
            const symbols = symbolFilter.split(',').map(s => s.trim());
            allRows = allRows.filter(r => symbols.includes(r.symbol));
        }

        const rows = allRows.map(r => ({
            symbol: r.symbol,
            total: r.total || 0,
            voted_yes: r.voted_yes || 0,
            voted_no: r.voted_no || 0,
        })).sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return a.symbol.localeCompare(b.symbol, 'el');
        });

        return Response.json({
            rows,
            meta: {
                symbol_count: rows.length,
                cache_missing: false,
                generated_at: allRows[0]?.updated_at || new Date().toISOString(),
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});