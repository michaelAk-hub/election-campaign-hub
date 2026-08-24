// deleteOrganotiki — ADMIN deletes an ORGANOTIKI user (and their sessions).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές μπορούν να διαγράψουν χρήστες" }, 403);
    const admin = auth.user;

    const { target_user_id } = body;
    const { data: targetUser } = await supabase.from("AppUser").select("*").eq("id", target_user_id).maybeSingle();
    if (!targetUser) return json({ error: "Ο χρήστης δεν βρέθηκε" }, 404);
    if (targetUser.role !== "ORGANOTIKI") return json({ error: "Μόνο χρήστες ORGANOTIKI μπορούν να διαγραφούν" }, 403);

    await supabase.from("AppSession").update({ is_active: false }).eq("app_user_id", target_user_id).eq("is_active", true);
    await supabase.from("AppUser").delete().eq("id", target_user_id);

    await supabase.from("Notification").insert({
      recipient_type: "admin", type: "system", category: "account_update",
      title: "Διαγραφή χρήστη Organotiki",
      message: `Ο διαχειριστής ${admin.name} ${admin.surname} διέγραψε τον χρήστη: ${targetUser.name} ${targetUser.surname}`,
    });

    return json({ success: true, message: "Ο χρήστης διαγράφηκε επιτυχώς" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
