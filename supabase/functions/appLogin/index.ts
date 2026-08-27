// appLogin — verify admin/organotiki email+password, then require MFA (create challenge).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { sha256Hex } from "../_shared/appSession.ts";
import { throttleRetryAfter, recordLoginFailure, clearLoginThrottle, lockedMessage } from "../_shared/throttle.ts";
import { generateTotpSecret, otpauthUri } from "../_shared/totp.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { email, password } = await req.json();
    if (!email || !password) return json({ error: "Email και κωδικός απαιτούνται" }, 400);

    const throttleKey = `admin:${email.toLowerCase()}`;
    const retryAfter = await throttleRetryAfter(supabase, throttleKey);
    if (retryAfter != null) return json({ error: lockedMessage(retryAfter) }, 429);

    const users = await fetchAll(supabase, "AppUser");
    const user = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) {
      await recordLoginFailure(supabase, throttleKey);
      return json({ error: "Λάθος email ή κωδικός" }, 401);
    }
    if (user.role !== "ADMIN" && user.role !== "ORGANOTIKI") {
      return json({ error: "Μη εξουσιοδοτημένη πρόσβαση" }, 403);
    }
    if (user.role === "ORGANOTIKI" && !user.is_active) {
      return json({ error: "Ο λογαριασμός σας δεν είναι ενεργός" }, 403);
    }
    const hash = await sha256Hex(password);
    if (hash !== user.password_hash) {
      await recordLoginFailure(supabase, throttleKey);
      return json({ error: "Λάθος email ή κωδικός" }, 401);
    }
    await clearLoginThrottle(supabase, throttleKey);

    const preauthToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from("MfaChallenge").insert({
      user_id: user.id, preauth_token: preauthToken, expires_at: expiresAt,
      is_used: false, send_count: 0, attempts: 0,
    });

    // Authenticator-app (TOTP) users: no SMS. First time, hand back a QR to enroll.
    if (user.mfa_method === "totp") {
      let secret = user.totp_secret;
      if (!secret) {
        secret = generateTotpSecret();
        await supabase.from("AppUser").update({ totp_secret: secret, totp_enrolled: false }).eq("id", user.id);
      }
      const enroll = !user.totp_enrolled;
      const resp: any = { success: true, mfaRequired: true, preauthToken, mfaMethod: "totp", enroll };
      if (enroll) {
        // The frontend fetches the QR image separately (mfaEnrollQr); we hand
        // back the secret + otpauth URI so manual entry always works too.
        resp.otpauthUri = otpauthUri(secret, user.email || user.id);
        resp.secret = secret;
      }
      return json(resp);
    }

    // Default: SMS (unchanged).
    return json({ success: true, mfaRequired: true, preauthToken, mfaMethod: "sms" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
