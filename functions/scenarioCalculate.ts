import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

        // Pre-build group matchers to avoid re-parsing per person
        const groupMatchers = yearGroups.map(group => {
            const condsByField = {};
            for (const cond of (group.conditions || [])) {
                if (!condsByField[cond.field]) condsByField[cond.field] = [];
                condsByField[cond.field].push(cond);
            }
            return { group, condsByField };
        });

        // Streaming accumulators — no giant array stored
        const globalSymbolCounts = {};
        let actualVotedCount = 0;

        // Per-group accumulators: symbolCounts and totalPersons
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

                const sym = p.prediction_symbol?.trim();
                const key = sym && sym !== '' ? sym : '-';
                globalSymbolCounts[key] = (globalSymbolCounts[key] || 0) + 1;

                // Check each group
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

        // Calculate per party (global)
        let totalPredictedVotes = 0;
        const partyResults = parties.map(party => {
            let predictedVotes = 0;
            const symbolDetails = (party.symbols || []).map(sm => {
                const votedCount = globalSymbolCounts[sm.symbol] || 0;
                const multiplier = parseFloat(sm.multiplier) || 1;
                const weighted = votedCount * multiplier;
                predictedVotes += weighted;
                return { symbol: sm.symbol, multiplier, voted_count: votedCount, weighted };
            });
            return { name: party.name, color: party.color, predictedVotes, symbolDetails };
        });

        totalPredictedVotes = partyResults.reduce((s, p) => s + p.predictedVotes, 0);
        const totalSeats = parseFloat(scenario.total_seats) || 1;
        const quota = totalPredictedVotes > 0 ? totalPredictedVotes / totalSeats : 1;

        const partyResultsFinal = partyResults.map(p => ({
            ...p,
            percentage: totalPredictedVotes > 0 ? (p.predictedVotes / totalPredictedVotes * 100) : 0,
            seats: quota > 0 ? p.predictedVotes / quota : 0,
        }));

        // Academic group breakdown using accumulated counters
        const groupBreakdown = yearGroups.map((group, gi) => {
            const symCounts = groupSymbolCounts[gi];

            const groupPartyResults = parties.map(party => {
                let predictedVotes = 0;
                (party.symbols || []).forEach(sm => {
                    predictedVotes += (symCounts[sm.symbol] || 0) * (parseFloat(sm.multiplier) || 1);
                });
                return { name: party.name, predictedVotes };
            });

            const groupTotal = groupPartyResults.reduce((s, p) => s + p.predictedVotes, 0);
            const groupSeatsRatio = totalPredictedVotes > 0 ? groupTotal / totalPredictedVotes : 0;

            // Build condition expression for display
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
                    predictedVotes: p.predictedVotes,
                    percentage: groupTotal > 0 ? p.predictedVotes / groupTotal * 100 : 0,
                })),
                global_share_percent: groupSeatsRatio * 100,
            };
        });

        return Response.json({
            scenario_id,
            scenario_name: scenario.name,
            total_seats: totalSeats,
            actual_voted_count: actualVotedCount,
            total_predicted_votes: totalPredictedVotes,
            quota,
            parties: partyResultsFinal,
            group_breakdown: groupBreakdown,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});