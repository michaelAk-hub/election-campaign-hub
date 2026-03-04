import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, notification_id, mark_all, notification_ids } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        }

        // Validate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const now = new Date().toISOString();

        if (mark_all && notification_ids?.length) {
            for (const id of notification_ids) {
                await base44.asServiceRole.entities.Notification.update(id, { read: true, read_at: now });
            }
        } else if (notification_id) {
            await base44.asServiceRole.entities.Notification.update(notification_id, { read: true, read_at: now });
        }

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});