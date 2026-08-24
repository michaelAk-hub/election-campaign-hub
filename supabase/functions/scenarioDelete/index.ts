// scenarioDelete — remove a saved scenario. Errors use { message } (frontend reads it).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { scenario_id } = body;

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ message: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (!scenario_id) return json({ message: "Scenario ID απαιτείται." }, 400);

    const { data: scenarios } = await supabase.from("PredictionScenario").select("id").eq("id", scenario_id);
    if (!scenarios?.length) return json({ message: "Το σενάριο δεν βρέθηκε." }, 404);

    const { error } = await supabase.from("PredictionScenario").delete().eq("id", scenario_id);
    if (error) return json({ message: "Σφάλμα κατά τη διαγραφή." }, 500);
    return json({ success: true });
  } catch (e) {
    return json({ message: (e as Error).message }, 500);
  }
});
