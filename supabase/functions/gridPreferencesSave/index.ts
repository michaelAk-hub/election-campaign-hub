// gridPreferencesSave — upsert a user's grid state.
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
    const stateJson = body.state_json ?? {};
    const email = auth.user.email;

    const { data: existing } = await supabase.from("GridPreference").select("id")
      .eq("user_email", email).eq("grid_key", gridKey);
    if (existing?.length) {
      await supabase.from("GridPreference").update({ state_json: stateJson }).eq("id", existing[0].id);
    } else {
      await supabase.from("GridPreference").insert({ user_email: email, grid_key: gridKey, state_json: stateJson });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
