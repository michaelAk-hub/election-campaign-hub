// importScratchJob — parse an uploaded CSV/XLSX and insert PersonScratch rows
// into a scratch table. Writes to PersonScratch scoped by scratch_dataset_id and
// never activates anything. Three modes:
//   • preview: true            → parse headers only, import nothing
//   • mapping: {header→target} → import applying the user's column mapping
//   • (neither)                → auto-map headers (legacy/default)
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { parseFile, buildHeaderMap, mapRow, EXPORT_COLUMNS, KNOWN_FIELDS } from "../_shared/personIO.ts";

const INSERT_BATCH = 500;
const norm = (k: unknown) => String(k).trim().toLowerCase();
const LABELS: Record<string, string> = Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label]));
const sanitize = (h: string) => String(h).trim().replace(/[^\p{L}\p{N}]+/gu, "_");
const toBool = (v: any) => ["ναι", "nai", "yes", "true", "1", "y"].includes(String(v ?? "").trim().toLowerCase());
const colType = (key: string) => (key === "voted" ? "boolean" : key === "voted_at" ? "date" : "text");

// Auto path: build ColumnDef rows from the file's headers (in order).
function columnDefsFromHeaders(tableKey: string, headers: string[], headerMap: Record<string, string>, startOrder: number) {
  const seen = new Set<string>();
  const defs: any[] = [];
  let order = startOrder;
  for (const h of headers) {
    const canonical = headerMap[norm(h)] || headerMap[h] || null;
    const physical = !!canonical;
    const key = canonical || h;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    defs.push({ table_key: tableKey, key, label: LABELS[key] || key, type: colType(key), mandatory: false, physical, sort_order: order });
    order += 10;
  }
  return defs;
}

// Mapping path: resolve one file header's target key ('__skip__' → null).
function targetKey(header: string, target: string): string | null {
  if (!target || target === "__skip__") return null;
  return target === "__new__" ? sanitize(header) : target;
}

function rowFromMapping(raw: Record<string, any>, mapping: Record<string, string>) {
  const out: Record<string, any> = {};
  const custom: Record<string, string> = {};
  for (const [header, target] of Object.entries(mapping)) {
    const key = targetKey(header, target);
    if (!key) continue;
    const value = raw[header];
    if (key === "voted") { out.voted = toBool(value); continue; }
    const sval = value === null || value === undefined ? "" : String(value).trim();
    if (KNOWN_FIELDS.has(key)) out[key] = sval; else custom[key] = sval;
  }
  if (Object.keys(custom).length) out.custom_data = custom;
  return out;
}

function columnDefsFromMapping(tableKey: string, mapping: Record<string, string>, startOrder: number) {
  const seen = new Set<string>();
  const defs: any[] = [];
  let order = startOrder;
  for (const [header, target] of Object.entries(mapping)) {
    const key = targetKey(header, target);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const physical = KNOWN_FIELDS.has(key);
    const label = target === "__new__" ? header : (LABELS[key] || key);
    defs.push({ table_key: tableKey, key, label, type: colType(key), mandatory: false, physical, sort_order: order });
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

    const { file_url, name, person_id_col, preview, mapping } = body;
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
    const headers = rawRows.length ? Object.keys(rawRows[0]) : [];

    // Preview: return headers (+ auto-map hints) so the frontend can build the mapping UI.
    if (preview) {
      const hm = buildHeaderMap(headers);
      const suggestions: Record<string, string> = {};
      for (const h of headers) suggestions[h] = hm[norm(h)] || hm[h] || "";
      return json({ success: true, headers, suggestions, total });
    }

    const useMapping = mapping && typeof mapping === "object";
    const headerMap = useMapping ? {} : buildHeaderMap(headers);

    const mapped = rawRows.map((r, i) => {
      const row = useMapping ? rowFromMapping(r, mapping) : mapRow(r, headerMap);
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

    // Define/extend this table's columns (append new columns after existing ones).
    const { data: maxRow } = await supabase.from("ColumnDef").select("sort_order")
      .eq("table_key", scratchDatasetId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const startOrder = (Number(maxRow?.sort_order) || 0) + 10;
    const defs = useMapping
      ? columnDefsFromMapping(scratchDatasetId, mapping, startOrder)
      : columnDefsFromHeaders(scratchDatasetId, headers, headerMap, startOrder);
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
