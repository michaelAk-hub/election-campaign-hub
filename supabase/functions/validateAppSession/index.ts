// validateAppSession — used on every admin page load: checks session validity,
// forced-logout (session_version), organotiki active state, and 15-min idle timeout.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";

const IDLE_TIMEOUT_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { session_token } = await req.json();
    if (!session_token) return json({ valid: false, error: "Απαιτείται session token" }, 400);

    const { data: sessions } = await supabase.from("AppSession").select("*")
      .eq("session_token", session_token).eq("is_active", true);
    if (!sessions?.length) return json({ valid: false, error: "Μη έγκυρη συνεδρία" }, 401);
    const session = sessions[0];

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from("AppSession").update({ is_active: false }).eq("id", session.id);
      return json({ valid: false, error: "Η συνεδρία έληξε" }, 401);
    }

    const { data: users } = await supabase.from("AppUser").select("*").eq("id", session.app_user_id);
    const user = users?.[0];
    if (!user) return json({ valid: false, error: "Χρήστης δεν βρέθηκε" }, 404);

    if (session.session_version_at_login !== user.session_version) {
      await supabase.from("AppSession").update({ is_active: false }).eq("id", session.id);
      return json({ valid: false, error: "Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.", force_logout: true }, 401);
    }
    if (user.role === "ORGANOTIKI" && !user.is_active) {
      return json({ valid: false, error: "Ο λογαριασμός σας έχει απενεργοποιηθεί" }, 403);
    }
    if (session.last_seen_at) {
      const idleSeconds = (Date.now() - new Date(session.last_seen_at).getTime()) / 1000;
      if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
        await supabase.from("AppSession").update({ is_active: false }).eq("id", session.id);
        return json({ valid: false, reason: "idle_timeout", error: "Η συνεδρία σας έληξε λόγω αδράνειας" }, 401);
      }
    }

    return json({
      valid: true,
      user: {
        id: user.id, role: user.role, email: user.email,
        name: user.name, surname: user.surname, phone: user.phone, is_active: user.is_active,
      },
    });
  } catch (e) {
    return json({ valid: false, error: (e as Error).message }, 500);
  }
});
