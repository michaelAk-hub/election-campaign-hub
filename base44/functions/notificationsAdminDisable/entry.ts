import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function validateAppSession(base44, session_token) {
    if (!session_token) return { error: 'Απαιτείται session token', status: 401 };
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (!sessions.length) return { error: 'Μη έγκυρη συνεδρία', status: 401 };
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
        return { error: 'Η συνεδρία έχει λήξει', status: 401 };
    }
    const appUsers = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
    if (!appUsers.length) return { error: 'Χρήστης δεν βρέθηκε', status: 401 };
    const appUser = appUsers[0];
    if (session.session_version_at_login !== appUser.session_version) {
        return { error: 'Η συνεδρία έχει ακυρωθεί', status: 401 };
    }
    return { session, appUser };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, source_type, id, send_batch_id } = await req.json();

        const validation = await validateAppSession(base44, session_token);
        if (validation.error) return Response.json({ error: validation.error }, { status: validation.status });

        const { appUser } = validation;
        if (!['ADMIN', 'ORGANOTIKI'].includes(appUser.role)) {
            return Response.json({ error: 'Δεν έχετε δικαίωμα' }, { status: 403 });
        }
        if (appUser.role === 'ORGANOTIKI' && !appUser.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας είναι ανενεργός' }, { status: 403 });
        }

        const now = new Date();
        const disablePayload = {
            is_active: false,
            disabled_at: now.toISOString(),
            disabled_by: appUser.email,
        };

        // ── Case 1: Disable by send_batch_id (affects BOTH Notifications and PushMessage) ──
        if (send_batch_id) {
            const [notifBatch, pushBatch] = await Promise.all([
                base44.asServiceRole.entities.Notification.filter({ send_batch_id }),
                base44.asServiceRole.entities.PushMessage.filter({ send_batch_id }),
            ]);

            if (!notifBatch.length && !pushBatch.length) {
                return Response.json({ error: 'Δεν βρέθηκαν εγγραφές για αυτό το batch' }, { status: 404 });
            }

            // Check expiry on a representative record
            const rep = notifBatch[0] || pushBatch[0];
            if (rep.expires_at != null && new Date(rep.expires_at) <= now) {
                return Response.json({ error: 'Οι εγγραφές έχουν ήδη λήξει και δεν μπορούν να τροποποιηθούν' }, { status: 409 });
            }

            // Check if already disabled (idempotent)
            const alreadyDisabled = (notifBatch[0]?.disabled_at != null || notifBatch[0]?.is_active === false)
                || (pushBatch[0]?.disabled_at != null || pushBatch[0]?.is_active === false);
            if (alreadyDisabled && !notifBatch.some(n => n.is_active !== false) && !pushBatch.some(p => p.is_active !== false)) {
                return Response.json({ ok: true, noop: true, message: 'Ήδη απενεργοποιημένο' });
            }

            // Disable all Notification rows in batch + PushMessage in batch
            await Promise.all([
                ...notifBatch.map(n => base44.asServiceRole.entities.Notification.update(n.id, disablePayload)),
                ...pushBatch.map(p => base44.asServiceRole.entities.PushMessage.update(p.id, disablePayload)),
            ]);

            return Response.json({ ok: true, disabled_notifications: notifBatch.length, disabled_push: pushBatch.length });
        }

        // ── Case 2: Disable single record by source_type + id (legacy / no batch_id) ──
        if (!source_type || !['notification', 'push', 'mixed'].includes(source_type)) {
            return Response.json({ error: 'Απαιτείται send_batch_id ή (source_type + id)' }, { status: 400 });
        }
        if (!id) {
            return Response.json({ error: 'Απαιτείται id' }, { status: 400 });
        }

        if (source_type === 'push') {
            const records = await base44.asServiceRole.entities.PushMessage.filter({ id });
            if (!records.length) return Response.json({ error: 'Δεν βρέθηκε το μήνυμα' }, { status: 404 });
            const record = records[0];
            if (record.disabled_at != null || record.is_active === false) {
                return Response.json({ ok: true, noop: true, message: 'Ήδη απενεργοποιημένο' });
            }
            if (record.expires_at != null && new Date(record.expires_at) <= now) {
                return Response.json({ error: 'Το μήνυμα έχει ήδη λήξει' }, { status: 409 });
            }
            await base44.asServiceRole.entities.PushMessage.update(record.id, disablePayload);
            return Response.json({ ok: true, disabled: 1 });

        } else {
            // notification (legacy single row)
            const records = await base44.asServiceRole.entities.Notification.filter({ id });
            if (!records.length) return Response.json({ error: 'Δεν βρέθηκε η ειδοποίηση' }, { status: 404 });
            const record = records[0];
            if (record.disabled_at != null || record.is_active === false) {
                return Response.json({ ok: true, noop: true, message: 'Ήδη απενεργοποιημένο' });
            }
            if (record.expires_at != null && new Date(record.expires_at) <= now) {
                return Response.json({ error: 'Η ειδοποίηση έχει ήδη λήξει' }, { status: 409 });
            }
            await base44.asServiceRole.entities.Notification.update(record.id, disablePayload);
            return Response.json({ ok: true, disabled: 1 });
        }

    } catch (error) {
        console.error('notificationsAdminDisable error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});