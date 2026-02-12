import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, target_user_id } = await req.json();

        // Validate admin session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const session = sessions[0];
        const adminUsers = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        
        if (adminUsers.length === 0 || adminUsers[0].role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να διαγράψουν χρήστες' }, { status: 403 });
        }

        const admin = adminUsers[0];

        // Get target user
        const targetUsers = await base44.asServiceRole.entities.AppUser.filter({ id: target_user_id });
        
        if (targetUsers.length === 0) {
            return Response.json({ error: 'Ο χρήστης δεν βρέθηκε' }, { status: 404 });
        }

        const targetUser = targetUsers[0];

        // Only ORGANOTIKI users can be deleted
        if (targetUser.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Μόνο χρήστες ORGANOTIKI μπορούν να διαγραφούν' }, { status: 403 });
        }

        // Delete all active sessions for this user
        const userSessions = await base44.asServiceRole.entities.AppSession.filter({
            app_user_id: target_user_id,
            is_active: true
        });

        for (const s of userSessions) {
            await base44.asServiceRole.entities.AppSession.update(s.id, { is_active: false });
        }

        // Delete the user
        await base44.asServiceRole.entities.AppUser.delete(target_user_id);

        // Create notification for admins
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'system',
            category: 'account_update',
            title: 'Διαγραφή χρήστη Organotiki',
            message: `Ο διαχειριστής ${admin.name} ${admin.surname} διέγραψε τον χρήστη: ${targetUser.name} ${targetUser.surname}`
        });

        return Response.json({
            success: true,
            message: 'Ο χρήστης διαγράφηκε επιτυχώς'
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});