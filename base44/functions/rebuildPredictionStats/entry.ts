import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function retryOp(fn, maxRetries = 6) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e) {
            const msg = (e.message || '').toLowerCase();
            const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit');
            if (isRateLimit && i < maxRetries - 1) {
                const delay = 1500 * (i + 1);
                await sleep(delay);
            } else {
                throw e;
            }
        }
    }
}

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

// Upsert: update existing row if found, otherwise create
async function upsertRow(base44, entityName, filterKey, data) {
    const existing = await retryOp(() => base44.asServiceRole.entities[entityName].filter(filterKey));
    if (existing?.length) {
        await retryOp(() => base44.asServiceRole.entities[entityName].update(existing[0].id, data));
    } else {
        await retryOp(() => base44.asServiceRole.entities[entityName].create(data));
    }
    await sleep(120);
}

const parseBatch = (batch) => {
    if (Array.isArray(batch)) return batch;
    if (typeof batch !== 'string' || !batch.length) return [];
    let s = batch.trim();
    if (!s.startsWith('[')) s = '[' + s;
    const lastClose = s.lastIndexOf('}');
    if (lastClose === -1) return [];
    s = s.slice(0, lastClose + 1) + ']';
    try { return JSON.parse(s); } catch { return []; }
};

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

        // Scan all Person rows
        const overallMap = { total: 0, voted_yes: 0, voted_no: 0 };
        const symbolMap = {};
        const yearSymbolMap = {};
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
        const query = { $and: [{ dataset_id: datasetId }] };
        console.log(`[rebuild] START scanning datasetId=${datasetId}`);

        while (true) {
            let batch;
            let retries = 0;
            while (retries < 6) {
                try {
                    batch = await base44.asServiceRole.entities.Person.filter(query, 'created_date', limit, skip);
                    break;
                } catch (e) {
                    const msg = (e.message || '').toLowerCase();
                    if ((msg.includes('429') || msg.includes('rate limit')) && retries < 5) {
                        retries++;
                        await sleep(2000 * retries);
                    } else throw e;
                }
            }

            const rows = parseBatch(batch);
            if (!rows.length) break;
            console.log(`[rebuild] skip=${skip} got=${rows.length}`);

            for (const p of rows) {
                const symbol = normalizeSymbol(p.prediction_symbol);
                const year = normalizeYear(p.admission_year);
                const voted = p.voted === true;

                overallMap.total++;
                if (voted) overallMap.voted_yes++; else overallMap.voted_no++;

                if (!symbolMap[symbol]) symbolMap[symbol] = { total: 0, voted_yes: 0, voted_no: 0 };
                symbolMap[symbol].total++;
                if (voted) symbolMap[symbol].voted_yes++; else symbolMap[symbol].voted_no++;

                const key = `${year}::${symbol}`;
                if (!yearSymbolMap[key]) yearSymbolMap[key] = { admission_year: year, symbol, total: 0, voted_yes: 0, voted_no: 0 };
                yearSymbolMap[key].total++;
                if (voted) yearSymbolMap[key].voted_yes++; else yearSymbolMap[key].voted_no++;

                if (p.admission_year) yearsSet.add(String(p.admission_year));
                if (p.prediction_symbol?.trim()) symbolsSet.add(p.prediction_symbol.trim().replace(/\s+/g, ' '));
                if (p.department) depsSet.add(p.department);
            }

            if (rows.length < 10) break;
            skip += rows.length;
            await sleep(200);
        }

        console.log(`[rebuild] DONE total=${overallMap.total} symbols=${Object.keys(symbolMap).length} yearSymbol=${Object.keys(yearSymbolMap).length}`);

        // Upsert overall stats
        await upsertRow(base44, 'PredictionStatsOverall',
            { dataset_id: datasetId },
            { dataset_id: datasetId, total: overallMap.total, voted_yes: overallMap.voted_yes, voted_no: overallMap.voted_no, updated_at: now }
        );

        // Upsert by symbol
        for (const [symbol, stats] of Object.entries(symbolMap)) {
            await upsertRow(base44, 'PredictionStatsBySymbol',
                { dataset_id: datasetId, symbol },
                { dataset_id: datasetId, symbol, total: stats.total, voted_yes: stats.voted_yes, voted_no: stats.voted_no, updated_at: now }
            );
        }

        // Upsert by year+symbol
        for (const [, stats] of Object.entries(yearSymbolMap)) {
            await upsertRow(base44, 'PredictionStatsByYearSymbol',
                { dataset_id: datasetId, admission_year: stats.admission_year, symbol: stats.symbol },
                { dataset_id: datasetId, admission_year: stats.admission_year, symbol: stats.symbol, total: stats.total, voted_yes: stats.voted_yes, voted_no: stats.voted_no, updated_at: now }
            );
        }

        // Upsert filter cache
        const sortedYears = [...yearsSet].sort((a, b) => String(b).localeCompare(String(a)));
        const sortedSymbols = [...symbolsSet].sort((a, b) => a.localeCompare(b, 'el'));
        const sortedDeps = [...depsSet].sort((a, b) => a.localeCompare(b, 'el'));

        await upsertRow(base44, 'PredictionFilterCache',
            { dataset_id: datasetId },
            { dataset_id: datasetId, years_json: { data: sortedYears }, symbols_json: { data: sortedSymbols }, departments_json: { data: sortedDeps }, updated_at: now }
        );

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
        console.error('[rebuildPredictionStats] error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});