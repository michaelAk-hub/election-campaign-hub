// importScratchJob — parse an uploaded CSV/XLSX and insert PersonScratch rows
// into a scratch table. Mirror of importPersonsJob, but writes to PersonScratch
// scoped by scratch_dataset_id and never activates anything. If scratch_dataset_id
// is given the rows are appended to that table; otherwise a new ScratchDataset is
// created from `name`.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { parseFile, buildHeaderMap, mapRow, EXPORT_COLUMNS } from "../_shared/personIO.ts";

const INSERT_BATCH = 500;
const norm = (k: unknown) => String(k).trim().toLowerCase();
const LABELS: Record<string, string> = Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label]));

// Build this scratch table's ColumnDef rows from the file's headers, in order.
// Free-form: nothing is mandatory; unmapped headers become custom (JSONB) fields.
function columnDefsFromHeaders(tableKey: string, headers: string[], headerMap: Record<string, string>) {
  const seen = new Set<string>();
  const defs: any[] = [];
  let order = 10;
  for (const h of headers) {
    const canonical = headerMap[norm(h)] || headerMap[h] || null;
    const physical = !!canonical;
    const key = canonical || h;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const type = key === "voted" ? "boolean" : key === "voted_at" ? "date" : "text";
    defs.push({
      table_key: tableKey, key, label: LABELS[key] || key, type,
      mandatory: false, physical, sort_order: order,
    });
    order += 10;
  }
  return defs;
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

    const { file_url, name, person_id_col } = body;
    let scratchDatasetId = body.scratch_dataset_id;
    if (!file_url) return json({ error: "file_url is required" }, 400);

    // Parse the file.
    let rawRows: Record<string, any>[];
    try {
      rawRows = await parseFile(file_url);
    } catch (e) {
      return json({ error: `File parse error: ${(e as Error).message}` }, 400);
    }
    const total = rawRows.length;

    // Map + assign a person_id when missing (same rule as the live import).
    const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
    const headerMap = buildHeaderMap(headers);
    const mapped = rawRows.map((r, i) => {
      const row = mapRow(r, headerMap);
      if (!row.person_id || String(row.person_id).trim() === "") {
        row.person_id = person_id_col && r[person_id_col] ? String(r[person_id_col]).trim() : String(i + 1);
      }
      return row;
    });
    const valid = mapped.filter((r) => r.person_id && String(r.person_id).trim() !== "");

    // Resolve / create the scratch dataset.
    if (!scratchDatasetId) {
      const dsName = name || `Scratch ${new Date().toISOString().split("T")[0]}`;
      const { data: ds, error: dsErr } = await supabase.from("ScratchDataset")
        .insert({ name: dsName, status: "active", total_records: 0 }).select().single();
      if (dsErr) return json({ error: dsErr.message }, 500);
      scratchDatasetId = ds!.id;
    }

    const failed: string[] = [];
    let processed = 0;
    for (let i = 0; i < valid.length; i += INSERT_BATCH) {
      const chunk = valid.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, scratch_dataset_id: scratchDatasetId }));
      const { error } = await supabase.from("PersonScratch").insert(chunk);
      if (error) {
        for (const row of chunk) {
          const { error: e2 } = await supabase.from("PersonScratch").insert(row);
          if (e2) failed.push(String(row.person_id));
          else processed++;
        }
      } else {
        processed += chunk.length;
      }
    }

    // Define this table's columns from the file headers (idempotent — re-import
    // won't duplicate). New headers on a re-import are added as extra columns.
    const defs = columnDefsFromHeaders(scratchDatasetId, headers, headerMap);
    if (defs.length) {
      await supabase.from("ColumnDef").upsert(defs, { onConflict: "table_key,key", ignoreDuplicates: true });
    }

    // Keep the registry's row_count in sync.
    const { count } = await supabase.from("PersonScratch")
      .select("*", { count: "exact", head: true }).eq("scratch_dataset_id", scratchDatasetId);
    await supabase.from("ScratchDataset")
      .update({ total_records: count ?? processed }).eq("id", scratchDatasetId);

    return json({
      success: true, scratch_dataset_id: scratchDatasetId,
      total, processed, failed: failed.length, done: true,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
