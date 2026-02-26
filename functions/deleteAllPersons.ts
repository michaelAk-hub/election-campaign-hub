import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        
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
        
        if (users.length === 0 || !['ADMIN'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Count before deleting
        const allPersons = await base44.asServiceRole.entities.Person.filter({}, '-created_date', 1, 0);
        // Use bulk delete - delete all at once
        await base44.asServiceRole.entities.Person.bulkDelete({});

        // Also delete all datasets
        await base44.asServiceRole.entities.Dataset.bulkDelete({});

        console.log("✅ [deleteAllPersons] Bulk deleted all persons and datasets");

        return Response.json({ success: true, deleted_count: 'all' });
    } catch (error) {
        console.error('Delete all persons error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});