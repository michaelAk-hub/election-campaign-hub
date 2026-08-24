// notificationsDelete — delete one of the user's own notifications.
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

    const { notification_id } = body;
    const { data: owned } = await supabase.from("Notification").select("id")
      .eq("recipient_username", auth.user.email).eq("id", notification_id).maybeSingle();
    if (!owned) return json({ error: "Δεν επιτρέπεται" }, 403);

    await supabase.from("Notification").delete().eq("id", notification_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
