import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || !['admin', 'user'].includes(user.role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const yearFilter = url.searchParams.get('year');
        const symbolFilter = url.searchParams.get('symbol');
        const departmentFilter = url.searchParams.get('department');

        // Get all Person records from active dataset
        const allPersons = await base44.asServiceRole.entities.Person.filter({});

        // Apply filters
        let filtered = allPersons;

        if (yearFilter) {
            const years = yearFilter.split(',').map(y => y.trim());
            filtered = filtered.filter(p => years.includes(String(p.admission_year || '')));
        }

        if (symbolFilter) {
            const symbols = symbolFilter.split(',').map(s => s.trim());
            filtered = filtered.filter(p => {
                const sym = (p.prediction_symbol || '').trim() || null;
                return symbols.includes(sym || '(Κενό)');
            });
        }

        if (departmentFilter) {
            const departments = departmentFilter.split(',').map(d => d.trim());
            filtered = filtered.filter(p => departments.includes(p.department || ''));
        }

        // Calculate KPIs
        const total = filtered.length;
        const voted_yes = filtered.filter(p => p.voted === true).length;
        const voted_no = total - voted_yes;
        const voted_yes_percent = total > 0 ? (voted_yes / total * 100) : 0;

        return Response.json({
            total,
            voted_yes,
            voted_no,
            voted_yes_percent: parseFloat(voted_yes_percent.toFixed(2)),
            generated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in predictionKPIs:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});