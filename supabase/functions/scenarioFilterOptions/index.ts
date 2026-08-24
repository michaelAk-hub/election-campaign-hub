// scenarioFilterOptions — distinct symbols / academic_levels / admission_years (live).
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
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ symbols: [], academic_levels: [], admission_years: [] });

    const persons = await getActivePersons(supabase, datasetId);
    const symbolSet = new Set<string>();
    const levelSet = new Set<string>();
    const yearSet = new Set<string>();
    for (const p of persons) {
      const sym = String(p.prediction_symbol ?? "").trim();
      symbolSet.add(sym !== "" ? sym : BLANK_SYMBOL);
      if (String(p.academic_level ?? "").trim()) levelSet.add(String(p.academic_level).trim());
      if (String(p.admission_year ?? "").trim()) yearSet.add(String(p.admission_year).trim());
    }

    return json({
      symbols: [...symbolSet].sort(),
      academic_levels: [...levelSet].sort(),
      admission_years: [...yearSet].sort(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
