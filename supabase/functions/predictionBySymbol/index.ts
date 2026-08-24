// predictionBySymbol — voted/not-voted per prediction symbol (live).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, getActivePersons, normalizeSymbol } from "../_shared/prediction.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const generated_at = new Date().toISOString();
    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ rows: [], meta: { symbol_count: 0, generated_at } });

    const persons = await getActivePersons(supabase, datasetId);
    const map: Record<string, any> = {};
    for (const p of persons) {
      const sym = normalizeSymbol(p.prediction_symbol);
      if (!map[sym]) map[sym] = { symbol: sym, total: 0, voted_yes: 0, voted_no: 0 };
      map[sym].total++;
      if (p.voted === true) map[sym].voted_yes++; else map[sym].voted_no++;
    }

    const rows = Object.values(map).sort((a: any, b: any) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.symbol.localeCompare(b.symbol, "el");
    });

    return json({ rows, meta: { symbol_count: rows.length, generated_at } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
