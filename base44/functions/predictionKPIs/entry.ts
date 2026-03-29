import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json().catch(() => ({}));
        const sessionToken = body.session_token;

        if (!sessionToken) return Response.json({ error: 'Unauthorized: No session token' }, { status: 401 });

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Invalid session' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, generated_at: new Date().toISOString() });
        }

        const datasetId = activeDatasets[0].id;

        // Read from cache
        const overallStats = await base44.asServiceRole.entities.PredictionStatsOverall.filter({ dataset_id: datasetId });
        if (!overallStats?.length) {
            return Response.json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, generated_at: new Date().toISOString() });
        }

        const stats = overallStats[0];
        const total = stats.total || 0;
        const voted_yes = stats.voted_yes || 0;
        const voted_no = stats.voted_no || 0;
        const voted_yes_percent = total > 0 ? parseFloat((voted_yes / total * 100).toFixed(2)) : 0;

        return Response.json({ total, voted_yes, voted_no, voted_yes_percent, generated_at: new Date().toISOString() });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});