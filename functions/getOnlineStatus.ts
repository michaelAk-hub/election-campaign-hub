import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ONLINE_WINDOW_SECONDS = 120; // 2 minutes

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Missing session_token' }, { status: 400 });
        }

        // Validate session and check if user is Admin or Organotiko
        const { data: validationData } = await base44.functions.invoke('validateAppSession', {
            session_token: session_token
        });

        if (!validationData.valid) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = validationData.user;
        if (user.role !== 'ADMIN' && user.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Access denied' }, { status: 403 });
        }

        // Get all active sessions
        const now = new Date();
        const onlineThreshold = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1000);

        const allSessions = await base44.asServiceRole.entities.AppSession.list('-last_seen_at', 1000);

        // Filter sessions that are:
        // 1. is_active = true
        // 2. expires_at > now
        // 3. last_seen_at >= now - ONLINE_WINDOW
        const onlineUserIds = new Set();
        const lastSeenMap = {};

        for (const session of allSessions) {
            if (!session.is_active) continue;
            
            const expiresAt = new Date(session.expires_at);
            if (expiresAt <= now) continue;

            if (!session.last_seen_at) continue;
            
            const lastSeenAt = new Date(session.last_seen_at);
            if (lastSeenAt < onlineThreshold) continue;

            // User is online
            onlineUserIds.add(session.app_user_id);
            
            // Keep the most recent last_seen_at for each user
            if (!lastSeenMap[session.app_user_id] || lastSeenAt > new Date(lastSeenMap[session.app_user_id])) {
                lastSeenMap[session.app_user_id] = session.last_seen_at;
            }
        }

        return Response.json({
            online_user_ids: Array.from(onlineUserIds),
            last_seen: lastSeenMap
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});