// mfaAdminSetMethod — ADMIN sets a user's MFA method (sms | totp), or resets
// their authenticator. Switching to 'totp' (or resetting) generates a fresh
// secret and clears enrollment, so the user re-enrolls (scans a new QR) on
// their next login. Switching to 'sms' clears the secret.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { generateTotpSecret } from "../_shared/totp.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές" }, 403);

    const targetId = String(body.target_user_id ?? "").trim();
    const method = String(body.method ?? "").trim();
    if (!targetId) return json({ error: "target_user_id απαιτείται" }, 400);
    if (method !== "sms" && method !== "totp") return json({ error: "Μη έγκυρη μέθοδος" }, 400);

    const { data: target } = await supabase.from("AppUser").select("*").eq("id", targetId).maybeSingle();
    if (!target) return json({ error: "Ο χρήστης δεν βρέθηκε" }, 404);
    if (target.role !== "ADMIN" && target.role !== "ORGANOTIKI") {
      return json({ error: "Μη έγκυρος ρόλος χρήστη" }, 400);
    }

    const patch = method === "totp"
      ? { mfa_method: "totp", totp_secret: generateTotpSecret(), totp_enrolled: false }
      : { mfa_method: "sms", totp_secret: null, totp_enrolled: false };

    const { error } = await supabase.from("AppUser").update(patch).eq("id", targetId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, mfa_method: method });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
