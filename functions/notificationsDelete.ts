import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, notification_id } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return Response.json({ error: 'Η συνεδρία έχει λήξει' }, { status: 401 });
        }

        const appUsers = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (!appUsers.length) return Response.json({ error: 'Χρήστης δεν βρέθηκε' }, { status: 401 });

        const appUser = appUsers[0];
        if (session.session_version_at_login !== appUser.session_version) {
            return Response.json({ error: 'Η συνεδρία έχει ακυρωθεί' }, { status: 401 });
        }

        const userNotifs = await base44.asServiceRole.entities.Notification.filter({
            recipient_username: appUser.email,
        });
        const owned = userNotifs.find(n => n.id === notification_id);
        if (!owned) {
            return Response.json({ error: 'Δεν επιτρέπεται' }, { status: 403 });
        }

        await base44.asServiceRole.entities.Notification.delete(notification_id);

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});