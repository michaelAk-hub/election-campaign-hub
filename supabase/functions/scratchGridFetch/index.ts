// scratchGridFetch — server-side data source for a scratch table's AG-Grid.
// Same shape as personGridFetch, but reads PersonScratch scoped by
// scratch_dataset_id. Deliberately separate from Person: no other system
// function reads this table, so scratch data can never leak into predictions,
// χρεωστικά, or queries.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const SEARCH_FIELDS = [
  "person_id", "first_name", "last_name", "mobile_phone", "department", "ucid",
  "direction", "X", "F26_1", "F25", "phone", "T24", "F24", "F23", "T22",
  "details", "father_n", "father_name", "ElectoralDistrict", "ElectoralTown", "RelatedMember",
];

const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
// A column key resolves to a physical column when present, else a custom_data key
// (scratch tables keep free-form columns in custom_data).
const getField = (p: any, rawField: string) => {
  if (rawField.startsWith("custom:")) return p.custom_data?.[rawField.slice(7)];
  return p[rawField] !== undefined ? p[rawField] : p.custom_data?.[rawField];
};

function matchesSearch(p: any, s: string): boolean {
  const q = s.toLowerCase();
  return SEARCH_FIELDS.some((f) => String(p[f] ?? "").toLowerCase().includes(q))
    || Object.values(p.custom_data ?? {}).some((v) => String(v ?? "").toLowerCase().includes(q));
}
function matchesFilters(p: any, filters: any): boolean {
  for (const [rawField, model] of Object.entries(filters || {})) {
    if (!model) continue;
    const v = getField(p, rawField);
    if (typeof model === "object" && (model as any).filterType === "set") {
      const { values = [], includeBlanks = false } = model as any;
      const inValues = values.includes(v) || values.map(String).includes(String(v));
      if (!(inValues || (isBlank(v) && includeBlanks))) return false;
    } else if (typeof model === "object" && (model as any).filterType === "text") {
      const type = String((model as any).type ?? "contains");
      const val = String((model as any).filter ?? "");
      if (!val) continue;
      const sv = String(v ?? "").toLowerCase();
      const q = val.toLowerCase();
      if (type === "contains" && !sv.includes(q)) return false;
      else if (type === "startsWith" && !sv.startsWith(q)) return false;
      else if (type === "equals" && String(v ?? "") !== val) return false;
    } else if (typeof model === "boolean") {
      if (Boolean(v) !== model) return false;
    }
  }
  return true;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) {
      return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    }

    const scratchDatasetId = body.scratchDatasetId;
    if (!scratchDatasetId) return json({ rows: [], lastRow: 0, total: 0 });

    const startRow = Math.max(0, Number(body.startRow ?? 0));
    const endRow = Number(body.endRow ?? 100);
    const sortField = String(body.sortField ?? "created_date");
    const sortDirection = String(body.sortDirection ?? "desc");
    const rawSearch = String(body.search ?? "").trim();
    const search = rawSearch.length >= 2 ? rawSearch : "";
    let filters = body.filters;
    if (typeof filters === "string") { try { filters = JSON.parse(filters); } catch { filters = null; } }

    const all = await fetchAll(supabase, "PersonScratch");
    const rows = all.filter((p) =>
      p.scratch_dataset_id === scratchDatasetId
      && (!search || matchesSearch(p, search))
      && matchesFilters(p, filters)
    );

    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = getField(a, sortField), bv = getField(b, sortField);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn) && String(av).trim() !== "" && String(bv).trim() !== "") return (an - bn) * dir;
      return String(av).localeCompare(String(bv), "el") * dir;
    });

    const limit = Math.max(1, (endRow - startRow) || 100);
    const page = rows.slice(startRow, startRow + limit);
    const lastRow = (startRow + page.length >= rows.length) ? rows.length : -1;
    return json({ rows: page, lastRow, total: rows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
