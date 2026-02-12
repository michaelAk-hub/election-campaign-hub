import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate admin session
        const adminSessionToken = req.headers.get('x-session-token');
        if (!adminSessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const validateRes = await base44.functions.invoke('organotikiValidateSession', {
            session_token: adminSessionToken
        });

        if (!validateRes.data.valid || validateRes.data.user.role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να διαγράψουν χρήστες' }, { status: 403 });
        }

        const { user_id } = await req.json();

        if (!user_id) {
            return Response.json({ error: 'Το user_id είναι υποχρεωτικό' }, { status: 400 });
        }

        // Get user
        const user = await base44.asServiceRole.entities.OrganotikiUser.get(user_id);

        if (!user) {
            return Response.json({ error: 'Ο χρήστης δεν βρέθηκε' }, { status: 404 });
        }

        if (user.role === 'ADMIN') {
            return Response.json({ error: 'Δεν μπορείτε να διαγράψετε διαχειριστές' }, { status: 403 });
        }

        // Delete all sessions
        const sessions = await base44.asServiceRole.entities.OrganotikiSession.filter({
            user_id: user_id
        });

        for (const session of sessions) {
            await base44.asServiceRole.entities.OrganotikiSession.delete(session.id);
        }

        // Delete user
        await base44.asServiceRole.entities.OrganotikiUser.delete(user_id);

        // Create notification
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'info',
            category: 'account_update',
            title: 'Διαγραφή Οργανωτικού',
            message: `Διαγράφηκε ο οργανωτικός: ${user.name} ${user.surname}`,
            read: false
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return Response.json({ error: 'Σφάλμα κατά τη διαγραφή χρήστη' }, { status: 500 });
    }
});