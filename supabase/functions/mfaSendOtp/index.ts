// mfaSendOtp — send an OTP via Twilio Verify for a pending MFA challenge.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { normalizePhone } from "../_shared/appSession.ts";

function twilioAuth() {
  return `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`)}`;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { preauthToken } = await req.json();
    if (!preauthToken) return json({ error: "preauthToken απαιτείται" }, 400);

    const { data: challenges } = await supabase.from("MfaChallenge").select("*")
      .eq("preauth_token", preauthToken).eq("is_used", false);
    if (!challenges?.length) return json({ error: "Challenge δεν βρέθηκε" }, 404);
    const challenge = challenges[0];
    if (new Date(challenge.expires_at) < new Date()) return json({ error: "Το challenge έχει λήξει" }, 410);

    if (challenge.last_send_at) {
      const elapsed = Date.now() - new Date(challenge.last_send_at).getTime();
      if (elapsed < 30000) {
        return json({ error: "Παρακαλώ περιμένετε", resendAfterSec: Math.ceil((30000 - elapsed) / 1000) }, 429);
      }
    }
    const sendCount = Number(challenge.send_count ?? 0);
    if (sendCount >= 3) return json({ error: "Υπερβήκατε το όριο αποστολής OTP" }, 429);

    const { data: users } = await supabase.from("AppUser").select("*").eq("id", challenge.user_id);
    const user = users?.[0];
    if (user?.mfa_method === "totp") return json({ error: "Ο χρήστης χρησιμοποιεί εφαρμογή authenticator" }, 400);
    if (!user?.phone) return json({ error: "Δεν υπάρχει αριθμός τηλεφώνου για αυτόν τον χρήστη" }, 400);
    const phone = normalizePhone(user.phone);

    const body = new URLSearchParams({ To: phone, Channel: "sms", Locale: "el" });
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${Deno.env.get("TWILIO_VERIFY_SERVICE_SID")}/Verifications`,
      { method: "POST", headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body },
    );
    const tj = await res.json();
    if (!res.ok) return json({ error: `Twilio error: ${res.status} ${JSON.stringify(tj)}` }, 500);

    await supabase.from("MfaChallenge").update({
      send_count: sendCount + 1, last_send_at: new Date().toISOString(),
    }).eq("id", challenge.id);

    const maskedPhone = phone.length >= 9 ? `${phone.slice(0, 6)}***${phone.slice(-3)}` : "****";
    return json({ ok: true, resendAfterSec: 30, maskedPhone });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
