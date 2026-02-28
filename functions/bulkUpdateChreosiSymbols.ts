import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const accountIds = body.accountIds || [];
        const symbolsToAssign = body.symbolsToAssign || [];

        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return Response.json({ success: true, updated: 0 });
        }

        let updated = 0;
        for (const id of accountIds) {
            let retries = 3;
            while (retries > 0) {
                try {
                    await base44.asServiceRole.entities.ChreosiAccount.update(id, {
                        allowed_prediction_symbols: symbolsToAssign
                    });
                    updated++;
                    break;
                } catch (e) {
                    retries--;
                    if (retries === 0) throw e;
                    // Wait longer on rate limit error
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            await new Promise(r => setTimeout(r, 600));
        }

        return Response.json({ success: true, updated });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});