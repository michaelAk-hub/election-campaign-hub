import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const sessionToken = body.session_token;
        if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const user = users[0];
        if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const scenarios = await base44.asServiceRole.entities.PredictionScenario.list('display_order', 10);
        return Response.json({ scenarios });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});