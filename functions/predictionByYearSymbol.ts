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