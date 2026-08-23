// personGridBatchUpdate — edit multiple Person fields at once with row_version concurrency.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { NON_EDITABLE, normalizeText } from "../_shared/person.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { person_id, fields, expected_row_version } = body;
    if (!person_id || !fields || typeof fields !== "object") {
      return json({ error: "Invalid payload: person_id and fields are required" }, 400);
    }

    const { data: current } = await supabase.from("Person").select("*").eq("id", person_id).maybeSingle();
    if (!current) return json({ error: "Person not found" }, 404);
    if (Number(current.row_version) !== Number(expected_row_version)) {
      return json({ error: "Conflict", current_row: current }, 409);
    }

    const patch: any = {};
    for (const [field, value] of Object.entries(fields)) {
      if (NON_EDITABLE.has(field)) continue;
      if (field === "voted") {
        const newV = Boolean(value), oldV = Boolean(current.voted);
        patch.voted = newV;
        if (!oldV && newV) patch.voted_at = new Date().toISOString();
        if (oldV && !newV) patch.voted_at = null;
      } else if (value === null || typeof value === "string") {
        patch[field] = normalizeText(value);
      } else {
        patch[field] = value;
      }
    }
    patch.row_version = Number(current.row_version || 1) + 1;

    const { data: updated } = await supabase.from("Person").update(patch).eq("id", person_id).select().maybeSingle();
    // TODO(prediction stats): trigger a rebuild once predictions are ported.
    return json({ data: updated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
