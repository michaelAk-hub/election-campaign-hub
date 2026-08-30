// kanaliBFindMatches — rank live-table candidates for one Kanali Τύπος B
// submission. Hard filters narrow the active-dataset Person rows first, then the
// survivors are fuzzy-scored on the weighted fields. Admin/organotiki only.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { hardEquals, similarity } from "../_shared/greek.ts";

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

// Physical column, else custom_data key.
const getField = (p: any, key: string) => {
  if (key.startsWith("custom:")) return p.custom_data?.[key.slice(7)];
  return p[key] !== undefined ? p[key] : p.custom_data?.[key];
};

// Fields shown on each candidate card for context.
const DISPLAY = ["person_id", "last_name", "first_name", "department", "admission_year", "mobile_phone", "father_name"];

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const submissionId = body.submission_id;
    if (!submissionId) return json({ error: "submission_id required" }, 400);

    const { data: subs } = await supabase.from("KanaliBSubmission").select("*").eq("id", submissionId);
    const submission = subs?.[0];
    if (!submission) return json({ error: "Η υποβολή δεν βρέθηκε" }, 404);
    const values = submission.values || {};

    const form = await fetchAll(supabase, "KanaliBFormField");
    const hardFields = (form || []).filter((f: any) => f.match_role === "hard" && filled(values[f.field_key]));
    const fuzzyFields = (form || []).filter((f: any) => f.match_role === "fuzzy" && filled(values[f.field_key]));

    const { data: active } = await supabase.from("Dataset").select("id").eq("status", "active");
    if (!active?.length) return json({ ok: true, submission, candidates: [], note: "no_active_dataset" });
    const datasetId = active[0].id;

    const persons = (await fetchAll(supabase, "Person")).filter((p: any) => p.dataset_id === datasetId);

    // 1) Hard filters narrow the pool.
    let pool = persons;
    for (const f of hardFields) {
      const target = values[f.field_key];
      pool = pool.filter((p: any) => hardEquals(getField(p, f.field_key), target));
    }

    // 2) Fuzzy-score the survivors.
    const totalW = fuzzyFields.reduce((a: number, f: any) => a + (Number(f.weight) || 1), 0);
    const scored = pool.map((p: any) => {
      let acc = 0;
      for (const f of fuzzyFields) {
        acc += (Number(f.weight) || 1) * similarity(getField(p, f.field_key), values[f.field_key]);
      }
      // Only hard filters used → exact survivors → 100%.
      const score = totalW > 0 ? acc / totalW : (hardFields.length ? 1 : 0);
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // 3) Keep ≥ 50%; if none clear the bar, show the closest few anyway.
    let top = scored.filter((s) => s.score >= 0.5);
    let belowThreshold = false;
    if (top.length === 0) { top = scored.slice(0, 5); belowThreshold = true; }
    top = top.slice(0, 25);

    const candidates = top.map(({ p, score }) => {
      const display: Record<string, any> = {};
      for (const k of DISPLAY) display[k] = getField(p, k);
      return {
        id: p.id,
        percent: Math.round(score * 100),
        voted: !!p.voted,
        voted_at: p.voted_at || null,
        display,
      };
    });

    return json({ ok: true, submission, hardCount: hardFields.length, fuzzyCount: fuzzyFields.length, poolSize: pool.length, belowThreshold, candidates });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
