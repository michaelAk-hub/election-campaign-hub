import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BLANK_SYMBOL = '(Κενό)';

function normalizeSymbol(raw) {
    const s = (raw ?? '').trim();
    return s !== '' ? s : BLANK_SYMBOL;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const { session_token, bucket_minutes = 5, mapping, year, symbol, department } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized: No session token' }, { status: 401 });

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Invalid session' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!mapping || !Array.isArray(mapping) || mapping.length === 0) {
            return Response.json({ error: 'Mapping is required' }, { status: 400 });
        }

        if (bucket_minutes < 1 || bucket_minutes > 60) {
            return Response.json({ error: 'bucket_minutes must be between 1 and 60' }, { status: 400 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!activeDatasets?.length) {
            return Response.json({ bucket_minutes, labels: [], series: [], meta: {} });
        }
        const activeDatasetId = activeDatasets[0].id;

        // Paginate all voted persons that have voted_at
        let allPersons = [];
        let skip = 0;
        const limit = 5000;
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: activeDatasetId, voted: true },
                '-created_date',
                limit,
                skip
            );
            allPersons = allPersons.concat(batch);
            skip += limit;
            if (batch.length < limit) break;
        }

        // Keep only records with voted_at (blank prediction_symbol is included via normalization)
        let filtered = allPersons.filter(p => p.voted_at);

        if (year) {
            const years = year.split(',').map(y => y.trim());
            filtered = filtered.filter(p => years.includes(String(p.admission_year || '')));
        }
        if (symbol) {
            const symbols = symbol.split(',').map(s => s.trim());
            filtered = filtered.filter(p => symbols.includes(normalizeSymbol(p.prediction_symbol)));
        }
        if (department) {
            const departments = department.split(',').map(d => d.trim());
            filtered = filtered.filter(p => departments.includes(p.department || ''));
        }

        if (filtered.length === 0) {
            return Response.json({ bucket_minutes, labels: [], series: [], meta: { dataset_id: activeDatasetId } });
        }

        // Build symbol → parataksi mapping (mapping uses normalized symbols including "(Κενό)")
        const symbolToParataksi = new Map();
        mapping.forEach(({ parataxi, symbols }) => {
            symbols.forEach(sym => {
                if (!symbolToParataksi.has(sym)) symbolToParataksi.set(sym, []);
                symbolToParataksi.get(sym).push(parataxi);
            });
        });

        // Time bucketing
        const voteTimes = filtered.map(p => new Date(p.voted_at).getTime());
        const minTime = Math.min(...voteTimes);
        const maxTime = Math.max(...voteTimes);
        const bucketSizeMs = bucket_minutes * 60 * 1000;
        const startBucket = Math.floor(minTime / bucketSizeMs) * bucketSizeMs;
        const endBucket = Math.ceil(maxTime / bucketSizeMs) * bucketSizeMs;

        const buckets = [];
        for (let t = startBucket; t <= endBucket; t += bucketSizeMs) {
            buckets.push(t);
        }

        // Count votes per bucket per normalized symbol
        const bucketCounts = new Map();
        filtered.forEach(person => {
            const bucket = Math.floor(new Date(person.voted_at).getTime() / bucketSizeMs) * bucketSizeMs;
            const sym = normalizeSymbol(person.prediction_symbol);
            if (!bucketCounts.has(bucket)) bucketCounts.set(bucket, new Map());
            const symbolMap = bucketCounts.get(bucket);
            symbolMap.set(sym, (symbolMap.get(sym) || 0) + 1);
        });

        // Build cumulative series per parataksi
        const series = mapping.map(({ parataxi, symbols }) => {
            let cumulative = 0;
            const points = buckets.map(bucket => {
                let count = 0;
                if (bucketCounts.has(bucket)) {
                    const symbolMap = bucketCounts.get(bucket);
                    symbols.forEach(sym => { count += symbolMap.get(sym) || 0; });
                }
                cumulative += count;
                return cumulative;
            });
            return { parataxi, points };
        });

        const labels = buckets.map(t => new Date(t).toISOString());

        return Response.json({ bucket_minutes, labels, series, meta: { dataset_id: activeDatasetId } });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});