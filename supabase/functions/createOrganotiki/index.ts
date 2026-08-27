// createOrganotiki — ADMIN creates a new (inactive) ORGANOTIKI user.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { hashPassword } from "../_shared/password.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές μπορούν να δημιουργήσουν χρήστες" }, 403);
    const admin = auth.user;

    const { name, surname, phone, email, password } = body;
    if (!name || !surname || !phone || !email || !password) return json({ error: "Όλα τα πεδία είναι υποχρεωτικά" }, 400);

    const { data: existing } = await supabase.from("AppUser").select("id").eq("email", email.toLowerCase()).maybeSingle();
    if (existing) return json({ error: "Το email υπάρχει ήδη" }, 400);

    const password_hash = await hashPassword(password);
    const { data: newUser } = await supabase.from("AppUser").insert({
      role: "ORGANOTIKI", email: email.toLowerCase(), password_hash, name, surname, phone,
      is_active: false, session_version: 1, password_changed_at: new Date().toISOString(), created_by_admin_id: admin.id,
    }).select().single();

    await supabase.from("Notification").insert({
      recipient_type: "admin", type: "system", category: "account_update",
      title: "Νέος χρήστης Organotiki",
      message: `Ο διαχειριστής ${admin.name} ${admin.surname} δημιούργησε νέο χρήστη: ${newUser!.name} ${newUser!.surname}`,
    });

    return json({ success: true, user: { id: newUser!.id, email: newUser!.email, name: newUser!.name, surname: newUser!.surname, is_active: newUser!.is_active } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
