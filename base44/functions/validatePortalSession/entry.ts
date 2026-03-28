import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { sessionToken, username, portalType } = await req.json();

        if (!sessionToken || !username || !portalType) {
            return Response.json({ valid: false });
        }

        const sessions = await base44.asServiceRole.entities.PortalSession.filter({
            session_token: sessionToken,
            username,
            portal_type: portalType,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ valid: false });
        }

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            await base44.asServiceRole.entities.PortalSession.update(session.id, { is_active: false });
            return Response.json({ valid: false });
        }

        return Response.json({
            valid: true,
            username: session.username,
            portalType: session.portal_type,
            kanaliType: session.kanali_type || null
        });

    } catch (error) {
        console.error('validatePortalSession error:', error);
        return Response.json({ valid: false }, { status: 500 });
    }
});