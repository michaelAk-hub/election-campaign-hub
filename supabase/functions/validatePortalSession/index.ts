// validatePortalSession — server-side check that a portal session is still valid.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { sessionToken, username, portalType } = await req.json();
    if (!sessionToken || !username || !portalType) return json({ valid: false });
    const r = await validatePortalSession(supabase, sessionToken, { username, portalType });
    if (r.error) return json({ valid: false });
    return json({
      valid: true,
      username: r.session.username,
      portalType: r.session.portal_type,
      kanaliType: r.session.kanali_type || null,
    });
  } catch (_e) {
    return json({ valid: false }, 500);
  }
});
