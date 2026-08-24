// notificationsMarkRead — mark one or all of the user's notifications as read.
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

    const { notification_id, mark_all, notification_ids } = body;
    const now = new Date().toISOString();
    const email = auth.user.email;

    const { data: userNotifs } = await supabase.from("Notification").select("id").eq("recipient_username", email);
    const ownedIds = new Set((userNotifs ?? []).map((n: any) => n.id));

    if (mark_all && notification_ids?.length) {
      const ids = notification_ids.filter((id: string) => ownedIds.has(id));
      if (ids.length) await supabase.from("Notification").update({ read: true, read_at: now }).in("id", ids);
    } else if (notification_id) {
      if (!ownedIds.has(notification_id)) return json({ error: "Δεν επιτρέπεται" }, 403);
      await supabase.from("Notification").update({ read: true, read_at: now }).eq("id", notification_id);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
