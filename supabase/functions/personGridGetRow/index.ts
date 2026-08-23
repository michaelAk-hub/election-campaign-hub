// personGridGetRow — fetch a single Person row (used to refresh after conflicts/edits).
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

    const rowId = String(body.row_id ?? "").trim();
    if (!rowId) return json({ error: "row_id is required" }, 400);
    const { data: row } = await supabase.from("Person").select("*").eq("id", rowId).maybeSingle();
    if (!row) return json({ error: "Η εγγραφή δεν βρέθηκε" }, 404);
    return json({ data: row });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
