// sessionHeartbeat — refresh last_seen_at so the idle-timeout clock resets on activity.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { session_token } = await req.json();
    if (!session_token) return json({ error: "Missing session_token" }, 400);

    const { data: sessions } = await supabase.from("AppSession").select("*")
      .eq("session_token", session_token).eq("is_active", true);
    if (!sessions?.length) return json({ error: "Session not found or inactive" }, 404);
    const session = sessions[0];

    if (new Date(session.expires_at) <= new Date()) return json({ error: "Session expired" }, 401);

    const now = new Date().toISOString();
    await supabase.from("AppSession").update({ last_seen_at: now }).eq("id", session.id);
    return json({ success: true, last_seen_at: now });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
