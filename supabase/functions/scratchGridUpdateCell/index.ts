// scratchGridUpdateCell — edit one PersonScratch field with optimistic
// (row_version) concurrency. Mirror of personGridUpdateCell, plus support for
// editing custom_data fields (field name "custom:<key>").
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

// System columns that are never directly editable through the grid.
const NON_EDITABLE = new Set([
  "id", "created_date", "updated_date", "created_by", "row_version",
  "scratch_dataset_id", "dataset_id",
]);
const normalizeText = (v: any) => (v === null || v === undefined ? "" : String(v).trim());

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const person_id = String(body.person_id ?? "").trim(); // row id
    const field = String(body.field ?? "").trim();
    const expected = Number(body.expected_row_version);
    let value = body.value;
    if (!person_id || !field || Number.isNaN(expected)) return json({ error: "Invalid payload" }, 400);
    if (NON_EDITABLE.has(field)) return json({ error: `Field not editable: ${field}` }, 400);

    const { data: current } = await supabase.from("PersonScratch").select("*").eq("id", person_id).maybeSingle();
    if (!current) return json({ error: "Not found" }, 404);
    if (Number(current.row_version) !== expected) return json({ error: "Conflict", current_row: current }, 409);

    const patch: any = { row_version: Number(current.row_version || 1) + 1 };
    if (field.startsWith("custom:")) {
      const key = field.slice(7);
      const custom = { ...(current.custom_data || {}) };
      custom[key] = normalizeText(value);
      patch.custom_data = custom;
    } else if (field === "voted") {
      const newV = Boolean(value), oldV = Boolean(current.voted);
      patch.voted = newV;
      if (!oldV && newV) patch.voted_at = new Date().toISOString();
      if (oldV && !newV) patch.voted_at = null;
    } else {
      patch[field] = normalizeText(value);
    }

    const { data: updated } = await supabase.from("PersonScratch").update(patch).eq("id", current.id).select().maybeSingle();
    return json({ data: updated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
