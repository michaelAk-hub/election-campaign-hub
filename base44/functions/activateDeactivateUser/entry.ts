import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token, target_user_id, target_role, new_status } = await req.json();

        // Validate session
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

        // Permission check based on specification
        const canPerformAction = (actorRole, targetRole) => {
            if (actorRole === 'ADMIN') {
                // ADMIN can activate/deactivate ORGANOTIKI, KANALI, CHREOSI (but not ADMIN)
                return ['ORGANOTIKI', 'KANALI', 'CHREOSI'].includes(targetRole);
            } else if (actorRole === 'ORGANOTIKI') {
                // ORGANOTIKI can only activate/deactivate ORGANOTIKI
                return targetRole === 'ORGANOTIKI';
            }
            return false;
        };

        if (!canPerformAction(actorRole, target_role)) {
            return Response.json({ 
                error: `Δεν έχετε δικαίωμα να αλλάξετε την κατάσταση χρήστη ${target_role}` 
            }, { status: 403 });
        }

        // Get target user and update status based on role
        let targetUser = null;
        let oldStatus = false;
        const action = new_status ? 'activate' : 'deactivate';

        if (target_role === 'ADMIN' || target_role === 'ORGANOTIKI') {
            const users = await base44.asServiceRole.entities.AppUser.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active;

            // Update status
            await base44.asServiceRole.entities.AppUser.update(target_user_id, {
                is_active: new_status
            });

            // If deactivating, invalidate all sessions
            if (!new_status) {
                const userSessions = await base44.asServiceRole.entities.AppSession.filter({
                    app_user_id: target_user_id,
                    is_active: true
                });
                for (const userSession of userSessions) {
                    await base44.asServiceRole.entities.AppSession.update(userSession.id, { is_active: false });
                }
            }

        } else if (target_role === 'KANALI') {
            const users = await base44.asServiceRole.entities.KanaliAccount.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active;

            await base44.asServiceRole.entities.KanaliAccount.update(target_user_id, {
                is_active: new_status
            });

            // If deactivating, invalidate all sessions
            if (!new_status) {
                const userSessions = await base44.asServiceRole.entities.PortalSession.filter({
                    username: targetUser.username,
                    portal_type: 'kanali',
                    is_active: true
                });
                for (const userSession of userSessions) {
                    await base44.asServiceRole.entities.PortalSession.update(userSession.id, { is_active: false });
                }
            }

        } else if (target_role === 'CHREOSI') {
            const users = await base44.asServiceRole.entities.ChreosiAccount.filter({ id: target_user_id });
            if (users.length === 0) {
                return Response.json({ error: 'Χρήστης δε βρέθηκε' }, { status: 404 });
            }
            targetUser = users[0];
            oldStatus = targetUser.is_active;

            await base44.asServiceRole.entities.ChreosiAccount.update(target_user_id, {
                is_active: new_status
            });

            // If deactivating, invalidate all sessions
            if (!new_status) {
                const userSessions = await base44.asServiceRole.entities.PortalSession.filter({
                    username: targetUser.username,
                    portal_type: 'chreosi',
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
            action: action
        });

        return Response.json({
            success: true,
            message: `Χρήστης ${new_status ? 'ενεργοποιήθηκε' : 'απενεργοποιήθηκε'} επιτυχώς`
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});