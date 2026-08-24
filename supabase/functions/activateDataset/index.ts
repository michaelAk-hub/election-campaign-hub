// activateDataset — make one dataset active, archive any other active ones.
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
    if (auth.error) return json({ success: false, error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const datasetId = body.dataset_id;
    if (!datasetId) return json({ success: false, error: "dataset_id is required" }, 400);

    // Archive currently-active datasets (except the target).
    const { data: actives } = await supabase.from("Dataset").select("id").eq("status", "active");
    for (const ds of actives ?? []) {
      if (ds.id !== datasetId) await supabase.from("Dataset").update({ status: "archived" }).eq("id", ds.id);
    }

    await supabase.from("Dataset").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", datasetId);

    // Prediction stats are computed live from Person rows — no cache rebuild needed.
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
