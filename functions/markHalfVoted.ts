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

    if (user.role !== "ADMIN") {
        return { error: "Απαιτούνται δικαιώματα διαχειριστή", status: 403 };
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
        const { session_token } = body;

        const auth = await validateSession(base44, session_token);
        if (auth.error) {
            return Response.json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) }, { status: auth.status });
        }

        const targetSymbols = ['Σ', 'Ο', 'Π'];
        let allPersons = [];

        for (const symbol of targetSymbols) {
            let skip = 0;
            const limit = 5000;
            let hasMore = true;
            while (hasMore) {
                const batch = await base44.asServiceRole.entities.Person.filter(
                    { prediction_symbol: symbol, voted: false },
                    '-created_date',
                    limit,
                    skip
                );
                allPersons = allPersons.concat(batch);
                skip += limit;
                hasMore = batch.length === limit;
            }
        }

        const half = Math.ceil(allPersons.length / 2);
        for (let i = allPersons.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPersons[i], allPersons[j]] = [allPersons[j], allPersons[i]];
        }
        const toMark = allPersons.slice(0, half);

        const today = new Date();
        const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

        let updated = 0;
        for (const person of toMark) {
            const hours = 9 + Math.floor(Math.random() * 9);
            const minutes = Math.floor(Math.random() * 60);
            const seconds = Math.floor(Math.random() * 60);
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            const voted_at = `${todayStr}T${timeStr}.000Z`;

            await base44.asServiceRole.entities.Person.update(person.id, {
                voted: true,
                voted_at
            });
            updated++;
        }

        return Response.json({ success: true, updated, total: allPersons.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});