// predictionFilterOptions — distinct years / symbols / departments (live).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, getActivePersons } from "../_shared/prediction.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ years: [], symbols: [], departments: [] });

    const persons = await getActivePersons(supabase, datasetId);
    const yearsSet = new Set<string>();
    const symbolsSet = new Set<string>();
    const depsSet = new Set<string>();
    for (const p of persons) {
      if (p.admission_year) yearsSet.add(String(p.admission_year));
      const sym = String(p.prediction_symbol ?? "").trim().replace(/\s+/g, " ");
      if (sym) symbolsSet.add(sym);
      if (p.department) depsSet.add(p.department);
    }

    const years = [...yearsSet].sort((a, b) => String(b).localeCompare(String(a)));
    const symbols = [...symbolsSet].sort(); // default sort (matches original)
    const departments = [...depsSet].sort((a, b) => a.localeCompare(b, "el"));

    return json({ years, symbols, departments });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
