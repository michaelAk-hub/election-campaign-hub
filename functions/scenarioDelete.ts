import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token, scenario_id } = body;

        if (!session_token || !scenario_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (!users?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (!['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const scenarios = await base44.asServiceRole.entities.PredictionScenario.filter({ id: scenario_id });
        if (!scenarios?.length) return Response.json({ error: 'Not found' }, { status: 404 });
        await base44.asServiceRole.entities.PredictionScenario.delete(scenario_id);
        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});