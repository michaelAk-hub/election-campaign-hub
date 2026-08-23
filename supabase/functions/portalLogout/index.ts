// portalLogout — invalidate a portal session. Always succeeds (client clears storage regardless).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { sessionToken, username } = await req.json();
    if (sessionToken && username) {
      const { data } = await supabase.from("PortalSession").select("id")
        .eq("session_token", sessionToken).eq("username", username).eq("is_active", true);
      if (data?.length) {
        await supabase.from("PortalSession").update({ is_active: false }).eq("id", data[0].id);
      }
    }
    return json({ success: true });
  } catch (_e) {
    return json({ success: true });
  }
});
