import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all persons with prediction_symbol in Σ, Ο, Π that haven't voted yet
        const targetSymbols = ['Σ', 'Ο', 'Π'];
        let allPersons = [];

        for (const symbol of targetSymbols) {
            let skip = 0;
            const limit = 5000;
            let hasMore = true;
            while (hasMore) {
                const batch = await base44.asServiceRole.entities.Person.filter(
                    { prediction_symbol: symbol, voted: false },
                    '-created_date',
                    limit,
                    skip
                );
                allPersons = allPersons.concat(batch);
                skip += limit;
                hasMore = batch.length === limit;
            }
        }

        // Take half
        const half = Math.ceil(allPersons.length / 2);
        // Shuffle randomly
        for (let i = allPersons.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPersons[i], allPersons[j]] = [allPersons[j], allPersons[i]];
        }
        const toMark = allPersons.slice(0, half);

        // Today's date (Cyprus timezone = UTC+2, but we'll use today's date in UTC)
        const today = new Date();
        const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

        let updated = 0;
        for (const person of toMark) {
            // Random time between 09:00 and 18:00
            const hours = 9 + Math.floor(Math.random() * 9); // 9..17
            const minutes = Math.floor(Math.random() * 60);
            const seconds = Math.floor(Math.random() * 60);
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            const voted_at = `${todayStr}T${timeStr}.000Z`;

            await base44.asServiceRole.entities.Person.update(person.id, {
                voted: true,
                voted_at
            });
            updated++;
        }

        return Response.json({ success: true, updated, total: allPersons.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});