import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * Returns the ordered list of Person field names from the entity schema.
 * Auth-gated: requires a valid admin/organotiki app session.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const sessionToken = body.session_token;

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });

        if (!sessions.length) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch Person schema metadata from Base44 entity registry (server-side only)
        const schema = await base44.asServiceRole.entities.Person.schema();
        const fields = Object.keys(schema?.properties || {});

        return Response.json({ fields });

    } catch (error) {
        console.error('personSchemaFields error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});