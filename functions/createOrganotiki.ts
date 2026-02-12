import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, name, surname, phone, email, password } = await req.json();

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
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να δημιουργήσουν χρήστες' }, { status: 403 });
        }

        const admin = adminUsers[0];

        // Validate input
        if (!name || !surname || !phone || !email || !password) {
            return Response.json({ error: 'Όλα τα πεδία είναι υποχρεωτικά' }, { status: 400 });
        }

        // Check if email exists
        const existingUsers = await base44.asServiceRole.entities.AppUser.filter({});
        const emailExists = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());

        if (emailExists) {
            return Response.json({ error: 'Το email υπάρχει ήδη' }, { status: 400 });
        }

        // Hash password using Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Create ORGANOTIKI user (inactive by default)
        const newUser = await base44.asServiceRole.entities.AppUser.create({
            role: 'ORGANOTIKI',
            email: email.toLowerCase(),
            password_hash,
            name,
            surname,
            phone,
            is_active: false,
            session_version: 1,
            password_changed_at: new Date().toISOString(),
            created_by_admin_id: admin.id
        });

        // Create notification for admins
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'system',
            category: 'account_update',
            title: 'Νέος χρήστης Organotiki',
            message: `Ο διαχειριστής ${admin.name} ${admin.surname} δημιούργησε νέο χρήστη: ${newUser.name} ${newUser.surname}`
        });

        return Response.json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                surname: newUser.surname,
                is_active: newUser.is_active
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});