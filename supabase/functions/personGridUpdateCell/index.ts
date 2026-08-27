// personGridUpdateCell — edit one Person field with optimistic (row_version) concurrency.
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

    const person_id = String(body.person_id ?? "").trim();
    const field = String(body.field ?? "").trim();
    const expected = Number(body.expected_row_version);
    let value = body.value;
    if (!person_id || !field || Number.isNaN(expected)) return json({ error: "Invalid payload" }, 400);
    const isCustom = field.startsWith("custom:");
    if (!isCustom && NON_EDITABLE.has(field)) return json({ error: `Field not editable: ${field}` }, 400);
    if (field !== "voted") value = normalizeText(value);

    const { data: current } = await supabase.from("Person").select("*").eq("id", person_id).maybeSingle();
    if (!current) return json({ error: "Not found" }, 404);
    if (Number(current.row_version) !== expected) return json({ error: "Conflict", current_row: current }, 409);

    const patch: any = { row_version: Number(current.row_version || 1) + 1 };
    if (isCustom) {
      const key = field.slice(7);
      const custom = { ...(current.custom_data || {}) };
      custom[key] = value;
      patch.custom_data = custom;
    } else if (field === "voted") {
      const newV = Boolean(value), oldV = Boolean(current.voted);
      patch.voted = newV;
      if (!oldV && newV) patch.voted_at = new Date().toISOString();
      if (oldV && !newV) patch.voted_at = null;
    } else {
      patch[field] = value;
    }

    const { data: updated } = await supabase.from("Person").update(patch).eq("id", current.id).select().maybeSingle();
    // Prediction stats are computed live from Person rows — no cache rebuild needed.
    return json({ data: updated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
