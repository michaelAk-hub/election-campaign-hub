// notificationsAdminDisable — disable a sent notification/push batch (or a legacy single record).
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

    const { source_type, id, send_batch_id } = body;
    const now = new Date();
    const disablePayload = { is_active: false, disabled_at: now.toISOString(), disabled_by: auth.user.email };

    // ── Case 1: disable by send_batch_id (both Notification + PushMessage) ──
    if (send_batch_id) {
      const [{ data: notifBatch }, { data: pushBatch }] = await Promise.all([
        supabase.from("Notification").select("*").eq("send_batch_id", send_batch_id),
        supabase.from("PushMessage").select("*").eq("send_batch_id", send_batch_id),
      ]);
      const nB = notifBatch ?? [], pB = pushBatch ?? [];
      if (!nB.length && !pB.length) return json({ error: "Δεν βρέθηκαν εγγραφές για αυτό το batch" }, 404);

      const rep = nB[0] || pB[0];
      if (rep.expires_at != null && new Date(rep.expires_at) <= now) return json({ error: "Οι εγγραφές έχουν ήδη λήξει και δεν μπορούν να τροποποιηθούν" }, 409);

      const alreadyDisabled = (nB[0]?.disabled_at != null || nB[0]?.is_active === false) || (pB[0]?.disabled_at != null || pB[0]?.is_active === false);
      if (alreadyDisabled && !nB.some((n) => n.is_active !== false) && !pB.some((p) => p.is_active !== false)) {
        return json({ ok: true, noop: true, message: "Ήδη απενεργοποιημένο" });
      }

      if (nB.length) await supabase.from("Notification").update(disablePayload).eq("send_batch_id", send_batch_id);
      if (pB.length) await supabase.from("PushMessage").update(disablePayload).eq("send_batch_id", send_batch_id);
      return json({ ok: true, disabled_notifications: nB.length, disabled_push: pB.length });
    }

    // ── Case 2: legacy single record by source_type + id ──
    if (!source_type || !["notification", "push", "mixed"].includes(source_type)) return json({ error: "Απαιτείται send_batch_id ή (source_type + id)" }, 400);
    if (!id) return json({ error: "Απαιτείται id" }, 400);

    const table = source_type === "push" ? "PushMessage" : "Notification";
    const notFoundMsg = source_type === "push" ? "Δεν βρέθηκε το μήνυμα" : "Δεν βρέθηκε η ειδοποίηση";
    const expiredMsg = source_type === "push" ? "Το μήνυμα έχει ήδη λήξει" : "Η ειδοποίηση έχει ήδη λήξει";

    const { data: record } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
    if (!record) return json({ error: notFoundMsg }, 404);
    if (record.disabled_at != null || record.is_active === false) return json({ ok: true, noop: true, message: "Ήδη απενεργοποιημένο" });
    if (record.expires_at != null && new Date(record.expires_at) <= now) return json({ error: expiredMsg }, 409);

    await supabase.from(table).update(disablePayload).eq("id", id);
    return json({ ok: true, disabled: 1 });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
