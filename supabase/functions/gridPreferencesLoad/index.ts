// gridPreferencesLoad — per-user saved grid state (column order, filters, sort).
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

    const gridKey = String(body.grid_key ?? "");
    const { data } = await supabase.from("GridPreference").select("*")
      .eq("user_email", auth.user.email).eq("grid_key", gridKey);
    return json({ state_json: data?.[0]?.state_json ?? {} });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
