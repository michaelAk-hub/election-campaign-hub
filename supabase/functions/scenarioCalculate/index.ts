// scenarioCalculate — weighted vote/seat projection for a saved scenario (live).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, getActivePersons, BLANK_SYMBOL } from "../_shared/prediction.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { scenario_id } = body;

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { data: scenarios } = await supabase.from("PredictionScenario").select("*").eq("id", scenario_id);
    if (!scenarios?.length) return json({ error: "Not found" }, 404);
    const scenario = scenarios[0];

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ error: "No active dataset" }, 400);

    const config = scenario.config_json || {};
    const parties = config.parties || [];
    const yearGroups = config.year_groups || [];

    const groupMatchers = yearGroups.map((group: any) => {
      const condsByField: Record<string, any[]> = {};
      for (const cond of (group.conditions || [])) {
        (condsByField[cond.field] ||= []).push(cond);
      }
      return { group, condsByField };
    });

    const globalSymbolCounts: Record<string, number> = {};
    let actualVotedCount = 0;
    const groupSymbolCounts: Record<string, number>[] = yearGroups.map(() => ({}));
    const groupPersonCounts: number[] = yearGroups.map(() => 0);

    const persons = (await getActivePersons(supabase, datasetId)).filter((p) => p.voted === true);
    for (const p of persons) {
      actualVotedCount++;
      const rawSym = String(p.prediction_symbol ?? "").trim();
      const key = rawSym !== "" ? rawSym : BLANK_SYMBOL;
      globalSymbolCounts[key] = (globalSymbolCounts[key] || 0) + 1;

      for (let gi = 0; gi < groupMatchers.length; gi++) {
        const { condsByField } = groupMatchers[gi];
        const matched = Object.entries(condsByField).every(([, conds]) =>
          (conds as any[]).some((cond) => {
            const fieldValue = String(p[cond.field] ?? "").trim();
            if (cond.operator === "=") return fieldValue === cond.value;
            if (cond.operator === "IN") return (cond.values || []).includes(fieldValue);
            return false;
          })
        );
        if (matched) {
          groupPersonCounts[gi]++;
          groupSymbolCounts[gi][key] = (groupSymbolCounts[gi][key] || 0) + 1;
        }
      }
    }

    const partyResults = parties.map((party: any) => {
      let rawVotes = 0, weightedVotes = 0;
      const symbolDetails = (party.symbols || []).map((sm: any) => {
        const voted_count = globalSymbolCounts[sm.symbol] || 0;
        const multiplier = parseFloat(sm.multiplier) || 1;
        const weighted = voted_count * multiplier;
        rawVotes += voted_count;
        weightedVotes += weighted;
        return { symbol: sm.symbol, multiplier, voted_count, weighted };
      });
      return { name: party.name, color: party.color, rawVotes, weightedVotes, symbolDetails };
    });

    const totalRawVotes = partyResults.reduce((s: number, p: any) => s + p.rawVotes, 0);
    const totalWeightedVotes = partyResults.reduce((s: number, p: any) => s + p.weightedVotes, 0);
    const totalSeats = parseFloat(scenario.total_seats) || 1;
    const quota = actualVotedCount > 0 ? actualVotedCount / totalSeats : 1;

    const partyResultsFinal = partyResults.map((p: any) => ({
      name: p.name, color: p.color, rawVotes: p.rawVotes, weightedVotes: p.weightedVotes,
      predictedVotes: p.weightedVotes,
      percentage: actualVotedCount > 0 ? (p.weightedVotes / actualVotedCount * 100) : 0,
      seats: quota > 0 ? p.weightedVotes / quota : 0,
      symbolDetails: p.symbolDetails,
    }));

    const groupBreakdown = yearGroups.map((group: any, gi: number) => {
      const symCounts = groupSymbolCounts[gi];
      const groupPartyResults = parties.map((party: any) => {
        let rawVotes = 0, weightedVotes = 0;
        (party.symbols || []).forEach((sm: any) => {
          const vc = symCounts[sm.symbol] || 0;
          rawVotes += vc;
          weightedVotes += vc * (parseFloat(sm.multiplier) || 1);
        });
        return { name: party.name, rawVotes, weightedVotes };
      });

      const groupTotalWeighted = groupPartyResults.reduce((s: number, p: any) => s + p.weightedVotes, 0);
      const groupTotalRaw = groupPartyResults.reduce((s: number, p: any) => s + p.rawVotes, 0);
      const groupSeatsRatio = totalRawVotes > 0 ? groupTotalRaw / totalRawVotes : 0;

      const condsByField: Record<string, any[]> = {};
      for (const cond of (group.conditions || [])) {
        if (cond.operator === "IN") (cond.values || []).forEach((v: any) => (condsByField[cond.field] ||= []).push(v));
        else (condsByField[cond.field] ||= []).push(cond.value);
      }
      const conditionExpression = Object.entries(condsByField).map(([field, values]) => {
        const inner = (values as any[]).map((v) => `${field} = ${v}`).join(" OR ");
        return (values as any[]).length > 1 ? `(${inner})` : inner;
      }).join(" AND ");

      return {
        group_name: group.name,
        condition_expression: conditionExpression || null,
        total_persons: groupPersonCounts[gi],
        group_total_weighted: groupTotalWeighted,
        party_results: groupPartyResults.map((p: any) => ({
          name: p.name, rawVotes: p.rawVotes, weightedVotes: p.weightedVotes, predictedVotes: p.weightedVotes,
          percentage: groupTotalWeighted > 0 ? (p.weightedVotes / groupTotalWeighted * 100) : 0,
        })),
        global_share_percent: groupSeatsRatio * 100,
      };
    });

    return json({
      scenario_id, scenario_name: scenario.name, total_seats: totalSeats,
      actual_voted_count: actualVotedCount, total_raw_votes: totalRawVotes,
      total_weighted_votes: totalWeightedVotes, predictedVotes: totalWeightedVotes,
      total_predicted_votes: totalWeightedVotes, quota,
      parties: partyResultsFinal, group_breakdown: groupBreakdown,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
