// mfaEnrollQr — return a QR image (data URL) for a pending TOTP enrollment.
// Isolated from appLogin so the qrcode dependency never touches the login path.
// If QR generation is unavailable, the frontend falls back to the manual key.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { otpauthUri } from "../_shared/totp.ts";
import QRCode from "npm:qrcode@1.5.3";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { preauthToken } = await req.json().catch(() => ({}));
    if (!preauthToken) return json({ error: "preauthToken απαιτείται" }, 400);

    const { data: challenges } = await supabase.from("MfaChallenge").select("*")
      .eq("preauth_token", preauthToken).eq("is_used", false);
    if (!challenges?.length) return json({ error: "Challenge δεν βρέθηκε" }, 404);
    const challenge = challenges[0];
    if (new Date(challenge.expires_at) < new Date()) return json({ error: "Το challenge έχει λήξει" }, 410);

    const { data: user } = await supabase.from("AppUser").select("*").eq("id", challenge.user_id).maybeSingle();
    if (!user || user.mfa_method !== "totp" || !user.totp_secret || user.totp_enrolled) {
      return json({ error: "Μη διαθέσιμο" }, 400);
    }
    const uri = otpauthUri(user.totp_secret, user.email || user.id);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return json({ ok: true, qr });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
