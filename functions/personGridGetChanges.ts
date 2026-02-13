import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const since = searchParams.get('since'); // ISO timestamp

        if (!since) {
            return Response.json({ error: 'Missing since parameter' }, { status: 400 });
        }

        const sinceDate = new Date(since);
        const allPersons = await base44.entities.Person.list();

        // Filter persons updated after the 'since' timestamp
        const changedPersons = allPersons.filter(p => {
            const updatedAt = new Date(p.updated_date || p.created_date);
            return updatedAt > sinceDate;
        });

        return Response.json({
            changes: changedPersons,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});