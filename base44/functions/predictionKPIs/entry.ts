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

        const yearFilter = body.year || null;
        const symbolFilter = body.symbol || null;
        const departmentFilter = body.department || null;

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, generated_at: new Date().toISOString() });
        }

        let allPersons = [];
        let skip = 0;
        const limit = 500;

        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: activeDatasets[0].id },
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

        let filtered = allPersons;

        if (yearFilter) {
            const years = yearFilter.split(',').map(y => y.trim());
            filtered = filtered.filter(p => years.includes(String(p.admission_year || '')));
        }
        if (symbolFilter) {
            const symbols = symbolFilter.split(',').map(s => s.trim());
            filtered = filtered.filter(p => symbols.includes((p.prediction_symbol || '').trim() || '(Κενό)'));
        }
        if (departmentFilter) {
            const departments = departmentFilter.split(',').map(d => d.trim());
            filtered = filtered.filter(p => departments.includes(p.department || ''));
        }

        const total = filtered.length;
        const voted_yes = filtered.filter(p => p.voted === true).length;
        const voted_no = total - voted_yes;
        const voted_yes_percent = total > 0 ? parseFloat((voted_yes / total * 100).toFixed(2)) : 0;

        return Response.json({ total, voted_yes, voted_no, voted_yes_percent, generated_at: new Date().toISOString() });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});