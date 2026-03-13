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

function deriveStatus(record) {
    const now = new Date();
    if (record.disabled_at != null || record.is_active === false) return 'disabled';
    if (record.expires_at != null && new Date(record.expires_at) <= now) return 'expired';
    return 'active';
}

function buildNotificationRecipientSummary(batch) {
    // batch is array of Notification rows with same send_batch_id
    const adminCount = batch.filter(r => r.recipient_type === 'admin').length;
    const orgCount = batch.filter(r => r.recipient_type === 'organotikos').length;
    const parts = [];
    if (adminCount > 0) parts.push(`${adminCount} διαχειριστ${adminCount === 1 ? 'ής' : 'ές'}`);
    if (orgCount > 0) parts.push(`${orgCount} οργανωτικ${orgCount === 1 ? 'ός' : 'οί'}`);
    return parts.length > 0 ? parts.join(', ') : 'Άγνωστο';
}

function buildPushRecipientSummary(msg) {
    if (msg.delivery_mode === 'group' || !msg.delivery_mode) {
        if (msg.target_group === 'both') return 'Όλα τα χρεωστικά και όλα τα κανάλι';
        if (msg.target_group === 'chreosi') return 'Όλα τα χρεωστικά';
        if (msg.target_group === 'kanali') return 'Όλα τα κανάλι';
        return 'Όλοι οι χρήστες portal';
    }
    // specific
    const keys = Array.isArray(msg.target_user_keys) ? msg.target_user_keys : [];
    const chreosiCount = keys.filter(k => k.startsWith('chreosi:')).length;
    const kanaliCount = keys.filter(k => k.startsWith('kanali:')).length;
    const parts = [];
    if (chreosiCount > 0) parts.push(`${chreosiCount} χρεωστικ${chreosiCount === 1 ? 'ό' : 'ά'}`);
    if (kanaliCount > 0) parts.push(`${kanaliCount} κανάλ${kanaliCount === 1 ? 'ι' : 'ια'}`);
    return parts.length > 0 ? `Specific portal recipients (${keys.length}): ${parts.join(', ')}` : `Specific (${keys.length})`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token } = await req.json();

        const validation = await validateAppSession(base44, session_token);
        if (validation.error) return Response.json({ error: validation.error }, { status: validation.status });

        const { appUser } = validation;
        if (!['ADMIN', 'ORGANOTIKI'].includes(appUser.role)) {
            return Response.json({ error: 'Δεν έχετε δικαίωμα πρόσβασης' }, { status: 403 });
        }
        if (appUser.role === 'ORGANOTIKI' && !appUser.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας είναι ανενεργός' }, { status: 403 });
        }

        // Fetch all notifications and push messages
        const [allNotifications, allPushMessages] = await Promise.all([
            base44.asServiceRole.entities.Notification.list('-created_date', 500),
            base44.asServiceRole.entities.PushMessage.list('-created_date', 200),
        ]);

        const rows = [];
        const now = new Date();

        // ── Process Notifications — group by send_batch_id ────────────────────
        // Separate: those with send_batch_id (new) and those without (legacy)
        const batchMap = new Map();
        const legacyNotifs = [];

        for (const n of allNotifications) {
            if (n.send_batch_id) {
                if (!batchMap.has(n.send_batch_id)) batchMap.set(n.send_batch_id, []);
                batchMap.get(n.send_batch_id).push(n);
            } else {
                legacyNotifs.push(n);
            }
        }

        // One row per batch
        for (const [batchId, batch] of batchMap) {
            const first = batch[0];
            // Use the representative row for status (all in batch share same expiry/disable)
            const status = deriveStatus(first);
            rows.push({
                id: batchId,
                record_id: first.id, // representative record id for disable action
                source_type: 'notification',
                send_batch_id: batchId,
                title: first.title,
                message: first.message,
                sender_email: first.sender_email || null,
                created_date: first.created_date,
                expires_at: first.expires_at || null,
                disabled_at: first.disabled_at || null,
                disabled_by: first.disabled_by || null,
                is_active: first.is_active !== false,
                status,
                recipient_summary: buildNotificationRecipientSummary(batch),
                recipient_count: batch.length,
            });
        }

        // Legacy notifications without send_batch_id — show individually (backward compat)
        for (const n of legacyNotifs) {
            const status = deriveStatus(n);
            rows.push({
                id: n.id,
                record_id: n.id,
                source_type: 'notification',
                send_batch_id: null,
                title: n.title,
                message: n.message,
                sender_email: n.sender_email || null,
                created_date: n.created_date,
                expires_at: n.expires_at || null,
                disabled_at: n.disabled_at || null,
                disabled_by: n.disabled_by || null,
                is_active: n.is_active !== false,
                status,
                recipient_summary: n.recipient_type || 'legacy',
                recipient_count: 1,
            });
        }

        // ── Process PushMessages ──────────────────────────────────────────────
        for (const msg of allPushMessages) {
            const status = deriveStatus(msg);
            rows.push({
                id: msg.id,
                record_id: msg.id,
                source_type: 'push',
                send_batch_id: msg.send_batch_id || null,
                title: msg.title,
                message: msg.body,
                sender_email: msg.sender_email || null,
                created_date: msg.created_date,
                expires_at: msg.expires_at || null,
                disabled_at: msg.disabled_at || null,
                disabled_by: msg.disabled_by || null,
                is_active: msg.is_active !== false,
                status,
                recipient_summary: buildPushRecipientSummary(msg),
                recipient_count: msg.total_recipients || 0,
            });
        }

        // Sort by created_date desc
        rows.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

        return Response.json({ rows });
    } catch (error) {
        console.error('notificationsAdminList error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});