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

        if (!source_type || !['notification', 'push'].includes(source_type)) {
            return Response.json({ error: 'Μη έγκυρος τύπος πηγής' }, { status: 400 });
        }

        const now = new Date();
        const disablePayload = {
            is_active: false,
            disabled_at: now.toISOString(),
            disabled_by: appUser.email,
        };

        if (source_type === 'push') {
            // Disable single PushMessage by id
            if (!id) return Response.json({ error: 'Απαιτείται id' }, { status: 400 });
            const records = await base44.asServiceRole.entities.PushMessage.filter({ id });
            if (!records.length) return Response.json({ error: 'Δεν βρέθηκε το μήνυμα' }, { status: 404 });
            const record = records[0];

            if (record.disabled_at != null || record.is_active === false) {
                return Response.json({ ok: true, noop: true, message: 'Το μήνυμα είναι ήδη απενεργοποιημένο' });
            }
            if (record.expires_at != null && new Date(record.expires_at) <= now) {
                return Response.json({ error: 'Το μήνυμα έχει ήδη λήξει και δεν μπορεί να τροποποιηθεί' }, { status: 409 });
            }

            await base44.asServiceRole.entities.PushMessage.update(record.id, disablePayload);
            return Response.json({ ok: true, disabled: 1 });

        } else {
            // source_type === 'notification'
            // If send_batch_id provided: disable all in batch
            // Otherwise fall back to single record id
            if (send_batch_id) {
                const batch = await base44.asServiceRole.entities.Notification.filter({ send_batch_id });
                if (!batch.length) return Response.json({ error: 'Δεν βρέθηκε η παρτίδα ειδοποιήσεων' }, { status: 404 });

                const first = batch[0];
                if (first.disabled_at != null || first.is_active === false) {
                    return Response.json({ ok: true, noop: true, message: 'Οι ειδοποιήσεις είναι ήδη απενεργοποιημένες' });
                }
                if (first.expires_at != null && new Date(first.expires_at) <= now) {
                    return Response.json({ error: 'Οι ειδοποιήσεις έχουν ήδη λήξει και δεν μπορούν να τροποποιηθούν' }, { status: 409 });
                }

                // Bulk disable all in batch
                await Promise.all(batch.map(n =>
                    base44.asServiceRole.entities.Notification.update(n.id, disablePayload)
                ));
                return Response.json({ ok: true, disabled: batch.length });

            } else if (id) {
                const records = await base44.asServiceRole.entities.Notification.filter({ id });
                if (!records.length) return Response.json({ error: 'Δεν βρέθηκε η ειδοποίηση' }, { status: 404 });
                const record = records[0];

                if (record.disabled_at != null || record.is_active === false) {
                    return Response.json({ ok: true, noop: true, message: 'Η ειδοποίηση είναι ήδη απενεργοποιημένη' });
                }
                if (record.expires_at != null && new Date(record.expires_at) <= now) {
                    return Response.json({ error: 'Η ειδοποίηση έχει ήδη λήξει και δεν μπορεί να τροποποιηθεί' }, { status: 409 });
                }

                await base44.asServiceRole.entities.Notification.update(record.id, disablePayload);
                return Response.json({ ok: true, disabled: 1 });
            } else {
                return Response.json({ error: 'Απαιτείται id ή send_batch_id' }, { status: 400 });
            }
        }

    } catch (error) {
        console.error('notificationsAdminDisable error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});