// portalPushMessages — the first unacknowledged push message targeted at the
// logged-in portal user (chreosi/kanali). Portal-authed, so portal users (who
// have no admin session) can actually receive admin broadcasts.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { sessionToken, username } = await req.json().catch(() => ({}));
    if (!sessionToken || !username) return json({ error: "Missing fields" }, 400);

    const v = await validatePortalSession(supabase, sessionToken, { username });
    if (v.error) return json({ error: v.error }, v.status);
    const portalType = v.session.portal_type; // 'chreosi' | 'kanali'
    const uname = v.session.username;
    const myKey = `${portalType}:${uname}`;
    const targetGroups = portalType === "chreosi" ? ["chreosi", "both"] : ["kanali", "both"];

    const now = new Date();
    const all = await fetchAll(supabase, "PushMessage");
    const relevant = all
      .filter((m: any) => {
        if (m.is_active === false || m.disabled_at != null) return false;
        if (m.expires_at != null && new Date(m.expires_at) <= now) return false;
        const mode = m.delivery_mode || "group";
        if (mode === "group") return targetGroups.includes(m.target_group);
        const keys = Array.isArray(m.target_user_keys) ? m.target_user_keys : [];
        return keys.includes(myKey);
      })
      .sort((a: any, b: any) => +new Date(a.created_date) - +new Date(b.created_date));

    // Return the first one this user hasn't acknowledged yet.
    for (const msg of relevant) {
      const { data: acks } = await supabase.from("PushMessageAck").select("id")
        .eq("message_id", msg.id).eq("recipient_type", portalType).eq("username", uname);
      if (!acks?.length) return json({ message: msg });
    }
    return json({ message: null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
