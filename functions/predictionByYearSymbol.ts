import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate custom app session
        const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '') || 
                            new URL(req.url).searchParams.get('session_token');
        
        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

        const url = new URL(req.url);
        const yearFilter = url.searchParams.get('year');
        const symbolFilter = url.searchParams.get('symbol');
        const departmentFilter = url.searchParams.get('department');

        // Get active dataset
        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ 
                rows: [],
                meta: {
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

        // Normalize helpers
        const normalizeSymbol = (sym) => {
            if (!sym) return '(Κενό)';
            const normalized = sym.trim().replace(/\s+/g, ' ');
            return normalized || '(Κενό)';
        };

        const normalizeYear = (year) => {
            return year ? String(year) : '(Άγνωστο)';
        };

        // Group by year and symbol
        const yearSymbolMap = {};
        filtered.forEach(p => {
            const year = normalizeYear(p.admission_year);
            const symbol = normalizeSymbol(p.prediction_symbol);
            const key = `${year}::${symbol}`;
            
            if (!yearSymbolMap[key]) {
                yearSymbolMap[key] = { 
                    admission_year: year, 
                    symbol, 
                    total: 0, 
                    voted_yes: 0, 
                    voted_no: 0 
                };
            }
            yearSymbolMap[key].total++;
            if (p.voted === true) {
                yearSymbolMap[key].voted_yes++;
            } else {
                yearSymbolMap[key].voted_no++;
            }
        });

        // Convert to array and sort
        const rows = Object.values(yearSymbolMap).sort((a, b) => {
            // Sort by year DESC, total DESC, symbol ASC
            if (a.admission_year !== b.admission_year) {
                if (a.admission_year === '(Άγνωστο)') return 1;
                if (b.admission_year === '(Άγνωστο)') return -1;
                return b.admission_year.localeCompare(a.admission_year);
            }
            if (b.total !== a.total) return b.total - a.total;
            return a.symbol.localeCompare(b.symbol, 'el');
        });

        return Response.json({
            rows,
            meta: {
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error in predictionByYearSymbol:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});