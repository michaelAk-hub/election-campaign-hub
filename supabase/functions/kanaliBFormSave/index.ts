// kanaliBFormSave — replace the shared Kanali Τύπος B form definition.
// Admin/organotiki only. The client sends the full ordered field list; we
// upsert it and delete any rows that were removed.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const VALID_INPUT = new Set(["text", "number", "date", "dropdown", "yesno"]);
const VALID_ROLE = new Set(["hard", "fuzzy"]);

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const incoming: any[] = Array.isArray(body.fields) ? body.fields : [];
    const T = () => supabase.from("KanaliBFormField");

    // Normalize + validate.
    const rows = incoming
      .filter((f) => f && f.field_key)
      .map((f, i) => ({
        id: f.id || undefined,
        field_key: String(f.field_key),
        label: String(f.label ?? f.field_key),
        input_type: VALID_INPUT.has(f.input_type) ? f.input_type : "text",
        required: !!f.required,
        weight: Math.max(1, Number(f.weight) || 1),
        match_role: VALID_ROLE.has(f.match_role) ? f.match_role : "fuzzy",
        options: Array.isArray(f.options) ? f.options : [],
        sort_order: Number.isFinite(f.sort_order) ? f.sort_order : i,
      }));

    const existing = await fetchAll(supabase, "KanaliBFormField");
    const keepIds = new Set(rows.map((r) => r.id).filter(Boolean));
    const toDelete = (existing || []).filter((e: any) => !keepIds.has(e.id)).map((e: any) => e.id);

    for (const r of rows) {
      if (r.id) {
        const { id, ...patch } = r;
        await T().update(patch).eq("id", id);
      } else {
        const { id, ...ins } = r;
        await T().insert(ins);
      }
    }
    if (toDelete.length) await T().delete().in("id", toDelete);

    const after = await fetchAll(supabase, "KanaliBFormField");
    const fields = (after || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    return json({ ok: true, fields });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
