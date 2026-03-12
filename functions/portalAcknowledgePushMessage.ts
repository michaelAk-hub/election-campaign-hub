import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { sessionToken, username, messageId } = await req.json();

        if (!sessionToken || !username || !messageId) {
            return Response.json({ success: false, error: 'Missing fields' }, { status: 400 });
        }

        // Validate session
        const sessions = await base44.asServiceRole.entities.PortalSession.filter({
            session_token: sessionToken,
            username,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ success: false, error: 'Invalid session' }, { status: 401 });
        }

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
        }

        // Idempotency check: has this user already acknowledged this message?
        const existingAcks = await base44.asServiceRole.entities.PushMessageAck.filter({
            message_id: messageId,
            username
        });

        if (existingAcks.length > 0) {
            // Already acknowledged — idempotent success, no double-increment
            return Response.json({ success: true });
        }

        // Get the message to increment counter (list active messages, find by id)
        const allMessages = await base44.asServiceRole.entities.PushMessage.filter({ is_active: true });
        const message = allMessages.find(m => m.id === messageId);

        if (!message) {
            return Response.json({ success: false, error: 'Message not found' }, { status: 404 });
        }

        // Write ack then increment counter (both awaited)
        await base44.asServiceRole.entities.PushMessageAck.create({
            message_id: messageId,
            recipient_type: session.portal_type,
            username,
            acknowledged_at: new Date().toISOString()
        });

        await base44.asServiceRole.entities.PushMessage.update(messageId, {
            acknowledged_count: (message.acknowledged_count || 0) + 1
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('portalAcknowledgePushMessage error:', error);
        return Response.json({ success: false, error: 'Server error' }, { status: 500 });
    }
});