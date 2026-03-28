import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateSession(base44, session_token) {
    if (!session_token) {
        return { error: "Απαιτείται session token", status: 401 };
    }

    const sessions = await base44.asServiceRole.entities.AppSession.filter({
        session_token,
        is_active: true
    });

    if (sessions.length === 0) {
        return { error: "Μη έγκυρη συνεδρία", status: 401 };
    }

    const session = sessions[0];

    if (new Date(session.expires_at) < new Date()) {
        await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
        return { error: "Η συνεδρία έληξε", status: 401 };
    }

    const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
    if (!user) {
        return { error: "Χρήστης δεν βρέθηκε", status: 401 };
    }

    if (session.session_version_at_login !== user.session_version) {
        await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
        return { error: "Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.", status: 401, force_logout: true };
    }

    if (user.role === "ORGANOTIKI" && !user.is_active) {
        return { error: "Ο λογαριασμός σας έχει απενεργοποιηθεί", status: 403 };
    }

    if (session.last_seen_at) {
        const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
        if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
            await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
            return { error: "Η συνεδρία σας έληξε λόγω αδράνειας", status: 401, reason: "idle_timeout" };
        }
    }

    return { user, session };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { session_token, grid_key, state_json } = body;

        const auth = await validateSession(base44, session_token);
        if (auth.error) {
            return Response.json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) }, { status: auth.status });
        }

        if (!grid_key || !state_json) {
            return Response.json({ error: 'Missing grid_key or state_json' }, { status: 400 });
        }

        const existing = await base44.asServiceRole.entities.GridPreference.filter({
            user_email: auth.user.email,
            grid_key
        });

        let preference;
        if (existing.length > 0) {
            const merged = { ...(existing[0].state_json || {}), ...state_json };
            preference = await base44.asServiceRole.entities.GridPreference.update(existing[0].id, {
                state_json: merged
            });
        } else {
            preference = await base44.asServiceRole.entities.GridPreference.create({
                user_email: auth.user.email,
                grid_key,
                state_json
            });
        }

        return Response.json({ success: true, preference });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});