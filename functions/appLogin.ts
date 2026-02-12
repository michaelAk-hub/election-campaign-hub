import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ error: 'Email και κωδικός απαιτούνται' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);
        
        // Find user by email (case-insensitive)
        const users = await base44.asServiceRole.entities.AppUser.filter({});
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            return Response.json({ error: 'Λάθος email ή κωδικός' }, { status: 401 });
        }

        // Check if role is ADMIN or ORGANOTIKI
        if (user.role !== 'ADMIN' && user.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Μη εξουσιοδοτημένη πρόσβαση' }, { status: 403 });
        }

        // Check if ORGANOTIKI is active
        if (user.role === 'ORGANOTIKI' && !user.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας δεν είναι ενεργός' }, { status: 403 });
        }

        // Verify password
        const passwordMatch = compareSync(password, user.password_hash);
        if (!passwordMatch) {
            return Response.json({ error: 'Λάθος email ή κωδικός' }, { status: 401 });
        }

        // Create session
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await base44.asServiceRole.entities.AppSession.create({
            session_token: sessionToken,
            app_user_id: user.id,
            session_version_at_login: user.session_version || 1,
            expires_at: expiresAt.toISOString(),
            is_active: true
        });

        return Response.json({
            success: true,
            session_token: sessionToken,
            user: {
                id: user.id,
                role: user.role,
                email: user.email,
                name: user.name,
                surname: user.surname
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});