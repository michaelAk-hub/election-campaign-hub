// notificationsFetch — active, non-expired notifications for the logged-in user.
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

    const { data: all } = await supabase.from("Notification").select("*").eq("recipient_username", auth.user.email);
    const now = new Date();
    const notifications = (all ?? []).filter((n: any) => {
      if (n.is_active === false) return false;
      if (n.disabled_at != null) return false;
      if (n.expires_at != null && new Date(n.expires_at) <= now) return false;
      return true;
    }).sort((a: any, b: any) => +new Date(b.created_date) - +new Date(a.created_date));

    return json({ notifications });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
