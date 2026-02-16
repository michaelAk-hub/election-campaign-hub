import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ valid: false, error: 'Απαιτείται session token' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Find session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ valid: false, error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const session = sessions[0];

        // Check if expired
        if (new Date(session.expires_at) < new Date()) {
            await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
            return Response.json({ valid: false, error: 'Η συνεδρία έληξε' }, { status: 401 });
        }

        // Check for inactivity timeout (15 minutes)
        const IDLE_TIMEOUT_MINUTES = 15;
        const idleSeconds = (new Date().getTime() - new Date(session.last_seen_at).getTime()) / 1000;
        
        if (idleSeconds > IDLE_TIMEOUT_MINUTES * 60) {
            await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
            return Response.json({ 
                valid: false, 
                error: 'Η συνεδρία σας έληξε λόγω αδράνειας',
                reason: 'idle_timeout'
            }, { status: 401 });
        }

        // Get user
        const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);

        if (!user) {
            return Response.json({ valid: false, error: 'Χρήστης δεν βρέθηκε' }, { status: 404 });
        }

        // Check session version (for forced logout)
        if (session.session_version_at_login !== user.session_version) {
            await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
            return Response.json({ 
                valid: false, 
                error: 'Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.',
                force_logout: true
            }, { status: 401 });
        }

        // Check if ORGANOTIKI is still active
        if (user.role === 'ORGANOTIKI' && !user.is_active) {
            return Response.json({ valid: false, error: 'Ο λογαριασμός σας έχει απενεργοποιηθεί' }, { status: 403 });
        }

        return Response.json({
            valid: true,
            user: {
                id: user.id,
                role: user.role,
                email: user.email,
                name: user.name,
                surname: user.surname,
                phone: user.phone,
                is_active: user.is_active
            }
        });

    } catch (error) {
        return Response.json({ valid: false, error: error.message }, { status: 500 });
    }
});