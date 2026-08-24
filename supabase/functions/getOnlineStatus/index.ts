// getOnlineStatus — which AppUsers are currently online (recent session activity).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

const ONLINE_WINDOW_SECONDS = 120;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const now = new Date();
    const threshold = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1000);
    const { data: sessions } = await supabase.from("AppSession").select("app_user_id, is_active, expires_at, last_seen_at")
      .order("last_seen_at", { ascending: false }).limit(1000);

    const onlineUserIds = new Set<string>();
    const lastSeenMap: Record<string, string> = {};
    for (const s of sessions ?? []) {
      if (!s.is_active) continue;
      if (new Date(s.expires_at) <= now) continue;
      if (!s.last_seen_at) continue;
      if (new Date(s.last_seen_at) < threshold) continue;
      onlineUserIds.add(s.app_user_id);
      if (!lastSeenMap[s.app_user_id] || new Date(s.last_seen_at) > new Date(lastSeenMap[s.app_user_id])) {
        lastSeenMap[s.app_user_id] = s.last_seen_at;
      }
    }

    return json({ online_user_ids: [...onlineUserIds], last_seen: lastSeenMap });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
