// personGridFetch — server-side data source for the Records AG-Grid.
// Filters/sorts/paginates the active dataset's Person rows (small dataset → in-memory).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];
const SEARCH_FIELDS = [
  "person_id", "first_name", "last_name", "mobile_phone", "department", "ucid",
  "direction", "X", "F26_1", "F25", "phone", "T24", "F24", "F23", "T22",
  "details", "father_n", "father_name", "ElectoralDistrict", "ElectoralTown", "RelatedMember",
];

const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
const getField = (p: any, rawField: string) =>
  rawField.startsWith("custom:") ? p.custom_data?.[rawField.slice(7)] : p[rawField];

function matchesPartition(p: any, partition: string): boolean {
  if (partition === "postgrad") return POSTGRAD.includes(p.academic_level);
  if (partition === "undergrad") return UNDERGRAD.includes(p.academic_level);
  if (partition === "unknown") return isBlank(p.academic_level);
  return true;
}
function matchesSearch(p: any, s: string): boolean {
  const q = s.toLowerCase();
  return SEARCH_FIELDS.some((f) => String(p[f] ?? "").toLowerCase().includes(q));
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

    const startRow = Math.max(0, Number(body.startRow ?? 0));
    const endRow = Number(body.endRow ?? 100);
    const sortField = String(body.sortField ?? "created_date");
    const sortDirection = String(body.sortDirection ?? "desc");
    const rawSearch = String(body.search ?? "").trim();
    const search = rawSearch.length >= 2 ? rawSearch : "";
    const partition = String(body.partition ?? "all");
    let filters = body.filters;
    if (typeof filters === "string") { try { filters = JSON.parse(filters); } catch { filters = null; } }

    let datasetId = body.datasetId;
    if (!datasetId) {
      const { data: active } = await supabase.from("Dataset").select("id").eq("status", "active");
      if (!active?.length) return json({ rows: [], lastRow: 0, total: 0 });
      datasetId = active[0].id;
    }

    const all = await fetchAll(supabase, "Person");
    const rows = all.filter((p) =>
      p.dataset_id === datasetId
      && matchesPartition(p, partition)
      && (!search || matchesSearch(p, search))
      && matchesFilters(p, filters)
    );

    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
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
    // `total` is always the full filtered row count (independent of paging),
    // so the grid footer can show it immediately without scrolling to the end.
    return json({ rows: page, lastRow, total: rows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
