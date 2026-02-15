import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        
        // Validate session
        const sessionToken = body.session_token;
        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ 
            session_token: sessionToken,
            is_active: true 
        });
        
        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const session = sessions[0];
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        
        if (users.length === 0 || users[0].role !== 'ADMIN') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = users[0];

        // Update admin info
        const { email, phone } = body;
        
        const updates = {};
        if (email) updates.email = email.toLowerCase();
        if (phone) updates.phone = phone;

        await base44.asServiceRole.entities.AppUser.update(admin.id, updates);

        return Response.json({ 
            success: true,
            message: 'Οι πληροφορίες ενημερώθηκαν επιτυχώς'
        });
    } catch (error) {
        console.error('Update admin info error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});