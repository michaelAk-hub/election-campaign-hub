// schemaAdmin — admin-authed management of the shared column schema (ColumnDef).
// Enforces the rules server-side so the Design View can't violate them:
//   • mandatory fields cannot be renamed, retyped, or deleted
//   • a type change is validated first — blocked if existing values don't convert
//   • deleting a field reports/clears its data (custom_data key across Person +
//     PersonScratch; physical columns are unsurfaced, values left in place)
// Ops: list, addField, updateField, validateType, countFieldData, deleteField, reorder.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const VALID_TYPES = new Set(["text", "number", "date", "boolean", "select"]);
const SAMPLE_LIMIT = 20;

const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");

// Can `value` be represented as `type`? Blank always converts.
function convertsTo(value: any, type: string): boolean {
  if (isBlank(value)) return true;
  const s = String(value).trim();
  if (type === "number") return !isNaN(Number(s));
  if (type === "date") return !isNaN(Date.parse(s));
  if (type === "boolean") return ["ναι", "οχι", "όχι", "nai", "oxi", "yes", "no", "true", "false", "1", "0", "y", "n"].includes(s.toLowerCase());
  return true; // text / select accept anything
}

const readField = (row: any, key: string, physical: boolean) =>
  physical ? row[key] : row?.custom_data?.[key];

// Rows belonging to one table_key: the live roll → Person; a scratch table →
// that scratch dataset's PersonScratch rows.
async function rowsForTable(supabase: any, tableKey: string): Promise<any[]> {
  if (tableKey === "live") return await fetchAll(supabase, "Person");
  const all = await fetchAll(supabase, "PersonScratch");
  return all.filter((r) => r.scratch_dataset_id === tableKey);
}

// Scan one field's values within its own table; return offending rows for a type.
async function scanField(supabase: any, field: any, type: string) {
  const rows = await rowsForTable(supabase, field.table_key);
  let withValue = 0;
  const offending: any[] = [];
  for (const r of rows) {
    const v = readField(r, field.key, field.physical);
    if (!isBlank(v)) withValue++;
    if (type && !convertsTo(v, type)) {
      if (offending.length < SAMPLE_LIMIT) {
        offending.push({ id: r.id, person_id: r.person_id, first_name: r.first_name, last_name: r.last_name, value: v });
      }
    }
  }
  return { withValue, offending };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Unauthorized" }, 401);

    const op = String(body.op ?? "");

    const tableKey = String(body.table_key ?? "live");

    if (op === "list") {
      const { data } = await supabase.from("ColumnDef").select("*")
        .eq("table_key", tableKey).order("sort_order", { ascending: true });
      return json({ result: data ?? [] });
    }

    if (op === "addField") {
      const rawKey = String(body.key ?? "").trim();
      const key = rawKey.replace(/[^\w]/g, "_");
      const type = String(body.type ?? "text");
      if (!key) return json({ error: "Το όνομα πεδίου είναι υποχρεωτικό" }, 400);
      if (!VALID_TYPES.has(type)) return json({ error: `Μη έγκυρος τύπος: ${type}` }, 400);
      const { data: existing } = await supabase.from("ColumnDef").select("id")
        .eq("table_key", tableKey).eq("key", key).maybeSingle();
      if (existing) return json({ error: `Υπάρχει ήδη πεδίο «${key}»` }, 400);
      const { data: maxRow } = await supabase.from("ColumnDef").select("sort_order")
        .eq("table_key", tableKey).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const nextOrder = (Number(maxRow?.sort_order) || 0) + 10;
      const { data, error } = await supabase.from("ColumnDef").insert({
        table_key: tableKey, key, label: String(body.label ?? key), type,
        mandatory: false, physical: false, sort_order: nextOrder,
        options: Array.isArray(body.options) ? body.options : null,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (op === "countFieldData") {
      const { data: field } = await supabase.from("ColumnDef").select("*").eq("id", body.id).maybeSingle();
      if (!field) return json({ error: "Το πεδίο δεν βρέθηκε" }, 404);
      const { withValue } = await scanField(supabase, field, "");
      return json({ result: { withValue } });
    }

    if (op === "validateType") {
      const { data: field } = await supabase.from("ColumnDef").select("*").eq("id", body.id).maybeSingle();
      if (!field) return json({ error: "Το πεδίο δεν βρέθηκε" }, 404);
      const type = String(body.type ?? field.type);
      const { offending } = await scanField(supabase, field, type);
      return json({ result: { ok: offending.length === 0, offending } });
    }

    if (op === "updateField") {
      const { data: field } = await supabase.from("ColumnDef").select("*").eq("id", body.id).maybeSingle();
      if (!field) return json({ error: "Το πεδίο δεν βρέθηκε" }, 404);
      const patch: any = {};
      if (body.label !== undefined) patch.label = String(body.label);
      if (body.options !== undefined) patch.options = Array.isArray(body.options) ? body.options : null;
      if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);

      if (body.type !== undefined && body.type !== field.type) {
        if (field.mandatory) return json({ error: "Δεν επιτρέπεται αλλαγή τύπου σε υποχρεωτικό πεδίο" }, 400);
        if (!VALID_TYPES.has(String(body.type))) return json({ error: "Μη έγκυρος τύπος" }, 400);
        const { offending } = await scanField(supabase, field, String(body.type));
        if (offending.length > 0 && !body.force) {
          return json({ result: { blocked: true, offending } });
        }
        patch.type = String(body.type);
      }
      if ((body.label !== undefined && field.mandatory && String(body.label) !== field.label)) {
        return json({ error: "Δεν επιτρέπεται μετονομασία υποχρεωτικού πεδίου" }, 400);
      }
      const { data, error } = await supabase.from("ColumnDef").update(patch).eq("id", field.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (op === "deleteField") {
      const { data: field } = await supabase.from("ColumnDef").select("*").eq("id", body.id).maybeSingle();
      if (!field) return json({ error: "Το πεδίο δεν βρέθηκε" }, 404);
      if (field.mandatory) return json({ error: "Δεν επιτρέπεται διαγραφή υποχρεωτικού πεδίου" }, 400);

      // Clean the data within this field's OWN table. For custom (JSONB) fields,
      // strip the key from each row's custom_data. Physical seeded columns are
      // left in place (runtime DDL is risky) and just unsurfaced.
      if (!field.physical) {
        const targetTable = field.table_key === "live" ? "Person" : "PersonScratch";
        const rows = await rowsForTable(supabase, field.table_key);
        for (const r of rows) {
          if (r.custom_data && Object.prototype.hasOwnProperty.call(r.custom_data, field.key)) {
            const cd = { ...r.custom_data };
            delete cd[field.key];
            await supabase.from(targetTable).update({ custom_data: cd }).eq("id", r.id);
          }
        }
      }
      const { error } = await supabase.from("ColumnDef").delete().eq("id", field.id);
      if (error) return json({ error: error.message }, 500);
      return json({ result: { success: true } });
    }

    if (op === "reorder") {
      const order: string[] = Array.isArray(body.order) ? body.order : []; // array of ColumnDef ids
      let i = 10;
      for (const id of order) {
        await supabase.from("ColumnDef").update({ sort_order: i }).eq("id", id);
        i += 10;
      }
      return json({ result: { success: true } });
    }

    return json({ error: `Unsupported op: ${op}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
