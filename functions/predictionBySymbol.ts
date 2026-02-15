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
                rows: [],
                meta: {
                    symbol_count: 0,
                    generated_at: new Date().toISOString()
                }
            });
        }

        // Get all Person records from active dataset
        const allPersons = await base44.asServiceRole.entities.Person.filter({ 
            dataset_id: activeDatasets[0].id 
        });

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

        // Normalize symbol helper
        const normalizeSymbol = (sym) => {
            if (!sym) return '(Κενό)';
            const normalized = sym.trim().replace(/\s+/g, ' ');
            return normalized || '(Κενό)';
        };

        // Group by symbol
        const symbolMap = {};
        filtered.forEach(p => {
            const symbol = normalizeSymbol(p.prediction_symbol);
            if (!symbolMap[symbol]) {
                symbolMap[symbol] = { symbol, total: 0, voted_yes: 0, voted_no: 0 };
            }
            symbolMap[symbol].total++;
            if (p.voted === true) {
                symbolMap[symbol].voted_yes++;
            } else {
                symbolMap[symbol].voted_no++;
            }
        });

        // Convert to array and sort by total DESC, symbol ASC
        const rows = Object.values(symbolMap).sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return a.symbol.localeCompare(b.symbol, 'el');
        });

        return Response.json({
            rows,
            meta: {
                symbol_count: rows.length,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error in predictionBySymbol:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});