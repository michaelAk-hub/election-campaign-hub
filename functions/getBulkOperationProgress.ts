import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { operation_id } = await req.json();
        if (!operation_id) {
            return Response.json({ error: 'Missing operation_id' }, { status: 400 });
        }

        const results = await base44.asServiceRole.entities.BulkOperation.filter({ id: operation_id });
        if (!results || results.length === 0) {
            return Response.json({ error: 'Operation not found' }, { status: 404 });
        }

        const op = results[0];
        return Response.json({
            status: op.status,
            total: op.total,
            processed: op.processed,
            error_message: op.error_message
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});