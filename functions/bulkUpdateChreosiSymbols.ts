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

        // Run the updates in the background (no await - fire and forget)
        (async () => {
            let processed = 0;
            try {
                for (const id of account_ids) {
                    // Fetch current account data
                    const accounts = await base44.asServiceRole.entities.ChreosiAccount.filter({ id });
                    const account = accounts[0];
                    if (account) {
                        await base44.asServiceRole.entities.ChreosiAccount.update(id, {
                            ...account,
                            allowed_prediction_symbols: symbols
                        });
                    }
                    processed++;
                    // Update progress every 5 records or at the end
                    if (processed % 5 === 0 || processed === account_ids.length) {
                        await base44.asServiceRole.entities.BulkOperation.update(operationId, {
                            processed,
                            status: processed === account_ids.length ? 'completed' : 'running'
                        });
                    }
                }
            } catch (err) {
                await base44.asServiceRole.entities.BulkOperation.update(operationId, {
                    status: 'failed',
                    error_message: err.message
                });
            }
        })();

        // Return immediately with the operationId
        return Response.json({ success: true, operation_id: operationId, total: account_ids.length });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});