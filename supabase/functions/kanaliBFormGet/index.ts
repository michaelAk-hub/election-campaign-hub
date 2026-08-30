// kanaliBFormGet — return the shared Kanali Τύπος B form definition (ordered).
// Usable by the admin builder (AppSession) and by the Type B portal operator
// (PortalSession, portal_type=kanali).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    // Portal operator path (has username + sessionToken); else admin path.
    if (body.username && body.sessionToken) {
      const auth = await validatePortalSession(supabase, body.sessionToken, { username: body.username, portalType: "kanali" });
      if (auth.error) return json({ error: auth.error }, auth.status);
    } else {
      const auth = await strictAuth(supabase, body.session_token);
      if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    }

    const all = await fetchAll(supabase, "KanaliBFormField");
    const fields = (all || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    return json({ ok: true, fields });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
