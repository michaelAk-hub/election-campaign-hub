import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ valid: false, error: 'Δεν βρέθηκε session' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);

        // Find session
        const sessions = await base44.asServiceRole.entities.OrganotikiSession.filter({
            session_token: session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ valid: false, error: 'Μη έγκυρο session' }, { status: 401 });
        }

        const session = sessions[0];

        // Check if session expired
        if (new Date(session.expires_at) < new Date()) {
            await base44.asServiceRole.entities.OrganotikiSession.update(session.id, {
                is_active: false
            });
            return Response.json({ valid: false, error: 'Το session έχει λήξει' }, { status: 401 });
        }

        // Get user
        const user = await base44.asServiceRole.entities.OrganotikiUser.get(session.user_id);

        if (!user) {
            return Response.json({ valid: false, error: 'Ο χρήστης δεν βρέθηκε' }, { status: 401 });
        }

        // Check if user is active (ORGANOTIKI only)
        if (user.role === 'ORGANOTIKI' && !user.is_active) {
            return Response.json({ valid: false, error: 'Ο λογαριασμός δεν είναι ενεργός' }, { status: 403 });
        }

        // Check session version (for forced logout)
        if (session.session_version_at_login !== user.session_version) {
            await base44.asServiceRole.entities.OrganotikiSession.update(session.id, {
                is_active: false
            });
            return Response.json({ 
                valid: false, 
                error: 'Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.',
                force_logout: true
            }, { status: 401 });
        }

        return Response.json({
            valid: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                surname: user.surname,
                role: user.role,
                phone: user.phone
            }
        });
    } catch (error) {
        console.error('Session validation error:', error);
        return Response.json({ valid: false, error: 'Σφάλμα επικύρωσης session' }, { status: 500 });
    }
});