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

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ rows: [], meta: { symbol_count: 0, generated_at: new Date().toISOString() } });
        }

        const datasetId = activeDatasets[0].id;

        // Read from cache
        const symbolStats = await base44.asServiceRole.entities.PredictionStatsBySymbol.filter(
            { dataset_id: datasetId }, 'symbol', 100
        );

        const rows = (symbolStats || [])
            .map(s => ({ symbol: s.symbol, total: s.total || 0, voted_yes: s.voted_yes || 0, voted_no: s.voted_no || 0 }))
            .sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                return a.symbol.localeCompare(b.symbol, 'el');
            });

        return Response.json({
            rows,
            meta: { symbol_count: rows.length, generated_at: new Date().toISOString() }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});