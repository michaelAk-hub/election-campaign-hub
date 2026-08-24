// predictionKPIs — overall voted/not-voted counts for the active dataset (live).
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

    const generated_at = new Date().toISOString();
    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ total: 0, voted_yes: 0, voted_no: 0, voted_yes_percent: 0, generated_at });

    const persons = await getActivePersons(supabase, datasetId);
    const total = persons.length;
    const voted_yes = persons.filter((p) => p.voted === true).length;
    const voted_no = total - voted_yes;
    const voted_yes_percent = total > 0 ? parseFloat(((voted_yes / total) * 100).toFixed(2)) : 0;

    return json({ total, voted_yes, voted_no, voted_yes_percent, generated_at });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
