import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { accountIds, symbolsToAssign } = await req.json();

        if (!accountIds || !Array.isArray(accountIds)) {
            return Response.json({ error: 'accountIds must be an array' }, { status: 400 });
        }

        let updated = 0;
        for (const id of accountIds) {
            await base44.asServiceRole.entities.ChreosiAccount.update(id, {
                allowed_prediction_symbols: symbolsToAssign || []
            });
            updated++;
            await new Promise(r => setTimeout(r, 150));
        }

        return Response.json({ success: true, updated });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});