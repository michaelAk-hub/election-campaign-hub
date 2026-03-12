import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { sessionToken, username } = await req.json();

        if (sessionToken && username) {
            const sessions = await base44.asServiceRole.entities.PortalSession.filter({
                session_token: sessionToken,
                username,
                is_active: true
            });
            if (sessions.length > 0) {
                await base44.asServiceRole.entities.PortalSession.update(sessions[0].id, { is_active: false });
            }
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('portalLogout error:', error);
        // Always succeed on logout — client will clear localStorage regardless
        return Response.json({ success: true });
    }
});