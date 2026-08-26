// exportScratchJob — export one scratch table to .xlsx. Same output format as
// the live export (buildXlsx / EXPORT_COLUMNS from personIO), but reads
// PersonScratch scoped by scratch_dataset_id and returns the file inline as a
// base64 data payload (no storage bucket needed for these throwaway tables).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { buildXlsx } from "../_shared/personIO.ts";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
    const base64 = toBase64(bytes);
    const { data: ds } = await supabase.from("ScratchDataset").select("name").eq("id", id).maybeSingle();
    const safeName = String(ds?.name ?? "scratch").replace(/[^\w.-]+/g, "_");
    const filename = `${safeName}.xlsx`;

    return json({
      success: true,
      filename,
      base64,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
