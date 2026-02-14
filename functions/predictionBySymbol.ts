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