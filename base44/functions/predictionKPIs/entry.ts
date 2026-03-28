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
            return Response.json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, cache_missing: false, generated_at: new Date().toISOString() });
        }

        const datasetId = activeDatasets[0].id;
        const cacheRows = await base44.asServiceRole.entities.PredictionStatsOverall.filter({ dataset_id: datasetId });

        if (!cacheRows?.length) {
            return Response.json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, cache_missing: true, generated_at: new Date().toISOString() });
        }

        const cache = cacheRows[0];
        const total = cache.total || 0;
        const voted_yes = cache.voted_yes || 0;
        const voted_no = cache.voted_no || 0;
        const voted_yes_percent = total > 0 ? parseFloat((voted_yes / total * 100).toFixed(2)) : 0;

        return Response.json({ total, voted_yes, voted_no, voted_yes_percent, cache_missing: false, generated_at: cache.updated_at || new Date().toISOString() });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});