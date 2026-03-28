import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let all = [];
    let skip = 0;
    while (true) {
        const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, skip);
        all = all.concat(batch);
        if (batch.length < 500) break;
        skip += 500;
    }

    const toUpdate = all.filter(a => (a.allowed_prediction_symbols || []).includes('Δ'));
    let updated = 0;

    for (const acc of toUpdate) {
        const newSymbols = (acc.allowed_prediction_symbols || []).filter(s => s !== 'Δ');
        await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, {
            allowed_prediction_symbols: newSymbols
        });
        updated++;
    }

    return Response.json({ ok: true, scanned: all.length, updated });
});