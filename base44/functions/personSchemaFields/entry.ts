import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const schema = await base44.asServiceRole.entities.Person.schema();
        const fields = Object.keys(schema?.properties || {});

        return Response.json({ fields });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});