// loginThrottleAdmin — list currently locked-out login keys, and unlock one.
// list: any ADMIN/ORGANOTIKI. unlock: ADMIN only.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { normalizeUsername } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const action = body.action || "list";

    if (action === "unlock") {
      if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές μπορούν να ξεκλειδώσουν λογαριασμούς" }, 403);
      const key = String(body.throttle_key || "");
      if (!key) return json({ error: "throttle_key required" }, 400);
      await supabase.from("LoginThrottle").delete().eq("throttle_key", key);
      return json({ ok: true });
    }

    // list — only rows currently locked.
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabase.from("LoginThrottle").select("*").gt("locked_until", nowIso);
    const locked = rows ?? [];

    const [appUsers, chreosi, kanali] = await Promise.all([
      fetchAll(supabase, "AppUser"), fetchAll(supabase, "ChreosiAccount"), fetchAll(supabase, "KanaliAccount"),
    ]);

    const blocked = locked.map((r: any) => {
      const key = r.throttle_key || "";
      let account_type = "unknown", username = key;
      if (key.startsWith("admin:")) {
        username = key.slice(6);
        const u = appUsers.find((x: any) => (x.email || "").toLowerCase() === username);
        account_type = u ? (u.role === "ADMIN" ? "admin" : "organotiki") : "admin";
      } else if (key.startsWith("portal:")) {
        username = key.slice(7);
        if (chreosi.find((x: any) => normalizeUsername(x.username) === username)) account_type = "chreosi";
        else if (kanali.find((x: any) => normalizeUsername(x.username) === username)) account_type = "kanali";
        else account_type = "portal";
      }
      const retry_after_sec = Math.max(0, Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 1000));
      return { throttle_key: key, username, account_type, locked_until: r.locked_until, retry_after_sec, fail_count: r.fail_count, lock_level: r.lock_level };
    }).sort((a, b) => new Date(a.locked_until).getTime() - new Date(b.locked_until).getTime());

    return json({ blocked });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
