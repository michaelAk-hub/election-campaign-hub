import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse request body
        const body = await req.json();
        const queryParams = new URLSearchParams(body.queryParams || '');
        
        // Validate custom app session
        const sessionToken = queryParams.get('session_token');
        
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

        const session = sessions[0];
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get filters from query params
        const yearFilter = queryParams.get('year');
        const symbolFilter = queryParams.get('symbol');
        const departmentFilter = queryParams.get('department');

        // Get active dataset
        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ 
                total: 0, 
                voted_yes: 0, 
                voted_no: 0, 
                voted_yes_percent: 0,
                generated_at: new Date().toISOString()
            });
        }

        // Get all Person records from active dataset with pagination (5000 limit per request)
        let allPersons = [];
        let skip = 0;
        const limit = 5000;
        let hasMore = true;

        while (hasMore) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: activeDatasets[0].id },
                '-created_date',
                limit,
                skip
            );
            allPersons = allPersons.concat(batch);
            skip += limit;
            hasMore = batch.length === limit;
        }

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
            generated_at: new Date().toISOString(),
            debug: {
                activeDatasetId: activeDatasets[0].id,
                activeDatasetStatus: activeDatasets[0].status,
                personsInDataset: allPersons.length,
                filteredPersons: filtered.length,
                sessionValid: true
            }
        });
    } catch (error) {
        console.error('Error in predictionKPIs:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});