import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const grid_key = searchParams.get('grid_key');

        if (!grid_key) {
            return Response.json({ error: 'Missing grid_key' }, { status: 400 });
        }

        const preferences = await base44.entities.GridPreference.filter({
            user_email: user.email,
            grid_key
        });

        if (preferences.length === 0) {
            return Response.json({ preference: null });
        }

        return Response.json({ preference: preferences[0] });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});