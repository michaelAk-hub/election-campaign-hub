import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { account_ids, symbols } = await req.json();
        if (!account_ids || !Array.isArray(account_ids)) {
            return Response.json({ error: 'Missing account_ids' }, { status: 400 });
        }

        // Create a BulkOperation record to track progress
        const operation = await base44.asServiceRole.entities.BulkOperation.create({
            operation_type: 'chreosi_symbol_update',
            status: 'running',
            total: account_ids.length,
            processed: 0
        });

        const operationId = operation.id;

        // Build the response immediately, then process in background using waitUntil
        const responsePromise = Response.json({ success: true, operation_id: operationId, total: account_ids.length });

        // Process in background - use EdgeRuntime.waitUntil if available, otherwise just fire
        const backgroundWork = (async () => {
            let processed = 0;
            try {
                // Process in batches of 20 concurrently for speed
                const batchSize = 20;
                for (let i = 0; i < account_ids.length; i += batchSize) {
                    const batch = account_ids.slice(i, i + batchSize);
                    await Promise.all(batch.map(id =>
                        base44.asServiceRole.entities.ChreosiAccount.update(id, {
                            allowed_prediction_symbols: symbols
                        })
                    ));
                    processed += batch.length;
                    await base44.asServiceRole.entities.BulkOperation.update(operationId, {
                        processed,
                        status: processed >= account_ids.length ? 'completed' : 'running'
                    });
                }
            } catch (err) {
                await base44.asServiceRole.entities.BulkOperation.update(operationId, {
                    status: 'failed',
                    error_message: err.message
                });
            }
        })();

        // Try to use EdgeRuntime.waitUntil to keep function alive after response
        try {
            EdgeRuntime.waitUntil(backgroundWork);
        } catch (_) {
            // If not available, just let it run (fire and forget)
        }

        return responsePromise;

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});