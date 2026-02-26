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
        
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { dataset_id } = body;

        // Bulk delete all Person records associated with this dataset
        await base44.asServiceRole.entities.Person.bulkDelete({ dataset_id });

        // Delete the dataset
        await base44.asServiceRole.entities.Dataset.delete(dataset_id);

        console.log(`✅ [deleteDataset] Bulk deleted persons for dataset ${dataset_id} and the dataset itself`);

        return Response.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});