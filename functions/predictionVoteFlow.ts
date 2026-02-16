import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const body = await req.json();
        const { bucket_minutes = 5, from, to, mapping } = body;

        // Validate mapping
        if (!mapping || !Array.isArray(mapping) || mapping.length === 0) {
            return Response.json({ error: 'Mapping is required and must contain at least one parataksi' }, { status: 400 });
        }

        // Validate bucket_minutes
        if (bucket_minutes < 1 || bucket_minutes > 60) {
            return Response.json({ error: 'bucket_minutes must be between 1 and 60' }, { status: 400 });
        }

        // Get active dataset
        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (datasets.length === 0) {
            return Response.json({ error: 'No active dataset found' }, { status: 404 });
        }
        const activeDatasetId = datasets[0].id;

        // Fetch all voted persons with voted_at
        let query = {
            dataset_id: activeDatasetId,
            voted: true
        };

        const persons = await base44.asServiceRole.entities.Person.filter(query);
        
        // Filter only persons with valid voted_at
        const validPersons = persons.filter(p => p.voted_at && p.prediction_symbol);

        // Apply time range filter if provided
        let filteredPersons = validPersons;
        if (from || to) {
            filteredPersons = validPersons.filter(p => {
                const votedAt = new Date(p.voted_at);
                if (from && votedAt < new Date(from)) return false;
                if (to && votedAt > new Date(to)) return false;
                return true;
            });
        }

        if (filteredPersons.length === 0) {
            return Response.json({
                bucket_minutes,
                labels: [],
                series: [],
                meta: { dataset_id: activeDatasetId }
            });
        }

        // Create symbol to parataksi mapping
        const symbolToParataksi = new Map();
        mapping.forEach(({ parataxi, symbols }) => {
            symbols.forEach(symbol => {
                if (!symbolToParataksi.has(symbol)) {
                    symbolToParataksi.set(symbol, []);
                }
                symbolToParataksi.get(symbol).push(parataxi);
            });
        });

        // Find time range
        const voteTimes = filteredPersons.map(p => new Date(p.voted_at).getTime());
        const minTime = Math.min(...voteTimes);
        const maxTime = Math.max(...voteTimes);

        // Create buckets
        const bucketSizeMs = bucket_minutes * 60 * 1000;
        const startBucket = Math.floor(minTime / bucketSizeMs) * bucketSizeMs;
        const endBucket = Math.ceil(maxTime / bucketSizeMs) * bucketSizeMs;

        // Generate all bucket timestamps
        const buckets = [];
        for (let t = startBucket; t <= endBucket; t += bucketSizeMs) {
            buckets.push(t);
        }

        // Count votes per bucket per symbol
        const bucketCounts = new Map(); // bucket -> symbol -> count

        filteredPersons.forEach(person => {
            const voteTime = new Date(person.voted_at).getTime();
            const bucket = Math.floor(voteTime / bucketSizeMs) * bucketSizeMs;
            const symbol = person.prediction_symbol;

            if (!bucketCounts.has(bucket)) {
                bucketCounts.set(bucket, new Map());
            }
            const symbolMap = bucketCounts.get(bucket);
            symbolMap.set(symbol, (symbolMap.get(symbol) || 0) + 1);
        });

        // Build series for each parataksi
        const seriesData = new Map(); // parataxi -> cumulative array

        mapping.forEach(({ parataxi, symbols }) => {
            let cumulative = 0;
            const points = [];

            buckets.forEach(bucket => {
                // Add counts for all symbols in this parataksi
                let bucketCount = 0;
                if (bucketCounts.has(bucket)) {
                    const symbolMap = bucketCounts.get(bucket);
                    symbols.forEach(symbol => {
                        bucketCount += symbolMap.get(symbol) || 0;
                    });
                }
                cumulative += bucketCount;
                points.push(cumulative);
            });

            seriesData.set(parataxi, points);
        });

        // Convert buckets to ISO strings for labels
        const labels = buckets.map(t => new Date(t).toISOString());

        // Build series array
        const series = mapping.map(({ parataxi }) => ({
            parataxi,
            points: seriesData.get(parataxi)
        }));

        return Response.json({
            bucket_minutes,
            labels,
            series,
            meta: { dataset_id: activeDatasetId }
        });

    } catch (error) {
        console.error('Error in predictionVoteFlow:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});