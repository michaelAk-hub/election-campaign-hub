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
        
        if (users.length === 0 || !['ADMIN'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all Person records
        const allPersons = await base44.asServiceRole.entities.Person.filter({});
        
        // Delete all Person records
        for (const person of allPersons) {
            await base44.asServiceRole.entities.Person.delete(person.id);
        }

        return Response.json({ success: true, deleted_count: allPersons.length });
    } catch (error) {
        console.error('Delete all persons error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});