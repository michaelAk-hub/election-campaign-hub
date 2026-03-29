import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BLANK_SYMBOL = '(Κενό)';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token, scenario_id } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (!['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const scenarios = await base44.asServiceRole.entities.PredictionScenario.filter({ id: scenario_id });
        if (!scenarios?.length) return Response.json({ error: 'Not found' }, { status: 404 });
        const scenario = scenarios[0];

        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!datasets?.length) return Response.json({ error: 'No active dataset' }, { status: 400 });
        const datasetId = datasets[0].id;

        const config = scenario.config_json || {};
        const parties = config.parties || [];
        const yearGroups = config.year_groups || [];

        const groupMatchers = yearGroups.map(group => {
            const condsByField = {};
            for (const cond of (group.conditions || [])) {
                if (!condsByField[cond.field]) condsByField[cond.field] = [];
                condsByField[cond.field].push(cond);
            }
            return { group, condsByField };
        });

        // symbol → actual voted_count
        const globalSymbolCounts = {};
        let actualVotedCount = 0;

        const groupSymbolCounts = yearGroups.map(() => ({}));
        const groupPersonCounts = yearGroups.map(() => 0);

        let skip = 0;
        const batchSize = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: datasetId, voted: true },
                '-created_date',
                batchSize,
                skip
            );
            if (!batch?.length) break;

            for (const p of batch) {
                actualVotedCount++;

                const rawSym = p.prediction_symbol?.trim();
                // Use BLANK_SYMBOL for empty/null, keep real "-" as "-"
                const key = (rawSym && rawSym !== '') ? rawSym : BLANK_SYMBOL;
                globalSymbolCounts[key] = (globalSymbolCounts[key] || 0) + 1;

                for (let gi = 0; gi < groupMatchers.length; gi++) {
                    const { condsByField } = groupMatchers[gi];
                    const matched = Object.entries(condsByField).every(([, conds]) =>
                        conds.some(cond => {
                            const fieldValue = p[cond.field]?.trim() ?? '';
                            if (cond.operator === '=') return fieldValue === cond.value;
                            if (cond.operator === 'IN') return (cond.values || []).includes(fieldValue);
                            return false;
                        })
                    );
                    if (matched) {
                        groupPersonCounts[gi]++;
                        groupSymbolCounts[gi][key] = (groupSymbolCounts[gi][key] || 0) + 1;
                    }
                }
            }

            if (batch.length < batchSize) break;
            skip += batchSize;
        }

        // Build party results — rawVotes drives %, seats; weightedVotes kept for display
        const partyResults = parties.map(party => {
            let rawVotes = 0;
            let weightedVotes = 0;
            const symbolDetails = (party.symbols || []).map(sm => {
                const voted_count = globalSymbolCounts[sm.symbol] || 0;
                const multiplier = parseFloat(sm.multiplier) || 1;
                const weighted = voted_count * multiplier;
                rawVotes += voted_count;
                weightedVotes += weighted;
                return { symbol: sm.symbol, multiplier, voted_count, weighted };
            });
            return { name: party.name, color: party.color, rawVotes, weightedVotes, symbolDetails };
        });

        const totalRawVotes = partyResults.reduce((s, p) => s + p.rawVotes, 0);
        const totalWeightedVotes = partyResults.reduce((s, p) => s + p.weightedVotes, 0);
        const totalSeats = parseFloat(scenario.total_seats) || 1;
        // quota, %, seats all based on actual_voted_count and weightedVotes
        const quota = actualVotedCount > 0 ? actualVotedCount / totalSeats : 1;

        const partyResultsFinal = partyResults.map(p => ({
            name: p.name,
            color: p.color,
            rawVotes: p.rawVotes,
            weightedVotes: p.weightedVotes,
            // backward compat: predictedVotes = weightedVotes
            predictedVotes: p.weightedVotes,
            percentage: actualVotedCount > 0 ? (p.weightedVotes / actualVotedCount * 100) : 0,
            seats: quota > 0 ? p.weightedVotes / quota : 0,
            symbolDetails: p.symbolDetails,
        }));

        // Group breakdown — rawVotes within group drives percentage
        const groupBreakdown = yearGroups.map((group, gi) => {
            const symCounts = groupSymbolCounts[gi];

            const groupPartyResults = parties.map(party => {
                let rawVotes = 0;
                let weightedVotes = 0;
                (party.symbols || []).forEach(sm => {
                    const vc = symCounts[sm.symbol] || 0;
                    rawVotes += vc;
                    weightedVotes += vc * (parseFloat(sm.multiplier) || 1);
                });
                return { name: party.name, rawVotes, weightedVotes, predictedVotes: weightedVotes };
            });

            const groupTotalRaw = groupPartyResults.reduce((s, p) => s + p.rawVotes, 0);
            const groupTotalWeighted = groupPartyResults.reduce((s, p) => s + p.weightedVotes, 0);
            const groupSeatsRatio = totalRawVotes > 0 ? groupTotalRaw / totalRawVotes : 0;

            const condsByField = {};
            for (const cond of (group.conditions || [])) {
                if (!condsByField[cond.field]) condsByField[cond.field] = [];
                if (cond.operator === 'IN') {
                    (cond.values || []).forEach(v => condsByField[cond.field].push(v));
                } else {
                    condsByField[cond.field].push(cond.value);
                }
            }
            const conditionExpression = Object.entries(condsByField).map(([field, values]) => {
                const inner = values.map(v => `${field} = ${v}`).join(' OR ');
                return values.length > 1 ? `(${inner})` : inner;
            }).join(' AND ');

            return {
                group_name: group.name,
                condition_expression: conditionExpression || null,
                total_persons: groupPersonCounts[gi],
                party_results: groupPartyResults.map(p => ({
                    name: p.name,
                    rawVotes: p.rawVotes,
                    weightedVotes: p.weightedVotes,
                    predictedVotes: p.weightedVotes,
                    percentage: actualVotedCount > 0 ? p.weightedVotes / actualVotedCount * 100 : 0,
                })),
                global_share_percent: groupSeatsRatio * 100,
            };
        });

        return Response.json({
            scenario_id,
            scenario_name: scenario.name,
            total_seats: totalSeats,
            actual_voted_count: actualVotedCount,
            total_raw_votes: totalRawVotes,
            total_weighted_votes: totalWeightedVotes,
            // backward compat
            total_predicted_votes: totalWeightedVotes,
            quota,
            parties: partyResultsFinal,
            group_breakdown: groupBreakdown,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});