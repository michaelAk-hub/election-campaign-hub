import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Strong session validation for app users
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

function generateBatchId() {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

const VALID_GROUPS = ['admin', 'organotikos', 'chreosi', 'kanali', 'all'];
const VALID_USER_TYPES = ['admin', 'organotikos', 'chreosi', 'kanali'];
const VALID_EXPIRY_UNITS = ['minutes', 'hours', 'days'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const {
            session_token, title, message,
            selectedGroups = [], selectedUsers = [],
            expiry_enabled = false, expiry_value = null, expiry_unit = null
        } = body;

        // --- Session validation ---
        const validation = await validateAppSession(base44, session_token);
        if (validation.error) return Response.json({ error: validation.error }, { status: validation.status });

        const { appUser: sender } = validation;

        if (!['ADMIN', 'ORGANOTIKI'].includes(sender.role)) {
            return Response.json({ error: 'Δεν έχετε δικαίωμα αποστολής' }, { status: 403 });
        }
        if (sender.role === 'ORGANOTIKI' && !sender.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας είναι ανενεργός' }, { status: 403 });
        }

        // --- Message validation ---
        const trimmedTitle = (title || '').trim();
        const trimmedMessage = (message || '').trim();

        if (!trimmedTitle) return Response.json({ error: 'Απαιτείται τίτλος' }, { status: 400 });
        if (trimmedTitle.length > 100) return Response.json({ error: 'Ο τίτλος δεν μπορεί να υπερβαίνει τους 100 χαρακτήρες' }, { status: 400 });
        if (!trimmedMessage) return Response.json({ error: 'Απαιτείται μήνυμα' }, { status: 400 });
        if (trimmedMessage.length > 500) return Response.json({ error: 'Το μήνυμα δεν μπορεί να υπερβαίνει τους 500 χαρακτήρες' }, { status: 400 });

        // --- Expiry validation ---
        let expiresAt = null;
        if (expiry_enabled === true || expiry_enabled === 'true') {
            if (expiry_value == null || expiry_value === '') {
                return Response.json({ error: 'Απαιτείται η τιμή λήξης όταν είναι ενεργοποιημένη η λήξη' }, { status: 400 });
            }
            const val = parseInt(expiry_value, 10);
            if (!Number.isInteger(val) || val <= 0) {
                return Response.json({ error: 'Η τιμή λήξης πρέπει να είναι θετικός ακέραιος αριθμός' }, { status: 400 });
            }
            if (!expiry_unit || !VALID_EXPIRY_UNITS.includes(expiry_unit)) {
                return Response.json({ error: `Η μονάδα λήξης πρέπει να είναι μία από: ${VALID_EXPIRY_UNITS.join(', ')}` }, { status: 400 });
            }
            const now = new Date();
            if (expiry_unit === 'minutes') expiresAt = new Date(now.getTime() + val * 60 * 1000);
            else if (expiry_unit === 'hours') expiresAt = new Date(now.getTime() + val * 60 * 60 * 1000);
            else if (expiry_unit === 'days') expiresAt = new Date(now.getTime() + val * 24 * 60 * 60 * 1000);
            expiresAt = expiresAt.toISOString();
        }

        // --- Recipient validation ---
        if (!Array.isArray(selectedGroups)) {
            return Response.json({ error: 'selectedGroups πρέπει να είναι array' }, { status: 400 });
        }
        const invalidGroups = selectedGroups.filter(g => !VALID_GROUPS.includes(g));
        if (invalidGroups.length > 0) {
            return Response.json({ error: `Μη έγκυρες ομάδες: ${invalidGroups.join(', ')}. Επιτρεπόμενες: ${VALID_GROUPS.join(', ')}` }, { status: 400 });
        }
        const validGroups = selectedGroups;

        if (!Array.isArray(selectedUsers)) {
            return Response.json({ error: 'selectedUsers πρέπει να είναι array' }, { status: 400 });
        }
        const invalidUsers = selectedUsers.filter(u => !u || typeof u.username !== 'string' || !u.username.trim() || !VALID_USER_TYPES.includes(u.type));
        if (invalidUsers.length > 0) {
            return Response.json({ error: `Μη έγκυρες εγγραφές selectedUsers. Κάθε entry πρέπει να έχει username (string) και type (${VALID_USER_TYPES.join('|')})` }, { status: 400 });
        }
        const validUsers = selectedUsers.map(u => ({ username: u.username.trim(), type: u.type }));

        if (validGroups.length === 0 && validUsers.length === 0) {
            return Response.json({ error: 'Απαιτείται τουλάχιστον ένας παραλήπτης' }, { status: 400 });
        }

        // Generate one batch id for this entire send action
        const sendBatchId = generateBatchId();

        // ── Resolve App Users (Admin/Organotikos) → Notification rows ─────────────

        const notifEmailSet = new Set();
        const notifRecipients = []; // { email, recipient_type }

        const addAppUser = (user) => {
            if (!notifEmailSet.has(user.email)) {
                notifEmailSet.add(user.email);
                notifRecipients.push({
                    email: user.email,
                    recipient_type: user.role === 'ADMIN' ? 'admin' : 'organotikos',
                });
            }
        };

        const needsAppUsers = validGroups.some(g => ['admin', 'organotikos', 'all'].includes(g));
        const needsSpecificAppUsers = validUsers.some(u => u.type === 'admin' || u.type === 'organotikos');

        let allAppUsers = [];
        if (needsAppUsers || needsSpecificAppUsers) {
            allAppUsers = await base44.asServiceRole.entities.AppUser.list();
        }

        if (validGroups.includes('admin') || validGroups.includes('all')) {
            allAppUsers.filter(u => u.role === 'ADMIN').forEach(addAppUser);
        }
        if (validGroups.includes('organotikos') || validGroups.includes('all')) {
            allAppUsers.filter(u => u.role === 'ORGANOTIKI' && u.is_active).forEach(addAppUser);
        }

        for (const su of validUsers) {
            if (su.type === 'admin' || su.type === 'organotikos') {
                const found = allAppUsers.find(u => u.email === su.username);
                if (found) {
                    if (su.type === 'organotikos' && !found.is_active) continue;
                    addAppUser(found);
                }
            }
        }

        // ── Resolve Portal Users (Chreosi/Kanali) → PushMessage ──────────────────

        const groupTargetsChreosi = validGroups.includes('chreosi') || validGroups.includes('all');
        const groupTargetsKanali = validGroups.includes('kanali') || validGroups.includes('all');

        const specificPortalKeys = new Set();
        for (const su of validUsers) {
            if (su.type === 'chreosi') specificPortalKeys.add(`chreosi:${su.username}`);
            if (su.type === 'kanali') specificPortalKeys.add(`kanali:${su.username}`);
        }

        let portalRecipientCount = 0;
        let portalDeliveryMode = null;
        let pushCreated = 0;
        let portalChreosiCount = 0;
        let portalKanaliCount = 0;

        const hasGroupPortal = groupTargetsChreosi || groupTargetsKanali;
        const hasSpecificPortal = specificPortalKeys.size > 0;

        if (hasGroupPortal || hasSpecificPortal) {
            if (hasGroupPortal && !hasSpecificPortal) {
                // Pure group broadcast
                let target_group;
                if (groupTargetsChreosi && groupTargetsKanali) target_group = 'both';
                else if (groupTargetsChreosi) target_group = 'chreosi';
                else target_group = 'kanali';

                let chreosiTotal = 0;
                let kanaliTotal = 0;
                if (groupTargetsChreosi) {
                    const list = await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true });
                    chreosiTotal = list.length;
                }
                if (groupTargetsKanali) {
                    const list = await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true });
                    kanaliTotal = list.length;
                }
                const total = chreosiTotal + kanaliTotal;

                await base44.asServiceRole.entities.PushMessage.create({
                    title: trimmedTitle,
                    body: trimmedMessage,
                    delivery_mode: 'group',
                    target_group,
                    target_user_keys: [],
                    sender_email: sender.email,
                    is_active: true,
                    total_recipients: total,
                    acknowledged_count: 0,
                    expires_at: expiresAt,
                    disabled_at: null,
                    disabled_by: null,
                    send_batch_id: sendBatchId,
                });
                portalRecipientCount = total;
                portalChreosiCount = chreosiTotal;
                portalKanaliCount = kanaliTotal;
                portalDeliveryMode = 'group';
                pushCreated = 1;

            } else if (!hasGroupPortal && hasSpecificPortal) {
                // Pure specific portal send
                const keys = [...specificPortalKeys];
                const verifiedKeys = [];
                for (const key of keys) {
                    const [type, ...rest] = key.split(':');
                    const uname = rest.join(':');
                    if (type === 'chreosi') {
                        const accs = await base44.asServiceRole.entities.ChreosiAccount.filter({ username: uname, is_active: true });
                        if (accs.length) verifiedKeys.push(key);
                    } else if (type === 'kanali') {
                        const accs = await base44.asServiceRole.entities.KanaliAccount.filter({ username: uname, is_active: true });
                        if (accs.length) verifiedKeys.push(key);
                    }
                }

                if (verifiedKeys.length > 0) {
                    await base44.asServiceRole.entities.PushMessage.create({
                        title: trimmedTitle,
                        body: trimmedMessage,
                        delivery_mode: 'specific',
                        target_group: null,
                        target_user_keys: verifiedKeys,
                        sender_email: sender.email,
                        is_active: true,
                        total_recipients: verifiedKeys.length,
                        acknowledged_count: 0,
                        expires_at: expiresAt,
                        disabled_at: null,
                        disabled_by: null,
                        send_batch_id: sendBatchId,
                    });
                    portalRecipientCount = verifiedKeys.length;
                    portalChreosiCount = verifiedKeys.filter(k => k.startsWith('chreosi:')).length;
                    portalKanaliCount = verifiedKeys.filter(k => k.startsWith('kanali:')).length;
                    portalDeliveryMode = 'specific';
                    pushCreated = 1;
                }

            } else {
                // Mixed: group + specific portal
                const activeChreosiKeys = new Set();
                const activeKanaliKeys = new Set();

                if (groupTargetsChreosi) {
                    const list = await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true });
                    list.forEach(a => activeChreosiKeys.add(`chreosi:${a.username}`));
                }
                if (groupTargetsKanali) {
                    const list = await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true });
                    list.forEach(a => activeKanaliKeys.add(`kanali:${a.username}`));
                }

                const finalChreosiKeys = new Set(activeChreosiKeys);
                const finalKanaliKeys = new Set(activeKanaliKeys);

                for (const key of specificPortalKeys) {
                    const [type, ...rest] = key.split(':');
                    const uname = rest.join(':');
                    if (type === 'chreosi' && !finalChreosiKeys.has(key)) {
                        const accs = await base44.asServiceRole.entities.ChreosiAccount.filter({ username: uname, is_active: true });
                        if (accs.length) finalChreosiKeys.add(key);
                    } else if (type === 'kanali' && !finalKanaliKeys.has(key)) {
                        const accs = await base44.asServiceRole.entities.KanaliAccount.filter({ username: uname, is_active: true });
                        if (accs.length) finalKanaliKeys.add(key);
                    }
                }

                const mergedKeys = [...finalChreosiKeys, ...finalKanaliKeys];

                const chreosiIsExactlyAllActive = groupTargetsChreosi && finalChreosiKeys.size === activeChreosiKeys.size;
                const kanaliIsExactlyAllActive = groupTargetsKanali && finalKanaliKeys.size === activeKanaliKeys.size;
                const chreosiSideClean = groupTargetsChreosi ? chreosiIsExactlyAllActive : finalChreosiKeys.size === 0;
                const kanaliSideClean = groupTargetsKanali ? kanaliIsExactlyAllActive : finalKanaliKeys.size === 0;
                const canCollapseToGroup = chreosiSideClean && kanaliSideClean;

                if (canCollapseToGroup) {
                    let target_group;
                    if (groupTargetsChreosi && groupTargetsKanali) target_group = 'both';
                    else if (groupTargetsChreosi) target_group = 'chreosi';
                    else target_group = 'kanali';

                    await base44.asServiceRole.entities.PushMessage.create({
                        title: trimmedTitle,
                        body: trimmedMessage,
                        delivery_mode: 'group',
                        target_group,
                        target_user_keys: [],
                        sender_email: sender.email,
                        is_active: true,
                        total_recipients: mergedKeys.length,
                        acknowledged_count: 0,
                        expires_at: expiresAt,
                        disabled_at: null,
                        disabled_by: null,
                        send_batch_id: sendBatchId,
                    });
                    portalDeliveryMode = 'group';
                } else {
                    await base44.asServiceRole.entities.PushMessage.create({
                        title: trimmedTitle,
                        body: trimmedMessage,
                        delivery_mode: 'specific',
                        target_group: null,
                        target_user_keys: mergedKeys,
                        sender_email: sender.email,
                        is_active: true,
                        total_recipients: mergedKeys.length,
                        acknowledged_count: 0,
                        expires_at: expiresAt,
                        disabled_at: null,
                        disabled_by: null,
                        send_batch_id: sendBatchId,
                    });
                    portalDeliveryMode = 'specific';
                }
                portalRecipientCount = mergedKeys.length;
                portalChreosiCount = finalChreosiKeys.size;
                portalKanaliCount = finalKanaliKeys.size;
                pushCreated = 1;
            }
        }

        // ── Create Notification rows ──────────────────────────────────────────────
        let notifCount = 0;
        if (notifRecipients.length > 0) {
            const rows = notifRecipients.map(r => ({
                recipient_type: r.recipient_type,
                recipient_username: r.email,
                title: trimmedTitle,
                message: trimmedMessage,
                type: 'info',
                read: false,
                sender_email: sender.email,
                is_active: true,
                expires_at: expiresAt,
                disabled_at: null,
                disabled_by: null,
                send_batch_id: sendBatchId,
            }));
            await base44.asServiceRole.entities.Notification.bulkCreate(rows);
            notifCount = rows.length;
        }

        // ── Summary ───────────────────────────────────────────────────────────────
        const adminCount = notifRecipients.filter(r => r.recipient_type === 'admin').length;
        const orgCount = notifRecipients.filter(r => r.recipient_type === 'organotikos').length;

        return Response.json({
            ok: true,
            notifications_created: notifCount,
            push_messages_created: pushCreated,
            admin_org_recipient_count: notifCount,
            portal_recipient_count: portalRecipientCount,
            portal_delivery_mode: portalDeliveryMode,
            send_batch_id: sendBatchId,
            expiry_enabled: expiry_enabled === true || expiry_enabled === 'true',
            expires_at: expiresAt,
            summary: {
                admins: adminCount,
                organotikoi: orgCount,
                chreosi: portalChreosiCount,
                kanali: portalKanaliCount,
            }
        });

    } catch (error) {
        console.error('notificationsSend error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});