import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function strictAuth(base44, session_token) {
    if (!session_token) return { error: 'Unauthorized: No session token', status: 401 };
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (!sessions?.length) return { error: 'Invalid session', status: 401 };
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) return { error: 'Session expired', status: 401 };
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
    if (!users?.length) return { error: 'User not found', status: 401 };
    const user = users[0];
    if (!user.is_active && user.role !== 'ADMIN') return { error: 'Account inactive', status: 401 };
    if (session.session_version_at_login !== undefined && user.session_version !== undefined &&
        session.session_version_at_login !== user.session_version) return { error: 'Session invalidated', status: 401 };
    if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) return { error: 'Forbidden', status: 403 };
    return { user, session };
}

async function deleteAllForDataset(base44, entityName, datasetId) {
    let skip = 0;
    const limit = 200;
    while (true) {
        const rows = await base44.asServiceRole.entities[entityName].filter({ dataset_id: datasetId }, null, limit, skip);
        if (!rows?.length) break;
        for (const row of rows) {
            await base44.asServiceRole.entities[entityName].delete(row.id);
        }
        if (rows.length < limit) break;
        skip += limit;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token, dataset_id: requestedDatasetId } = body;

        const auth = await strictAuth(base44, session_token);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        // Determine target dataset
        let dataset;
        if (requestedDatasetId) {
            const datasets = await base44.asServiceRole.entities.Dataset.filter({ id: requestedDatasetId });
            dataset = datasets?.[0] || null;
        } else {
            const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
            dataset = activeDatasets?.[0] || null;
        }

        if (!dataset) {
            return Response.json({ success: true, message: 'No dataset found, nothing to rebuild', rebuilt: 0 });
        }

        const datasetId = dataset.id;
        const now = new Date().toISOString();

        // Scan Person once — all persons in this dataset
        const overallMap = { total: 0, voted_yes: 0, voted_no: 0 };
        const symbolMap = {}; // symbol -> {total, voted_yes, voted_no}
        const yearSymbolMap = {}; // "year::symbol" -> {admission_year, symbol, total, voted_yes, voted_no}
        const yearsSet = new Set();
        const symbolsSet = new Set();
        const depsSet = new Set();

        const normalizeSymbol = (sym) => {
            if (!sym) return '(Κενό)';
            const n = sym.trim().replace(/\s+/g, ' ');
            return n || '(Κενό)';
        };
        const normalizeYear = (year) => year ? String(year) : '(Άγνωστο)';

        let skip = 0;
        const limit = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: datasetId }, '-created_date', limit, skip
            );
            if (!batch?.length) break;
            for (const p of batch) {
                const symbol = normalizeSymbol(p.prediction_symbol);
                const year = normalizeYear(p.admission_year);
                const voted = p.voted === true;

                // Overall
                overallMap.total++;
                if (voted) overallMap.voted_yes++; else overallMap.voted_no++;

                // By symbol
                if (!symbolMap[symbol]) symbolMap[symbol] = { total: 0, voted_yes: 0, voted_no: 0 };
                symbolMap[symbol].total++;
                if (voted) symbolMap[symbol].voted_yes++; else symbolMap[symbol].voted_no++;

                // By year+symbol
                const key = `${year}::${symbol}`;
                if (!yearSymbolMap[key]) yearSymbolMap[key] = { admission_year: year, symbol, total: 0, voted_yes: 0, voted_no: 0 };
                yearSymbolMap[key].total++;
                if (voted) yearSymbolMap[key].voted_yes++; else yearSymbolMap[key].voted_no++;

                // Filter cache sets
                if (p.admission_year) yearsSet.add(String(p.admission_year));
                if (p.prediction_symbol?.trim()) symbolsSet.add(p.prediction_symbol.trim().replace(/\s+/g, ' '));
                if (p.department) depsSet.add(p.department);
            }
            if (batch.length < limit) break;
            skip += limit;
        }

        // Delete old cache rows and recreate
        await Promise.all([
            deleteAllForDataset(base44, 'PredictionStatsOverall', datasetId),
            deleteAllForDataset(base44, 'PredictionStatsBySymbol', datasetId),
            deleteAllForDataset(base44, 'PredictionStatsByYearSymbol', datasetId),
            deleteAllForDataset(base44, 'PredictionFilterCache', datasetId),
        ]);

        // Write overall
        await base44.asServiceRole.entities.PredictionStatsOverall.create({
            dataset_id: datasetId,
            total: overallMap.total,
            voted_yes: overallMap.voted_yes,
            voted_no: overallMap.voted_no,
            updated_at: now,
        });

        // Write by symbol
        for (const [symbol, stats] of Object.entries(symbolMap)) {
            await base44.asServiceRole.entities.PredictionStatsBySymbol.create({
                dataset_id: datasetId,
                symbol,
                total: stats.total,
                voted_yes: stats.voted_yes,
                voted_no: stats.voted_no,
                updated_at: now,
            });
        }

        // Write by year+symbol
        for (const [, stats] of Object.entries(yearSymbolMap)) {
            await base44.asServiceRole.entities.PredictionStatsByYearSymbol.create({
                dataset_id: datasetId,
                admission_year: stats.admission_year,
                symbol: stats.symbol,
                total: stats.total,
                voted_yes: stats.voted_yes,
                voted_no: stats.voted_no,
                updated_at: now,
            });
        }

        // Write filter cache
        const sortedYears = [...yearsSet].sort((a, b) => String(b).localeCompare(String(a)));
        const sortedSymbols = [...symbolsSet].sort((a, b) => a.localeCompare(b, 'el'));
        const sortedDeps = [...depsSet].sort((a, b) => a.localeCompare(b, 'el'));

        await base44.asServiceRole.entities.PredictionFilterCache.create({
            dataset_id: datasetId,
            years_json: { data: sortedYears },
            symbols_json: { data: sortedSymbols },
            departments_json: { data: sortedDeps },
            updated_at: now,
        });

        return Response.json({
            success: true,
            dataset_id: datasetId,
            rebuilt: {
                total_persons: overallMap.total,
                symbols: Object.keys(symbolMap).length,
                year_symbol_rows: Object.keys(yearSymbolMap).length,
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});