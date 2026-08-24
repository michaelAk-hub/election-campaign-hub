// predictionByYearSymbol — voted/not-voted per admission_year + symbol (live).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, getActivePersons, normalizeSymbol, normalizeYear, UNKNOWN_YEAR } from "../_shared/prediction.ts";

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
    if (!datasetId) return json({ rows: [], meta: { generated_at } });

    const persons = await getActivePersons(supabase, datasetId);
    const map: Record<string, any> = {};
    for (const p of persons) {
      const symbol = normalizeSymbol(p.prediction_symbol);
      const admission_year = normalizeYear(p.admission_year);
      const key = `${admission_year}::${symbol}`;
      if (!map[key]) map[key] = { admission_year, symbol, total: 0, voted_yes: 0, voted_no: 0 };
      map[key].total++;
      if (p.voted === true) map[key].voted_yes++; else map[key].voted_no++;
    }

    const rows = Object.values(map).sort((a: any, b: any) => {
      if (a.admission_year !== b.admission_year) {
        if (a.admission_year === UNKNOWN_YEAR) return 1;
        if (b.admission_year === UNKNOWN_YEAR) return -1;
        return b.admission_year.localeCompare(a.admission_year);
      }
      if (b.total !== a.total) return b.total - a.total;
      return a.symbol.localeCompare(b.symbol, "el");
    });

    return json({ rows, meta: { generated_at } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
