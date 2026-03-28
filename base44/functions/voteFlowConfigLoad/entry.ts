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
            return Response.json({ config: null, dataset_id: null, message: 'No active dataset' });
        }

        const datasetId = activeDatasets[0].id;
        const configs = await base44.asServiceRole.entities.PredictionVoteFlowConfig.filter({ dataset_id: datasetId });
        const config = configs?.[0] || null;

        if (!config) {
            return Response.json({ config: null, dataset_id: datasetId });
        }

        return Response.json({
            config: {
                id: config.id,
                dataset_id: config.dataset_id,
                is_enabled: config.is_enabled || false,
                bucket_minutes: config.bucket_minutes || 5,
                mapping: config.mapping_json?.data || [],
                updated_by_name: config.updated_by_name || null,
                updated_at: config.updated_at || null,
            },
            dataset_id: datasetId,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});