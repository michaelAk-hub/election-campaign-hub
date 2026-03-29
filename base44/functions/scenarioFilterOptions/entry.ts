import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BLANK_SYMBOL = '(Κενό)';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (!['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!datasets?.length) return Response.json({ symbols: [], academic_levels: [], admission_years: [] });

        const datasetId = datasets[0].id;

        const symbolSet = new Set();
        const levelSet = new Set();
        const yearSet = new Set();

        let skip = 0;
        const batchSize = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter({ dataset_id: datasetId }, '-created_date', batchSize, skip);
            if (!batch?.length) break;

            for (const p of batch) {
                const sym = p.prediction_symbol?.trim();
                // Blank/null/empty → BLANK_SYMBOL; real "-" stays as "-"
                symbolSet.add((sym && sym !== '') ? sym : BLANK_SYMBOL);
                if (p.academic_level?.trim()) levelSet.add(p.academic_level.trim());
                if (p.admission_year?.trim()) yearSet.add(p.admission_year.trim());
            }

            if (batch.length < batchSize) break;
            skip += batchSize;
        }

        return Response.json({
            symbols: [...symbolSet].sort(),
            academic_levels: [...levelSet].sort(),
            admission_years: [...yearSet].sort(),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});