import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, target_user_id, target_role, new_status } = await req.json();

        if (!session_token || !target_user_id || !target_role || typeof new_status !== 'boolean') {
            return Response.json({ error: 'Λείπουν απαιτούμενα πεδία' }, { status: 400 });
        }

        // Validate actor session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const session = sessions[0];
        const actorUsers = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        
        if (actorUsers.length === 0) {
            return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 401 });
        }

        const actor = actorUsers[0];
        const actorRole = actor.role; // ADMIN or ORGANOTIKI

        // Permission checks based on the spec
        const canPerformAction = (actorRole, targetRole) => {
            if (actorRole === 'ADMIN') {
                // ADMIN can activate/deactivate ORGANOTIKI, KANALI, CHREOSI
                // but NOT ADMIN
                return targetRole !== 'ADMIN';
            } else if (actorRole === 'ORGANOTIKI') {
                // ORGANOTIKI can only activate/deactivate ORGANOTIKI
                return targetRole === 'ORGANOTIKI';
            }
            return false;
        };

        if (!canPerformAction(actorRole, target_role)) {
            return Response.json({ 
                error: `Δεν έχετε δικαίωμα να αλλάξετε την κατάσταση ${target_role} χρηστών` 
            }, { status: 403 });
        }

        // Get target user and current status based on role
        let targetUser, oldStatus, entityName;

        if (target_role === 'ADMIN' || target_role === 'ORGANOTIKI') {
            entityName = 'AppUser';
            const users = await base44.asServiceRole.entities.AppUser.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active || false;
        } else if (target_role === 'KANALI') {
            entityName = 'KanaliAccount';
            const users = await base44.asServiceRole.entities.KanaliAccount.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active !== false;
        } else if (target_role === 'CHREOSI') {
            entityName = 'ChreosiAccount';
            const users = await base44.asServiceRole.entities.ChreosiAccount.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active !== false;
        } else {
            return Response.json({ error: 'Μη έγκυρος τύπος χρήστη' }, { status: 400 });
        }

        // Update the user status
        if (entityName === 'AppUser') {
            await base44.asServiceRole.entities.AppUser.update(target_user_id, {
                is_active: new_status
            });
        } else if (entityName === 'KanaliAccount') {
            await base44.asServiceRole.entities.KanaliAccount.update(target_user_id, {
                is_active: new_status
            });
        } else if (entityName === 'ChreosiAccount') {
            await base44.asServiceRole.entities.ChreosiAccount.update(target_user_id, {
                is_active: new_status
            });
        }

        // Invalidate sessions if deactivating
        if (!new_status) {
            if (target_role === 'ADMIN' || target_role === 'ORGANOTIKI') {
                const userSessions = await base44.asServiceRole.entities.AppSession.filter({
                    app_user_id: target_user_id,
                    is_active: true
                });
                for (const userSession of userSessions) {
                    await base44.asServiceRole.entities.AppSession.update(userSession.id, { is_active: false });
                }
            } else if (target_role === 'KANALI' || target_role === 'CHREOSI') {
                const userSessions = await base44.asServiceRole.entities.PortalSession.filter({
                    username: targetUser.username,
                    is_active: true
                });
                for (const userSession of userSessions) {
                    await base44.asServiceRole.entities.PortalSession.update(userSession.id, { is_active: false });
                }
            }
        }

        // Audit log
        await base44.asServiceRole.entities.UserActivationLog.create({
            actor_user_id: actor.id,
            actor_role: actorRole,
            target_user_id: target_user_id,
            target_role: target_role,
            old_status: oldStatus,
            new_status: new_status,
            action_type: new_status ? 'activate' : 'deactivate',
            timestamp: new Date().toISOString()
        });

        // Create notification for target user
        const actionText = new_status ? 'ενεργοποιήθηκε' : 'απενεργοποιήθηκε';
        if (target_role === 'ORGANOTIKI') {
            await base44.asServiceRole.entities.Notification.create({
                recipient_type: 'organotikos',
                recipient_username: targetUser.email,
                type: new_status ? 'success' : 'warning',
                category: 'account_update',
                title: `Ο λογαριασμός σας ${actionText}`,
                message: `Ο διαχειριστής ${actor.name} ${actor.surname} ${actionText} τον λογαριασμό σας.`
            });
        }

        return Response.json({
            success: true,
            message: `Ο χρήστης ${actionText} επιτυχώς`,
            new_status
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});