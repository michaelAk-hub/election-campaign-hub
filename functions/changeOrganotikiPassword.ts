import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate admin session
        const { session_token, user_id, new_password } = await req.json();
        const validation = await base44.functions.invoke('validateAppSession', { session_token });
        
        if (!validation.data.valid || validation.data.user.role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο οι διαχειριστές μπορούν να αλλάξουν κωδικούς' }, { status: 403 });
        }

        if (!user_id || !new_password) {
            return Response.json({ error: 'Απαιτούνται user_id και new_password' }, { status: 400 });
        }

        // Get user
        const user = await base44.asServiceRole.entities.AppUser.get(user_id);

        if (!user || user.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Χρήστης Organotiki δεν βρέθηκε' }, { status: 404 });
        }

        // Hash new password
        const password_hash = await bcrypt.hash(new_password);

        // Increment session version to invalidate all sessions
        const newSessionVersion = (user.session_version || 1) + 1;

        // Update password and session version
        await base44.asServiceRole.entities.AppUser.update(user_id, {
            password_hash,
            password_changed_at: new Date().toISOString(),
            session_version: newSessionVersion
        });

        // Create notification for the user
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'organotikos',
            recipient_username: user.email,
            type: 'warning',
            category: 'password_change',
            title: 'Αλλαγή Κωδικού',
            message: 'Ο κωδικός σας άλλαξε από τον διαχειριστή. Παρακαλώ συνδεθείτε ξανά.',
            read: false
        });

        // Create notification for admin
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'system',
            category: 'password_change',
            title: 'Αλλαγή Κωδικού Organotiki',
            message: `Αλλάχθηκε ο κωδικός για: ${user.name} ${user.surname} (${user.email})`,
            read: false
        });

        return Response.json({
            success: true,
            message: 'Ο κωδικός άλλαξε και όλες οι συνεδρίες ακυρώθηκαν'
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});