import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const sessionToken = body.session_token;

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
            return Response.json({ years: [], symbols: [], departments: [] });
        }

        const datasetId = activeDatasets[0].id;

        // Read from PredictionFilterCache — no Person scan
        const caches = await base44.asServiceRole.entities.PredictionFilterCache.filter({ dataset_id: datasetId });
        if (!caches?.length) {
            return Response.json({ years: [], symbols: [], departments: [], cache_missing: true });
        }

        const cache = caches[0];
        const years = cache.years_json?.data || [];
        const symbols = cache.symbols_json?.data || [];
        const departments = cache.departments_json?.data || [];

        return Response.json({ years, symbols, departments });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});