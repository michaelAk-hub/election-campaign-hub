// scratchGridFilterValues — distinct values for one column of a scratch table,
// for the grid's Excel-style set-filter. Same contract as personGridFilterValues
// but reads PersonScratch scoped by scratch_dataset_id, and resolves free-form
// columns from custom_data (scratch tables keep their extra columns there).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const MIN_SEARCH = 2;
const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");

// A column key resolves to a physical column when present, else a custom_data key.
const getField = (p: any, rawField: string) => {
  if (rawField.startsWith("custom:")) return p.custom_data?.[rawField.slice(7)];
  return p[rawField] !== undefined ? p[rawField] : p.custom_data?.[rawField];
};

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { columnKey, searchText = "", scratchDatasetId } = body;
    if (!columnKey) return json({ error: "columnKey is required" }, 400);
    if (!scratchDatasetId) return json({ values: [], hasBlanks: false, totalCount: 0 });

    const st = String(searchText).trim();
    const all = await fetchAll(supabase, "PersonScratch");

    // First pass: how many distinct values exist. If it's a high-cardinality
    // column, require a search term (like the live grid) so we don't dump 6000
    // values into the popover.
    const valuesSet = new Set<any>();
    let hasBlanks = false;
    let distinctCountAll = 0;
    const seenForCount = new Set<any>();
    for (const p of all) {
      if (p.scratch_dataset_id !== scratchDatasetId) continue;
      const v = getField(p, columnKey);
      if (isBlank(v)) { hasBlanks = true; continue; }
      const norm = typeof v === "boolean" ? v : String(v);
      if (!seenForCount.has(norm)) seenForCount.add(norm);
      if (st && !String(v).toLowerCase().includes(st.toLowerCase())) continue;
      valuesSet.add(norm);
    }
    distinctCountAll = seenForCount.size;

    const HIGH_CARD_THRESHOLD = 200;
    if (distinctCountAll > HIGH_CARD_THRESHOLD && st.length < MIN_SEARCH) {
      return json({
        values: [], hasBlanks: false, totalCount: 0, requiresSearch: true, minSearchChars: MIN_SEARCH,
        message: `Πληκτρολόγησε ${MIN_SEARCH}+ χαρακτήρες για να εμφανιστούν τιμές.`,
      });
    }

    const values = Array.from(valuesSet).sort((a, b) => {
      const an = Number(a), bn = Number(b);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b), "el");
    });
    return json({
      values,
      hasBlanks,
      totalCount: values.length + (hasBlanks ? 1 : 0),
      requiresSearch: false,
      minSearchChars: distinctCountAll > HIGH_CARD_THRESHOLD ? MIN_SEARCH : 0,
      message: "",
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
