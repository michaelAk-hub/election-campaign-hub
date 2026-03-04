import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, notification_id } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        await base44.asServiceRole.entities.Notification.delete(notification_id);

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});