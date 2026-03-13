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

const VALID_GROUPS = ['admin', 'organotikos', 'chreosi', 'kanali', 'all'];
const VALID_USER_TYPES = ['admin', 'organotikos', 'chreosi', 'kanali'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { session_token, title, message, selectedGroups = [], selectedUsers = [] } = body;

        // --- Input validation ---
        const validation = await validateAppSession(base44, session_token);
        if (validation.error) return Response.json({ error: validation.error }, { status: validation.status });

        const { appUser: sender } = validation;

        if (!['ADMIN', 'ORGANOTIKI'].includes(sender.role)) {
            return Response.json({ error: 'Δεν έχετε δικαίωμα αποστολής' }, { status: 403 });
        }
        if (sender.role === 'ORGANOTIKI' && !sender.is_active) {
            return Response.json({ error: 'Ο λογαριασμός σας είναι ανενεργός' }, { status: 403 });
        }

        const trimmedTitle = (title || '').trim();
        const trimmedMessage = (message || '').trim();

        if (!trimmedTitle) return Response.json({ error: 'Απαιτείται τίτλος' }, { status: 400 });
        if (trimmedTitle.length > 100) return Response.json({ error: 'Ο τίτλος δεν μπορεί να υπερβαίνει τους 100 χαρακτήρες' }, { status: 400 });
        if (!trimmedMessage) return Response.json({ error: 'Απαιτείται μήνυμα' }, { status: 400 });
        if (trimmedMessage.length > 500) return Response.json({ error: 'Το μήνυμα δεν μπορεί να υπερβαίνει τους 500 χαρακτήρες' }, { status: 400 });

        // Validate and sanitize groups
        const validGroups = (Array.isArray(selectedGroups) ? selectedGroups : [])
            .filter(g => VALID_GROUPS.includes(g));

        // Validate and sanitize specific users
        const validUsers = (Array.isArray(selectedUsers) ? selectedUsers : [])
            .filter(u => u && typeof u.username === 'string' && u.username.trim() && VALID_USER_TYPES.includes(u.type))
            .map(u => ({ username: u.username.trim(), type: u.type }));

        if (validGroups.length === 0 && validUsers.length === 0) {
            return Response.json({ error: 'Απαιτείται τουλάχιστον ένας παραλήπτης' }, { status: 400 });
        }

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

        // Group: admin
        if (validGroups.includes('admin') || validGroups.includes('all')) {
            allAppUsers.filter(u => u.role === 'ADMIN').forEach(addAppUser);
        }
        // Group: organotikos (active only)
        if (validGroups.includes('organotikos') || validGroups.includes('all')) {
            allAppUsers.filter(u => u.role === 'ORGANOTIKI' && u.is_active).forEach(addAppUser);
        }

        // Specific app users
        for (const su of validUsers) {
            if (su.type === 'admin' || su.type === 'organotikos') {
                const found = allAppUsers.find(u => u.email === su.username);
                if (found) {
                    if (su.type === 'organotikos' && !found.is_active) continue; // skip inactive
                    addAppUser(found);
                }
            }
        }

        // ── Resolve Portal Users (Chreosi/Kanali) → PushMessage ──────────────────

        // Collect group-level portal targets
        const groupTargetsChreosi = validGroups.includes('chreosi') || validGroups.includes('all');
        const groupTargetsKanali = validGroups.includes('kanali') || validGroups.includes('all');

        // Collect specific portal user keys
        const specificPortalKeys = new Set();
        for (const su of validUsers) {
            if (su.type === 'chreosi') specificPortalKeys.add(`chreosi:${su.username}`);
            if (su.type === 'kanali') specificPortalKeys.add(`kanali:${su.username}`);
        }

        let portalRecipientCount = 0;
        let portalDeliveryMode = null;
        let pushCreated = 0;

        const hasGroupPortal = groupTargetsChreosi || groupTargetsKanali;
        const hasSpecificPortal = specificPortalKeys.size > 0;

        if (hasGroupPortal || hasSpecificPortal) {
            if (hasGroupPortal && !hasSpecificPortal) {
                // Pure group broadcast
                let target_group;
                if (groupTargetsChreosi && groupTargetsKanali) target_group = 'both';
                else if (groupTargetsChreosi) target_group = 'chreosi';
                else target_group = 'kanali';

                let total = 0;
                if (groupTargetsChreosi) {
                    const list = await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true });
                    total += list.length;
                }
                if (groupTargetsKanali) {
                    const list = await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true });
                    total += list.length;
                }

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
                });
                portalRecipientCount = total;
                portalDeliveryMode = 'group';
                pushCreated = 1;

            } else if (!hasGroupPortal && hasSpecificPortal) {
                // Pure specific portal send
                const keys = [...specificPortalKeys];
                // Only include keys for active accounts
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
                    });
                    portalRecipientCount = verifiedKeys.length;
                    portalDeliveryMode = 'specific';
                    pushCreated = 1;
                }

            } else {
                // Mixed: group + specific portal
                // Build a complete deduped key set: expand group recipients + add specific ones
                const allChreosiKeys = new Set();
                const allKanaliKeys = new Set();

                if (groupTargetsChreosi) {
                    const list = await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true });
                    list.forEach(a => allChreosiKeys.add(`chreosi:${a.username}`));
                }
                if (groupTargetsKanali) {
                    const list = await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true });
                    list.forEach(a => allKanaliKeys.add(`kanali:${a.username}`));
                }

                // Add specific keys (only active)
                for (const key of specificPortalKeys) {
                    const [type, ...rest] = key.split(':');
                    const uname = rest.join(':');
                    if (type === 'chreosi' && !allChreosiKeys.has(key)) {
                        const accs = await base44.asServiceRole.entities.ChreosiAccount.filter({ username: uname, is_active: true });
                        if (accs.length) allChreosiKeys.add(key);
                    } else if (type === 'kanali' && !allKanaliKeys.has(key)) {
                        const accs = await base44.asServiceRole.entities.KanaliAccount.filter({ username: uname, is_active: true });
                        if (accs.length) allKanaliKeys.add(key);
                    }
                }

                const mergedKeys = [...allChreosiKeys, ...allKanaliKeys];

                // Determine if this simplifies to a group send
                let chreosiActiveTotal = groupTargetsChreosi ? allChreosiKeys.size : null;
                let kanaliActiveTotal = groupTargetsKanali ? allKanaliKeys.size : null;

                const isWholeChreosi = groupTargetsChreosi && !groupTargetsKanali && allChreosiKeys.size === chreosiActiveTotal;
                const isWholeKanali = !groupTargetsChreosi && groupTargetsKanali && allKanaliKeys.size === kanaliActiveTotal;
                const isWholeBoth = groupTargetsChreosi && groupTargetsKanali;

                if (isWholeBoth || isWholeChreosi || isWholeKanali) {
                    // Can express as a group message
                    let target_group;
                    if (isWholeBoth) target_group = 'both';
                    else if (isWholeChreosi) target_group = 'chreosi';
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
                    });
                    portalDeliveryMode = 'group';
                } else {
                    // Mixed/partial — use specific with full key list
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
                    });
                    portalDeliveryMode = 'specific';
                }
                portalRecipientCount = mergedKeys.length;
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
            }));
            await base44.asServiceRole.entities.Notification.bulkCreate(rows);
            notifCount = rows.length;
        }

        // ── Build summary counts ──────────────────────────────────────────────────
        const adminCount = notifRecipients.filter(r => r.recipient_type === 'admin').length;
        const orgCount = notifRecipients.filter(r => r.recipient_type === 'organotikos').length;
        const chreosiCount = portalDeliveryMode
            ? (portalDeliveryMode === 'group'
                ? (await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true })).length
                : [...specificPortalKeys].filter(k => k.startsWith('chreosi:')).length)
            : 0;
        const kanaliCount = portalDeliveryMode
            ? (portalDeliveryMode === 'group'
                ? (await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true })).length
                : [...specificPortalKeys].filter(k => k.startsWith('kanali:')).length)
            : 0;

        return Response.json({
            ok: true,
            notifications_created: notifCount,
            push_messages_created: pushCreated,
            admin_org_recipient_count: notifCount,
            portal_recipient_count: portalRecipientCount,
            portal_delivery_mode: portalDeliveryMode,
            summary: {
                admins: adminCount,
                organotikoi: orgCount,
                chreosi: chreosiCount,
                kanali: kanaliCount,
            }
        });

    } catch (error) {
        console.error('notificationsSend error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});