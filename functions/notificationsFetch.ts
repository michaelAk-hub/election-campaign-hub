import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, recipient_type, username } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        }

        // Validate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        let notifications;
        if (username) {
            notifications = await base44.asServiceRole.entities.Notification.filter({ recipient_username: username });
        } else {
            notifications = await base44.asServiceRole.entities.Notification.filter({ recipient_type });
        }

        return Response.json({ notifications });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});