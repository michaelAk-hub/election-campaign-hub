// chreosiAccountActions — update/reset/delete/bulk operations on chreosi accounts.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { normalizeUsername } from "../_shared/portal.ts";
import bcrypt from "npm:bcryptjs@2.4.3";

function randomPassword(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { action, accountId, accountIds, data } = body;
    const AC = () => supabase.from("ChreosiAccount");

    if (action === "update") {
      if (!accountId) return json({ error: "accountId required" }, 400);
      await AC().update({
        display_name: data.display_name,
        phone: data.phone,
        is_active: data.is_active,
        allowed_prediction_symbols: data.allowed_prediction_symbols || [],
        allowed_voted_statuses: data.allowed_voted_statuses || [],
        visible_fields: Array.isArray(data.visible_fields) ? data.visible_fields : [],
        personal_note: data.personal_note,
      }).eq("id", accountId);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      if (!accountId) return json({ error: "accountId required" }, 400);
      const newPw = randomPassword();
      const hash = await bcrypt.hash(newPw, 10);
      await AC().update({ password_hash: hash, plain_password: newPw }).eq("id", accountId);
      return json({ ok: true, newPassword: newPw });
    }

    if (action === "delete") {
      if (!accountId) return json({ error: "accountId required" }, 400);
      await AC().delete().eq("id", accountId);
      return json({ ok: true });
    }

    if (action === "bulk_delete") {
      if (!accountIds?.length) return json({ error: "accountIds required" }, 400);
      await AC().delete().in("id", accountIds);
      return json({ ok: true, deleted: accountIds.length });
    }

    if (action === "bulk_set_active") {
      if (!accountIds?.length) return json({ error: "accountIds required" }, 400);
      const active = data?.is_active ?? true;
      await AC().update({ is_active: active }).in("id", accountIds);
      return json({ ok: true, updated: accountIds.length });
    }

    if (action === "bulk_settings") {
      if (!accountIds?.length) return json({ error: "accountIds required" }, 400);
      const { allowed_prediction_symbols = [], allowed_voted_statuses = [] } = data || {};
      const { error } = await AC().update({ allowed_prediction_symbols, allowed_voted_statuses }).in("id", accountIds);
      if (error) return json({ ok: true, updated: 0, failed: [{ error: error.message }] });
      return json({ ok: true, updated: accountIds.length, failed: [] });
    }

    if (action === "get_all_filtered_ids") {
      const { search = "" } = data || {};
      const allAccounts = await fetchAll(supabase, "ChreosiAccount");
      let filtered = allAccounts;
      if (search) {
        const q = normalizeUsername(search);
        const plain = String(search).toLowerCase();
        filtered = allAccounts.filter((a: any) => {
          const u = normalizeUsername(a.username);
          const d = normalizeUsername(a.display_name || "");
          const ph = (a.phone || "").toLowerCase();
          return u.includes(q) || d.includes(q) || ph.includes(plain);
        });
      }
      return json({ ok: true, ids: filtered.map((a: any) => a.id), total: filtered.length });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
