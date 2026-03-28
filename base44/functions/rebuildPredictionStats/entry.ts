import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const APP_ID = Deno.env.get('BASE44_APP_ID');
const API_BASE = `https://api.base44.com/api/apps/${APP_ID}`;

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

// Fetch persons page by page via Base44 REST API (bypasses SDK string truncation)
async function fetchPersonsPage(serviceToken, datasetId, skip, limit) {
    const query = encodeURIComponent(JSON.stringify({ dataset_id: datasetId }));
    const url = `${API_BASE}/entities/Person?query=${query}&sort=created_date&limit=${limit}&skip=${skip}`;
    const resp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${serviceToken}`,
            'Content-Type': 'application/json',
        }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Person fetch failed: ${resp.status} ${text.slice(0, 200)}`);
    }
    const json = await resp.json();
    // Response is array or {data: [...]}
    return Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
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

// Get the service role API token for REST calls
async function getServiceToken(base44) {
    // Use the SDK's internal service role token by making a test call and reading headers
    // Instead, derive it from the app's service role via a known pattern
    // We'll use the same approach as deleteDataset: get token from auth header of a test entity call
    try {
        const resp = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        // If this works, we need to get the token differently
        // The service token is stored as env var in some setups, try common names
        return null; // Will be determined below
    } catch (_) {
        return null;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token, dataset_id: requestedDatasetId } = body;

        const auth = await strictAuth(base44, session_token);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        // Determine target dataset using SDK (small result set, works fine)
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

        // Accumulator maps
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

        // Scan all Person rows for this dataset using the REST API directly
        // We need the service role bearer token — extract it from the Authorization header the SDK would use
        // The SDK's asServiceRole internally uses a service token. We can get it by doing an OPTIONS or
        // by reading from env. The service token is available as BASE44_SERVICE_TOKEN in some versions.
        // Fallback: use the incoming user's request auth to call personGridFetch as a helper.
        
        // Best approach: call personGridFetch (which works) via internal function invoke
        // But that returns rows+lastRow format. Instead, let's use the SDK's filter with $and 
        // on small cache entities, and for Person use the direct approach via the request's
        // own authorization to read the service role token.

        // The most reliable approach: use a service role client and read via HTTP with the service key
        // BASE44_SERVICE_ROLE_KEY is not available. Instead piggyback on SDK's internal HTTP client.
        // 
        // ACTUAL FIX: The SDK filter() on large entities returns truncated strings.
        // Use the user's AppSession + the internal API with the user's session to call personGridFetch
        // OR use the admin user's base44 client (non-service-role) which has proper pagination.
        
        // Try using base44 (non-service-role) filter which uses the request user's auth:
        let skip = 0;
        const limit = 200;
        let pagesDone = 0;

        while (true) {
            const raw = await base44.entities.Person.filter(
                { $and: [{ dataset_id: datasetId }] },
                'created_date',
                limit,
                skip
            );
            const batch = Array.isArray(raw) ? raw : [];
            console.log(`[rebuild] page=${pagesDone} skip=${skip} batch=${batch.length}`);
            if (!batch.length) break;

            for (const p of batch) {
                if (p.dataset_id !== datasetId) continue;
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
            if (batch.length < limit) break;
            skip += limit;
            pagesDone++;
        }

        console.log(`[rebuild] total_persons=${overallMap.total} symbols=${Object.keys(symbolMap).length} year_symbol_rows=${Object.keys(yearSymbolMap).length}`);

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
        console.error('[rebuildPredictionStats] error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});