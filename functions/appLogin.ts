import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function verifyPassword(password, hash) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return passwordHash === hash;
}

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
        const passwordMatch = await verifyPassword(password, user.password_hash);
        if (!passwordMatch) {
            return Response.json({ error: 'Λάθος email ή κωδικός' }, { status: 401 });
        }

        // MFA required for ADMIN and ORGANOTIKI — create pre-auth challenge
        const preauthToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await base44.asServiceRole.entities.MfaChallenge.create({
            user_id: user.id,
            preauth_token: preauthToken,
            expires_at: expiresAt.toISOString(),
            is_used: false,
            send_count: 0,
            attempts: 0
        });

        return Response.json({
            success: true,
            mfaRequired: true,
            preauthToken
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});