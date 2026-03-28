import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ success: true });
        }

        const base44 = createClientFromRequest(req);

        // Find and invalidate session
        const sessions = await base44.asServiceRole.entities.OrganotikiSession.filter({
            session_token: session_token
        });

        if (sessions.length > 0) {
            await base44.asServiceRole.entities.OrganotikiSession.update(sessions[0].id, {
                is_active: false
            });
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return Response.json({ error: 'Σφάλμα κατά την αποσύνδεση' }, { status: 500 });
    }
});