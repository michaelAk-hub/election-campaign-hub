import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        }

        // Validate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const session = sessions[0];
        const appUsers = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (!appUsers.length) {
            return Response.json({ error: 'Χρήστης δεν βρέθηκε' }, { status: 401 });
        }

        const appUser = appUsers[0];

        // Fetch only notifications belonging to this exact user
        const notifications = await base44.asServiceRole.entities.Notification.filter({
            recipient_username: appUser.email,
        });

        // Sort newest first
        notifications.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

        return Response.json({ notifications });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});