import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { grid_key, state_json } = await req.json();

        if (!grid_key || !state_json) {
            return Response.json({ error: 'Missing grid_key or state_json' }, { status: 400 });
        }

        // Find existing preference
        const existing = await base44.entities.GridPreference.filter({
            user_email: user.email,
            grid_key
        });

        let preference;
        if (existing.length > 0) {
            // Merge: preserve existing keys not present in new state_json
            const merged = { ...(existing[0].state_json || {}), ...state_json };
            preference = await base44.entities.GridPreference.update(existing[0].id, {
                state_json: merged
            });
        } else {
            // Create new
            preference = await base44.entities.GridPreference.create({
                user_email: user.email,
                grid_key,
                state_json
            });
        }

        return Response.json({ success: true, preference });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});