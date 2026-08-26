// exportScratchJob — export one scratch table to .xlsx. Same output format as
// the live export (buildXlsx / EXPORT_COLUMNS from personIO), but reads
// PersonScratch scoped by scratch_dataset_id and returns the file bytes
// directly (binary body) — no storage bucket, no base64/JSON round-trip.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json, cors } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { buildXlsx } from "../_shared/personIO.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const id = String(body.scratch_dataset_id ?? "").trim();
    if (!id) return json({ error: "scratch_dataset_id is required" }, 400);

    const all = await fetchAll(supabase, "PersonScratch");
    const rows = all.filter((p) => p.scratch_dataset_id === id);
    const bytes = buildXlsx(rows);

    const { data: ds } = await supabase.from("ScratchDataset").select("name").eq("id", id).maybeSingle();
    const safeName = String(ds?.name ?? "scratch").replace(/[^\w.-]+/g, "_");

    return new Response(bytes, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
