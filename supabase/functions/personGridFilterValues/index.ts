// personGridFilterValues — distinct values for a column, for the grid's column filter UI.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];
const HIGH_CARD = ["person_id", "ucid", "mobile_phone", "first_name", "last_name", "monadikos_kanali"];
const MIN_SEARCH = 2;

const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");

function matchesPartition(p: any, partition: string): boolean {
  if (partition === "postgrad") return POSTGRAD.includes(p.academic_level);
  if (partition === "undergrad") return UNDERGRAD.includes(p.academic_level);
  if (partition === "unknown") return isBlank(p.academic_level);
  return true;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { columnKey, searchText = "", partition = "postgrad" } = body;

    if (columnKey === "academic_level") {
      if (partition === "postgrad") return json({ values: POSTGRAD, hasBlanks: false, totalCount: POSTGRAD.length });
      if (partition === "undergrad") return json({ values: UNDERGRAD, hasBlanks: false, totalCount: UNDERGRAD.length });
      return json({ values: [], hasBlanks: true, totalCount: 1 });
    }
    if (!columnKey) return json({ error: "columnKey is required" }, 400);

    const { data: active } = await supabase.from("Dataset").select("id").eq("status", "active");
    if (!active?.length) return json({ values: [], hasBlanks: false, totalCount: 0 });
    const datasetId = active[0].id;

    const isCustom = String(columnKey).startsWith("custom:");
    const customKey = isCustom ? String(columnKey).slice(7) : null;
    const high = isCustom || HIGH_CARD.includes(String(columnKey));
    const st = String(searchText).trim();

    if (high && st.length < MIN_SEARCH) {
      return json({
        values: [], hasBlanks: false, totalCount: 0, requiresSearch: true, minSearchChars: MIN_SEARCH,
        message: `Πληκτρολόγησε ${MIN_SEARCH}+ χαρακτήρες για να εμφανιστούν τιμές.`,
      });
    }
    if (columnKey === "voted") {
      return json({ values: [false, true], hasBlanks: false, totalCount: 2, requiresSearch: false });
    }

    const all = await fetchAll(supabase, "Person");
    const valuesSet = new Set<any>();
    let hasBlanks = false;
    for (const p of all) {
      if (p.dataset_id !== datasetId) continue;
      if (!matchesPartition(p, partition)) continue;
      const v = isCustom ? p.custom_data?.[customKey!] : p[columnKey];
      if (isBlank(v)) { hasBlanks = true; continue; }
      if (st && !String(v).toLowerCase().includes(st.toLowerCase())) continue;
      valuesSet.add(typeof v === "boolean" ? v : String(v));
    }

    const values = Array.from(valuesSet).sort((a, b) => {
      const an = Number(a), bn = Number(b);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return String(a).localeCompare(String(b), "el");
    });
    return json({ values, hasBlanks, totalCount: values.length + (hasBlanks ? 1 : 0), requiresSearch: false, minSearchChars: high ? MIN_SEARCH : 0, message: "" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
