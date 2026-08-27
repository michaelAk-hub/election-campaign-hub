// mfaVerifyOtp — check the OTP via Twilio Verify; on success create the real AppSession.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { normalizePhone } from "../_shared/appSession.ts";
import { verifyTotp } from "../_shared/totp.ts";

function twilioAuth() {
  return `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`)}`;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { preauthToken, code } = await req.json();
    if (!preauthToken || !code) return json({ error: "preauthToken και code απαιτούνται" }, 400);
    if (!/^\d{4,10}$/.test(String(code))) return json({ error: "Μη έγκυρη μορφή κωδικού" }, 400);

    const { data: challenges } = await supabase.from("MfaChallenge").select("*")
      .eq("preauth_token", preauthToken).eq("is_used", false);
    if (!challenges?.length) return json({ error: "Challenge δεν βρέθηκε" }, 404);
    const challenge = challenges[0];
    if (new Date(challenge.expires_at) < new Date()) return json({ error: "Το challenge έχει λήξει" }, 410);

    const attempts = Number(challenge.attempts ?? 0);
    if (attempts >= 5) return json({ error: "Πολλές αποτυχημένες προσπάθειες" }, 429);

    const { data: users } = await supabase.from("AppUser").select("*").eq("id", challenge.user_id);
    const user = users?.[0];
    if (!user) return json({ error: "Ο χρήστης δεν βρέθηκε" }, 404);

    if (user.mfa_method === "totp") {
      // Authenticator app: verify the code locally (no Twilio).
      const ok = user.totp_secret && await verifyTotp(user.totp_secret, String(code));
      if (!ok) {
        await supabase.from("MfaChallenge").update({ attempts: attempts + 1 }).eq("id", challenge.id);
        return json({ error: "Λάθος κωδικός" }, 401);
      }
      await supabase.from("MfaChallenge").update({ is_used: true }).eq("id", challenge.id);
      if (!user.totp_enrolled) await supabase.from("AppUser").update({ totp_enrolled: true }).eq("id", user.id);
    } else {
      // SMS via Twilio Verify.
      if (!user.phone) return json({ error: "Δεν υπάρχει αριθμός τηλεφώνου" }, 400);
      const phone = normalizePhone(user.phone);
      const body = new URLSearchParams({ To: phone, Code: String(code) });
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${Deno.env.get("TWILIO_VERIFY_SERVICE_SID")}/VerificationCheck`,
        { method: "POST", headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body },
      );
      const result = await res.json();
      if (!res.ok) return json({ error: `Twilio error: ${res.status} ${JSON.stringify(result)}` }, 500);
      if (String(result.status).toLowerCase() !== "approved") {
        await supabase.from("MfaChallenge").update({ attempts: attempts + 1 }).eq("id", challenge.id);
        return json({ error: "Λάθος κωδικός OTP" }, 401);
      }
      await supabase.from("MfaChallenge").update({ is_used: true }).eq("id", challenge.id);
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await supabase.from("AppSession").insert({
      session_token: sessionToken, app_user_id: user.id,
      session_version_at_login: user.session_version || 1,
      expires_at: expiresAt.toISOString(), is_active: true,
    });

    return json({
      success: true, session_token: sessionToken,
      user: { id: user.id, role: user.role, email: user.email, name: user.name, surname: user.surname },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
