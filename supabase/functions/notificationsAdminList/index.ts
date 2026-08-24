// notificationsAdminList — sent notifications/push, grouped by send batch, for the admin log.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

function deriveStatus(r: any): string {
  const now = new Date();
  if (r.disabled_at != null || r.is_active === false) return "disabled";
  if (r.expires_at != null && new Date(r.expires_at) <= now) return "expired";
  return "active";
}
function mergeStatus(s1: string, s2: string): string {
  if (s1 === "disabled" || s2 === "disabled") return "disabled";
  if (s1 === "expired" || s2 === "expired") return "expired";
  return "active";
}
function buildNotifSummary(batch: any[]): string {
  const a = batch.filter((r) => r.recipient_type === "admin").length;
  const o = batch.filter((r) => r.recipient_type === "organotikos").length;
  const parts: string[] = [];
  if (a > 0) parts.push(`${a} διαχειριστ${a === 1 ? "ής" : "ές"}`);
  if (o > 0) parts.push(`${o} οργανωτικ${o === 1 ? "ός" : "οί"}`);
  return parts.join(", ");
}
function buildPushSummary(msg: any): string {
  if (msg.delivery_mode === "group" || !msg.delivery_mode) {
    if (msg.target_group === "both") return "όλα τα χρεωστικά και όλα τα κανάλι";
    if (msg.target_group === "chreosi") return "όλα τα χρεωστικά";
    if (msg.target_group === "kanali") return "όλα τα κανάλι";
    return "όλοι οι χρήστες portal";
  }
  const keys = Array.isArray(msg.target_user_keys) ? msg.target_user_keys : [];
  const c = keys.filter((k: string) => k.startsWith("chreosi:")).length;
  const k = keys.filter((x: string) => x.startsWith("kanali:")).length;
  const parts: string[] = [];
  if (c > 0) parts.push(`${c} χρεωστικ${c === 1 ? "ό" : "ά"}`);
  if (k > 0) parts.push(`${k} κανάλ${k === 1 ? "ι" : "ια"}`);
  return parts.length ? `specific portal recipients (${keys.length}): ${parts.join(", ")}` : `specific (${keys.length})`;
}
function buildMixedSummary(notifSummary: string, pushSummary: string): string {
  const parts = [notifSummary, pushSummary].filter(Boolean);
  if (parts.length === 0) return "Άγνωστο";
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const [{ data: allNotifications }, { data: allPushMessages }] = await Promise.all([
      supabase.from("Notification").select("*").order("created_date", { ascending: false }).limit(500),
      supabase.from("PushMessage").select("*").order("created_date", { ascending: false }).limit(200),
    ]);

    const rows: any[] = [];
    const batchMap = new Map<string, { notifBatch: any[]; pushMsg: any }>();
    for (const n of allNotifications ?? []) {
      if (!n.send_batch_id) continue;
      if (!batchMap.has(n.send_batch_id)) batchMap.set(n.send_batch_id, { notifBatch: [], pushMsg: null });
      batchMap.get(n.send_batch_id)!.notifBatch.push(n);
    }
    for (const msg of allPushMessages ?? []) {
      if (!msg.send_batch_id) continue;
      if (!batchMap.has(msg.send_batch_id)) batchMap.set(msg.send_batch_id, { notifBatch: [], pushMsg: null });
      batchMap.get(msg.send_batch_id)!.pushMsg = msg;
    }

    for (const [batchId, { notifBatch, pushMsg }] of batchMap) {
      const hasNotif = notifBatch.length > 0;
      const hasPush = pushMsg != null;
      const source_type = hasNotif && hasPush ? "mixed" : hasNotif ? "notification" : "push";
      const rep = hasNotif ? notifBatch[0] : pushMsg;
      const notifStatus = hasNotif ? deriveStatus(notifBatch[0]) : "active";
      const pushStatus = hasPush ? deriveStatus(pushMsg) : "active";
      const status = hasNotif && hasPush ? mergeStatus(notifStatus, pushStatus) : hasNotif ? notifStatus : pushStatus;
      const notifSummary = hasNotif ? buildNotifSummary(notifBatch) : "";
      const pushSummary = hasPush ? buildPushSummary(pushMsg) : "";
      const recipient_summary = source_type === "mixed" ? buildMixedSummary(notifSummary, pushSummary)
        : source_type === "notification" ? (notifSummary || "Άγνωστο")
        : (pushSummary ? pushSummary.charAt(0).toUpperCase() + pushSummary.slice(1) : "Άγνωστο");
      const recipient_count = (hasNotif ? notifBatch.length : 0) + (hasPush ? (pushMsg.total_recipients || 0) : 0);
      const disabled_at = rep.disabled_at || (hasPush && pushMsg.disabled_at) || (hasNotif && notifBatch[0].disabled_at) || null;
      const disabled_by = rep.disabled_by || (hasPush && pushMsg.disabled_by) || (hasNotif && notifBatch[0].disabled_by) || null;
      rows.push({
        id: batchId, record_id: hasPush ? pushMsg.id : rep.id, source_type, send_batch_id: batchId,
        title: rep.title, message: rep.message || rep.body || "", sender_email: rep.sender_email || null,
        created_date: rep.created_date, expires_at: rep.expires_at || null, disabled_at, disabled_by,
        is_active: rep.is_active !== false, status, recipient_summary, recipient_count,
      });
    }

    for (const n of allNotifications ?? []) {
      if (n.send_batch_id) continue;
      rows.push({
        id: n.id, record_id: n.id, source_type: "notification", send_batch_id: null, title: n.title, message: n.message,
        sender_email: n.sender_email || null, created_date: n.created_date, expires_at: n.expires_at || null,
        disabled_at: n.disabled_at || null, disabled_by: n.disabled_by || null, is_active: n.is_active !== false,
        status: deriveStatus(n), recipient_summary: n.recipient_type || "legacy", recipient_count: 1,
      });
    }
    for (const msg of allPushMessages ?? []) {
      if (msg.send_batch_id) continue;
      const pushSummary = buildPushSummary(msg);
      rows.push({
        id: msg.id, record_id: msg.id, source_type: "push", send_batch_id: null, title: msg.title, message: msg.body,
        sender_email: msg.sender_email || null, created_date: msg.created_date, expires_at: msg.expires_at || null,
        disabled_at: msg.disabled_at || null, disabled_by: msg.disabled_by || null, is_active: msg.is_active !== false,
        status: deriveStatus(msg), recipient_summary: pushSummary.charAt(0).toUpperCase() + pushSummary.slice(1),
        recipient_count: msg.total_recipients || 0,
      });
    }

    rows.sort((a, b) => +new Date(b.created_date) - +new Date(a.created_date));
    return json({ rows });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
