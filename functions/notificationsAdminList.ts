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

// Canonical status: disabled > expired > active
function deriveStatus(record) {
    const now = new Date();
    if (record.disabled_at != null || record.is_active === false) return 'disabled';
    if (record.expires_at != null && new Date(record.expires_at) <= now) return 'expired';
    return 'active';
}

// Most restrictive status wins: disabled > expired > active
function mergeStatus(s1, s2) {
    if (s1 === 'disabled' || s2 === 'disabled') return 'disabled';
    if (s1 === 'expired' || s2 === 'expired') return 'expired';
    return 'active';
}

function buildNotifSummary(batch) {
    const adminCount = batch.filter(r => r.recipient_type === 'admin').length;
    const orgCount = batch.filter(r => r.recipient_type === 'organotikos').length;
    const parts = [];
    if (adminCount > 0) parts.push(`${adminCount} διαχειριστ${adminCount === 1 ? 'ής' : 'ές'}`);
    if (orgCount > 0) parts.push(`${orgCount} οργανωτικ${orgCount === 1 ? 'ός' : 'οί'}`);
    return parts.join(', ');
}

function buildPushSummary(msg) {
    if (msg.delivery_mode === 'group' || !msg.delivery_mode) {
        if (msg.target_group === 'both') return 'όλα τα χρεωστικά και όλα τα κανάλι';
        if (msg.target_group === 'chreosi') return 'όλα τα χρεωστικά';
        if (msg.target_group === 'kanali') return 'όλα τα κανάλι';
        return 'όλοι οι χρήστες portal';
    }
    const keys = Array.isArray(msg.target_user_keys) ? msg.target_user_keys : [];
    const chreosiCount = keys.filter(k => k.startsWith('chreosi:')).length;
    const kanaliCount = keys.filter(k => k.startsWith('kanali:')).length;
    const parts = [];
    if (chreosiCount > 0) parts.push(`${chreosiCount} χρεωστικ${chreosiCount === 1 ? 'ό' : 'ά'}`);
    if (kanaliCount > 0) parts.push(`${kanaliCount} κανάλ${kanaliCount === 1 ? 'ι' : 'ια'}`);
    return parts.length > 0 ? `specific portal recipients (${keys.length}): ${parts.join(', ')}` : `specific (${keys.length})`;
}

function buildMixedSummary(notifSummary, pushSummary) {
    const parts = [];
    if (notifSummary) parts.push(notifSummary);
    if (pushSummary) parts.push(pushSummary);
    if (parts.length === 0) return 'Άγνωστο';
    // Capitalize first letter of whole summary
    const joined = parts.join(', ');
    return joined.charAt(0).toUpperCase() + joined.slice(1);
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

        const [allNotifications, allPushMessages] = await Promise.all([
            base44.asServiceRole.entities.Notification.list('-created_date', 500),
            base44.asServiceRole.entities.PushMessage.list('-created_date', 200),
        ]);

        const rows = [];

        // ── Build a unified map keyed by send_batch_id ────────────────────────
        // Each entry: { notifBatch: [], pushMsg: null }
        const batchMap = new Map(); // send_batch_id -> { notifBatch, pushMsg }

        for (const n of allNotifications) {
            if (!n.send_batch_id) continue; // handled separately as legacy
            if (!batchMap.has(n.send_batch_id)) batchMap.set(n.send_batch_id, { notifBatch: [], pushMsg: null });
            batchMap.get(n.send_batch_id).notifBatch.push(n);
        }

        for (const msg of allPushMessages) {
            if (!msg.send_batch_id) continue; // handled separately as legacy
            if (!batchMap.has(msg.send_batch_id)) batchMap.set(msg.send_batch_id, { notifBatch: [], pushMsg: null });
            batchMap.get(msg.send_batch_id).pushMsg = msg;
        }

        // ── Emit one row per batch ────────────────────────────────────────────
        for (const [batchId, { notifBatch, pushMsg }] of batchMap) {
            const hasNotif = notifBatch.length > 0;
            const hasPush = pushMsg != null;

            let source_type;
            if (hasNotif && hasPush) source_type = 'mixed';
            else if (hasNotif) source_type = 'notification';
            else source_type = 'push';

            // Use first notif (or pushMsg) as canonical representative for metadata
            const rep = hasNotif ? notifBatch[0] : pushMsg;

            // Status: derive from each side, take most restrictive
            const notifStatus = hasNotif ? deriveStatus(notifBatch[0]) : 'active';
            const pushStatus = hasPush ? deriveStatus(pushMsg) : 'active';
            const status = hasNotif && hasPush
                ? mergeStatus(notifStatus, pushStatus)
                : (hasNotif ? notifStatus : pushStatus);

            // Recipient summaries
            const notifSummary = hasNotif ? buildNotifSummary(notifBatch) : '';
            const pushSummary = hasPush ? buildPushSummary(pushMsg) : '';
            const recipient_summary = source_type === 'mixed'
                ? buildMixedSummary(notifSummary, pushSummary)
                : source_type === 'notification'
                    ? (notifSummary || 'Άγνωστο')
                    : (pushSummary ? (pushSummary.charAt(0).toUpperCase() + pushSummary.slice(1)) : 'Άγνωστο');

            const notifCount = hasNotif ? notifBatch.length : 0;
            const pushCount = hasPush ? (pushMsg.total_recipients || 0) : 0;
            const recipient_count = notifCount + pushCount;

            // disabled_at / disabled_by: prefer the one that is set
            const disabled_at = rep.disabled_at || (hasPush && pushMsg.disabled_at) || (hasNotif && notifBatch[0].disabled_at) || null;
            const disabled_by = rep.disabled_by || (hasPush && pushMsg.disabled_by) || (hasNotif && notifBatch[0].disabled_by) || null;

            rows.push({
                id: batchId,
                record_id: hasPush ? pushMsg.id : rep.id,
                source_type,
                send_batch_id: batchId,
                title: rep.title,
                message: rep.message || rep.body || '',
                sender_email: rep.sender_email || null,
                created_date: rep.created_date,
                expires_at: rep.expires_at || null,
                disabled_at,
                disabled_by,
                is_active: rep.is_active !== false,
                status,
                recipient_summary,
                recipient_count,
            });
        }

        // ── Legacy: Notification rows without send_batch_id ───────────────────
        for (const n of allNotifications) {
            if (n.send_batch_id) continue;
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
                status: deriveStatus(n),
                recipient_summary: n.recipient_type || 'legacy',
                recipient_count: 1,
            });
        }

        // ── Legacy: PushMessage rows without send_batch_id ────────────────────
        for (const msg of allPushMessages) {
            if (msg.send_batch_id) continue;
            const pushSummary = buildPushSummary(msg);
            rows.push({
                id: msg.id,
                record_id: msg.id,
                source_type: 'push',
                send_batch_id: null,
                title: msg.title,
                message: msg.body,
                sender_email: msg.sender_email || null,
                created_date: msg.created_date,
                expires_at: msg.expires_at || null,
                disabled_at: msg.disabled_at || null,
                disabled_by: msg.disabled_by || null,
                is_active: msg.is_active !== false,
                status: deriveStatus(msg),
                recipient_summary: pushSummary.charAt(0).toUpperCase() + pushSummary.slice(1),
                recipient_count: msg.total_recipients || 0,
            });
        }

        rows.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

        return Response.json({ rows });
    } catch (error) {
        console.error('notificationsAdminList error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});