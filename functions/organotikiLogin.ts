import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ error: 'Email και password απαιτούνται' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Find user by email (case-insensitive)
        const normalizedEmail = email.toLowerCase().trim();
        const users = await base44.asServiceRole.entities.OrganotikiUser.filter({
            email: normalizedEmail
        });

        if (users.length === 0) {
            return Response.json({ error: 'Λάθος email ή password' }, { status: 401 });
        }

        const user = users[0];

        // Check if user is active (ORGANOTIKI only)
        if (user.role === 'ORGANOTIKI' && !user.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας δεν είναι ενεργός' }, { status: 403 });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return Response.json({ error: 'Λάθος email ή password' }, { status: 401 });
        }

        // Create session token
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        // Create session
        await base44.asServiceRole.entities.OrganotikiSession.create({
            user_id: user.id,
            session_token: sessionToken,
            session_version_at_login: user.session_version,
            expires_at: expiresAt.toISOString(),
            is_active: true
        });

        // Create notification
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: user.role === 'ADMIN' ? 'admin' : 'organotikos',
            recipient_username: user.email,
            type: 'info',
            category: 'system_message',
            title: 'Επιτυχής σύνδεση',
            message: `Συνδεθήκατε επιτυχώς στο σύστημα`,
            read: false
        });

        return Response.json({
            success: true,
            session_token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                surname: user.surname,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return Response.json({ error: 'Σφάλμα κατά τη σύνδεση' }, { status: 500 });
    }
});