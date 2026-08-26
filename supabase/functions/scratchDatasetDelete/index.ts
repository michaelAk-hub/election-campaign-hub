// scratchDatasetDelete — delete one scratch table: its PersonScratch rows and
// its ScratchDataset registry entry. Admin-only. Never touches Person.
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
    if (auth.user.role !== "ADMIN") return json({ error: "Unauthorized" }, 401);

    const id = String(body.scratch_dataset_id ?? "").trim();
    if (!id) return json({ error: "scratch_dataset_id is required" }, 400);

    const delRows = await supabase.from("PersonScratch").delete().eq("scratch_dataset_id", id);
    if (delRows.error) return json({ error: delRows.error.message }, 500);
    const delDs = await supabase.from("ScratchDataset").delete().eq("id", id);
    if (delDs.error) return json({ error: delDs.error.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
