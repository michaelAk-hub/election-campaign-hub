import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token, scenario_id, scenario } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const user = users[0];
        if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

        if (!scenario_id) {
            // Create: check limit
            const existing = await base44.asServiceRole.entities.PredictionScenario.list('display_order', 10);
            if ((existing || []).length >= 4) {
                return Response.json({ error: 'MAX_LIMIT', message: 'Υπάρχουν ήδη 4 σενάρια. Διαγράψτε ένα πρώτα.' }, { status: 400 });
            }
            const created = await base44.asServiceRole.entities.PredictionScenario.create({
                name: scenario.name,
                total_seats: scenario.total_seats,
                display_order: scenario.display_order || (existing.length + 1),
                is_active: true,
                config_json: scenario.config_json,
            });
            return Response.json({ scenario: created });
        } else {
            // Update
            const updated = await base44.asServiceRole.entities.PredictionScenario.update(scenario_id, {
                name: scenario.name,
                total_seats: scenario.total_seats,
                display_order: scenario.display_order,
                config_json: scenario.config_json,
            });
            return Response.json({ scenario: updated });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});