import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να ενημερώσουν χρήστες' }, { status: 403 });
        }

        const { user_id, name, surname, phone, email, password, is_active } = await req.json();

        if (!user_id) {
            return Response.json({ error: 'Το user_id είναι υποχρεωτικό' }, { status: 400 });
        }

        // Get current user
        const user = await base44.asServiceRole.entities.OrganotikiUser.get(user_id);

        if (!user) {
            return Response.json({ error: 'Ο χρήστης δεν βρέθηκε' }, { status: 404 });
        }

        if (user.role === 'ADMIN') {
            return Response.json({ error: 'Δεν μπορείτε να τροποποιήσετε διαχειριστές' }, { status: 403 });
        }

        // Build update object
        const updates = {};
        if (name) updates.name = name;
        if (surname) updates.surname = surname;
        if (phone) updates.phone = phone;
        if (is_active !== undefined) updates.is_active = is_active;

        // Handle email change
        if (email && email.toLowerCase().trim() !== user.email) {
            const normalizedEmail = email.toLowerCase().trim();
            const existing = await base44.asServiceRole.entities.OrganotikiUser.filter({
                email: normalizedEmail
            });
            if (existing.length > 0 && existing[0].id !== user_id) {
                return Response.json({ error: 'Το email υπάρχει ήδη' }, { status: 400 });
            }
            updates.email = normalizedEmail;
        }

        // Handle password change with forced logout
        if (password) {
            updates.password_hash = await bcrypt.hash(password);
            updates.password_changed_at = new Date().toISOString();
            updates.session_version = user.session_version + 1;

            // Invalidate all sessions for this user
            const sessions = await base44.asServiceRole.entities.OrganotikiSession.filter({
                user_id: user_id,
                is_active: true
            });

            for (const session of sessions) {
                await base44.asServiceRole.entities.OrganotikiSession.update(session.id, {
                    is_active: false
                });
            }

            // Create notification
            await base44.asServiceRole.entities.Notification.create({
                recipient_type: 'organotikos',
                recipient_username: user.email,
                type: 'warning',
                category: 'password_change',
                title: 'Αλλαγή Κωδικού',
                message: 'Ο κωδικός σας άλλαξε από διαχειριστή. Παρακαλώ συνδεθείτε ξανά.',
                read: false
            });
        }

        // Update user
        const updatedUser = await base44.asServiceRole.entities.OrganotikiUser.update(user_id, updates);

        // Create notification for admin
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'info',
            category: 'account_update',
            title: 'Ενημέρωση Οργανωτικού',
            message: `Ενημερώθηκε ο οργανωτικός: ${updatedUser.name} ${updatedUser.surname}`,
            read: false
        });

        return Response.json({
            success: true,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                surname: updatedUser.surname,
                phone: updatedUser.phone,
                is_active: updatedUser.is_active
            },
            password_changed: !!password
        });
    } catch (error) {
        console.error('Update user error:', error);
        return Response.json({ error: 'Σφάλμα κατά την ενημέρωση χρήστη' }, { status: 500 });
    }
});