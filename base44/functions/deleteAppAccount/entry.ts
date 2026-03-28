import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const { session_token } = await req.json();

        if (!session_token) {
            return Response.json({ error: 'Απαιτείται session token' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Validate session
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (sessions.length === 0) {
            return Response.json({ error: 'Μη έγκυρη συνεδρία' }, { status: 401 });
        }

        const session = sessions[0];
        const userId = session.app_user_id;

        // Deactivate all sessions for this user
        const allSessions = await base44.asServiceRole.entities.AppSession.filter({ app_user_id: userId });
        for (const s of allSessions) {
            await base44.asServiceRole.entities.AppSession.update(s.id, { is_active: false });
        }

        // Delete the AppUser record
        await base44.asServiceRole.entities.AppUser.delete(userId);

        return Response.json({ success: true });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});