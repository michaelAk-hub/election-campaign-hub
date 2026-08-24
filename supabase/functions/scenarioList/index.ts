// scenarioList — up to 4 saved scenarios, ordered by display_order.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { data: scenarios } = await supabase.from("PredictionScenario")
      .select("*").order("display_order", { ascending: true }).limit(4);
    return json({ scenarios: scenarios ?? [] });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
