import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Find and deactivate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token
        });

        if (sessions.length > 0) {
            await base44.asServiceRole.entities.AppSession.update(sessions[0].id, {
                is_active: false
            });
        }

        return Response.json({ success: true });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});