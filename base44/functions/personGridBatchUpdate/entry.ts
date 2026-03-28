import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateSession(base44, session_token) {
    if (!session_token) {
        return { error: 'Απαιτείται session token', status: 401 };
    }

    const sessions = await base44.asServiceRole.entities.AppSession.filter({
        session_token,
        is_active: true
    });

    if (sessions.length === 0) {
        return { error: 'Μη έγκυρη συνεδρία', status: 401 };
    }

    const session = sessions[0];

    if (new Date(session.expires_at) < new Date()) {
        await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
        return { error: 'Η συνεδρία έληξε', status: 401 };
    }

    const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
    if (!user) {
        return { error: 'Χρήστης δεν βρέθηκε', status: 401 };
    }

    if (session.session_version_at_login !== user.session_version) {
        await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
        return { error: 'Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.', status: 401, force_logout: true };
    }

    if (user.role === 'ORGANOTIKI' && !user.is_active) {
        return { error: 'Ο λογαριασμός σας έχει απενεργοποιηθεί', status: 403 };
    }

    if (session.last_seen_at) {
        const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
        if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
            await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
            return { error: 'Η συνεδρία σας έληξε λόγω αδράνειας', status: 401, reason: 'idle_timeout' };
        }
    }

    await base44.asServiceRole.entities.AppSession.update(session.id, { last_seen_at: new Date().toISOString() });

    return { user, session };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        const auth = await validateSession(base44, body?.session_token);
        if (auth.error) {
            return Response.json(
                { error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) },
                { status: auth.status }
            );
        }

        const { updates } = body;

        if (!Array.isArray(updates) || updates.length === 0) {
            return Response.json({ error: 'Invalid updates array' }, { status: 400 });
        }

        const nonEditableFields = new Set(['id', 'created_date', 'updated_date', 'created_by', 'updated_by', 'row_version']);
        const results = [];

        for (const update of updates) {
            const { person_id, changes, expected_row_version } = update;

            try {
                const persons = await base44.asServiceRole.entities.Person.filter({ id: person_id }, null, 1, 0);
                if (!persons.length) {
                    results.push({ person_id, status: 'error', error: 'Person not found' });
                    continue;
                }

                const currentPerson = persons[0];

                if (Number(currentPerson.row_version) !== Number(expected_row_version)) {
                    results.push({
                        person_id,
                        status: 'conflict',
                        current_row: currentPerson,
                        current_row_version: currentPerson.row_version
                    });
                    continue;
                }

                const validChanges = {};
                for (const [field, value] of Object.entries(changes)) {
                    if (!nonEditableFields.has(field)) {
                        validChanges[field] = value;
                    }
                }

                const updatedPerson = await base44.asServiceRole.entities.Person.update(person_id, {
                    ...validChanges,
                    row_version: Number(currentPerson.row_version) + 1
                });

                results.push({
                    person_id,
                    status: 'success',
                    data: updatedPerson,
                    row_version: updatedPerson.row_version
                });

            } catch (error) {
                results.push({ person_id, status: 'error', error: error.message });
            }
        }

        // Rebuild prediction stats if any prediction-relevant field was changed
        const predictionFields = new Set(['prediction_symbol', 'admission_year', 'department', 'voted', 'voted_at']);
        const hasPredictionChange = updates.some(u =>
            u.changes && Object.keys(u.changes).some(f => predictionFields.has(f))
        );
        if (hasPredictionChange) {
            base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});
        }

        return Response.json({ results });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});