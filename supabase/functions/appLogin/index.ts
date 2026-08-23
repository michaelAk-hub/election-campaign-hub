// appLogin — verify admin/organotiki email+password, then require MFA (create challenge).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { sha256Hex } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { email, password } = await req.json();
    if (!email || !password) return json({ error: "Email και κωδικός απαιτούνται" }, 400);

    const users = await fetchAll(supabase, "AppUser");
    const user = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) return json({ error: "Λάθος email ή κωδικός" }, 401);
    if (user.role !== "ADMIN" && user.role !== "ORGANOTIKI") {
      return json({ error: "Μη εξουσιοδοτημένη πρόσβαση" }, 403);
    }
    if (user.role === "ORGANOTIKI" && !user.is_active) {
      return json({ error: "Ο λογαριασμός σας δεν είναι ενεργός" }, 403);
    }
    const hash = await sha256Hex(password);
    if (hash !== user.password_hash) return json({ error: "Λάθος email ή κωδικός" }, 401);

    const preauthToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from("MfaChallenge").insert({
      user_id: user.id, preauth_token: preauthToken, expires_at: expiresAt,
      is_used: false, send_count: 0, attempts: 0,
    });
    return json({ success: true, mfaRequired: true, preauthToken });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
