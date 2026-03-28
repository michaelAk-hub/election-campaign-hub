import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Missing session_token' }, { status: 400 });
        }

        // Find the session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Session not found or inactive' }, { status: 404 });
        }

        const session = sessions[0];

        // Check if session is expired
        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        if (expiresAt <= now) {
            return Response.json({ error: 'Session expired' }, { status: 401 });
        }

        // Update last_seen_at
        await base44.asServiceRole.entities.AppSession.update(session.id, {
            last_seen_at: now.toISOString()
        });

        return Response.json({ success: true, last_seen_at: now.toISOString() });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});