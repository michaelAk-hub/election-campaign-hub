import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { grid_key } = await req.json();

        if (!grid_key) {
            return Response.json({ error: 'Missing grid_key' }, { status: 400 });
        }

        const preferences = await base44.entities.GridPreference.filter({
            user_email: user.email,
            grid_key
        });

        if (preferences.length > 0) {
            await base44.entities.GridPreference.delete(preferences[0].id);
        }

        return Response.json({ success: true });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});