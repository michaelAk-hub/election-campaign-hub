import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, user_id, new_password } = await req.json();

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
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να αλλάξουν κωδικούς' }, { status: 403 });
        }

        const admin = adminUsers[0];

        // Get the user to update
        const targetUsers = await base44.asServiceRole.entities.AppUser.filter({ id: user_id });
        if (targetUsers.length === 0) {
            return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
        }

        const targetUser = targetUsers[0];

        if (targetUser.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Μπορείτε να αλλάξετε μόνο κωδικούς Organotiki χρηστών' }, { status: 403 });
        }

        // Hash password using Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(new_password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Update password and increment session version (force logout)
        await base44.asServiceRole.entities.AppUser.update(user_id, {
            password_hash,
            password_changed_at: new Date().toISOString(),
            session_version: (targetUser.session_version || 1) + 1
        });

        // Deactivate all user's sessions
        const userSessions = await base44.asServiceRole.entities.AppSession.filter({
            app_user_id: user_id,
            is_active: true
        });

        for (const userSession of userSessions) {
            await base44.asServiceRole.entities.AppSession.update(userSession.id, { is_active: false });
        }

        // Create notifications
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'organotikos',
            recipient_username: targetUser.email,
            type: 'warning',
            category: 'password_change',
            title: 'Αλλαγή Κωδικού',
            message: `Ο κωδικός σας άλλαξε από τον διαχειριστή ${admin.name} ${admin.surname}. Παρακαλούμε συνδεθείτε ξανά.`
        });

        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'info',
            category: 'password_change',
            title: 'Αλλαγή Κωδικού Χρήστη',
            message: `Ο διαχειριστής ${admin.name} ${admin.surname} άλλαξε τον κωδικό του χρήστη ${targetUser.name} ${targetUser.surname}`
        });

        return Response.json({
            success: true,
            message: 'Ο κωδικός άλλαξε επιτυχώς - όλες οι συνεδρίες ακυρώθηκαν'
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});