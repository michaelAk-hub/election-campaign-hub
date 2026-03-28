import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const sessionToken = body.session_token;

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized: No session token' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ years: [], symbols: [], departments: [] });
        }

        const activeDatasetId = activeDatasets[0].id;

        let allPersons = [];
        let skip = 0;
        const limit = 500;

        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: activeDatasetId },
                '-created_date',
                limit,
                skip
            );
            const items = Array.isArray(batch) ? batch : [];
            if (!items.length) break;
            allPersons = allPersons.concat(items);
            if (items.length < limit) break;
            skip += limit;
        }

        const years = [...new Set(allPersons.map(p => p.admission_year).filter(Boolean))]
            .sort((a, b) => String(b).localeCompare(String(a)));

        const symbols = [...new Set(allPersons.map(p => (p.prediction_symbol || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'el'));

        const departments = [...new Set(allPersons.map(p => p.department).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'el'));

        return Response.json({ years, symbols, departments });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});