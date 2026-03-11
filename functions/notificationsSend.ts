import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, title, message, selectedGroups = [], selectedUsers = [] } = await req.json();

        if (!session_token) return Response.json({ error: 'Απαιτείται session token' }, { status: 401 });
        if (!title?.trim()) return Response.json({ error: 'Απαιτείται τίτλος' }, { status: 400 });
        if (!message?.trim()) return Response.json({ error: 'Απαιτείται μήνυμα' }, { status: 400 });
        if (selectedGroups.length === 0 && selectedUsers.length === 0) {
            return Response.json({ error: 'Απαιτείται τουλάχιστον ένας παραλήπτης' }, { status: 400 });
        }

        // Validate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions.length) return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });

        const session = sessions[0];
        const senderList = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (!senderList.length) return Response.json({ error: 'Χρήστης δεν βρέθηκε' }, { status: 401 });

        const sender = senderList[0];
        if (!['ADMIN', 'ORGANOTIKI'].includes(sender.role)) {
            return Response.json({ error: 'Δεν έχετε δικαίωμα αποστολής' }, { status: 403 });
        }

        const trimmedTitle = title.trim();
        const trimmedMessage = message.trim();

        // ── 1. Resolve Admin/Organotikos → Notification rows ──────────────────
        const notifSet = new Set(); // deduplicate by email
        const notifRecipients = [];

        const addAppUser = (user) => {
            if (!notifSet.has(user.email)) {
                notifSet.add(user.email);
                notifRecipients.push({
                    email: user.email,
                    recipient_type: user.role === 'ADMIN' ? 'admin' : 'organotikos',
                });
            }
        };

        const needsAppUsers = selectedGroups.some(g => ['admin', 'organotikos', 'all'].includes(g));
        let allAppUsers = [];
        if (needsAppUsers) {
            allAppUsers = await base44.asServiceRole.entities.AppUser.list();
        }

        for (const group of selectedGroups) {
            if (group === 'admin') {
                allAppUsers.filter(u => u.role === 'ADMIN').forEach(addAppUser);
            } else if (group === 'organotikos') {
                allAppUsers.filter(u => u.role === 'ORGANOTIKI').forEach(addAppUser);
            } else if (group === 'all') {
                allAppUsers.forEach(addAppUser);
            }
        }

        // Specific admin/organotikos users
        for (const su of selectedUsers) {
            if (su.type === 'admin' || su.type === 'organotikos') {
                if (!notifSet.has(su.username)) {
                    notifSet.add(su.username);
                    notifRecipients.push({ email: su.username, recipient_type: su.type });
                }
            }
        }

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

        // ── 2. Resolve Chreosi/Kanali → PushMessage ────────────────────────────
        const needsChreosi = selectedGroups.includes('chreosi') || selectedGroups.includes('all')
            || selectedUsers.some(u => u.type === 'chreosi');
        const needsKanali = selectedGroups.includes('kanali') || selectedGroups.includes('all')
            || selectedUsers.some(u => u.type === 'kanali');

        let pushCount = 0;
        if (needsChreosi || needsKanali) {
            let target_group;
            if (needsChreosi && needsKanali) target_group = 'both';
            else if (needsChreosi) target_group = 'chreosi';
            else target_group = 'kanali';

            let totalRecipients = 0;
            if (needsChreosi) {
                const chreosi = await base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true });
                totalRecipients += chreosi.length;
            }
            if (needsKanali) {
                const kanali = await base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true });
                totalRecipients += kanali.length;
            }

            await base44.asServiceRole.entities.PushMessage.create({
                title: trimmedTitle,
                body: trimmedMessage,
                target_group,
                sender_email: sender.email,
                is_active: true,
                total_recipients: totalRecipients,
                acknowledged_count: 0,
            });
            pushCount = 1;
        }

        return Response.json({
            ok: true,
            notifications_created: notifCount,
            push_messages_created: pushCount,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});