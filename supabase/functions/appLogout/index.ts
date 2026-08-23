// appLogout — deactivate an admin/organotiki session.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { session_token } = await req.json();
    if (!session_token) return json({ error: "Απαιτείται session token" }, 400);

    const { data: sessions } = await supabase.from("AppSession").select("id")
      .eq("session_token", session_token);
    if (sessions?.length) {
      await supabase.from("AppSession").update({ is_active: false }).eq("id", sessions[0].id);
    }
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
