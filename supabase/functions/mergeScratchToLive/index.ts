// mergeScratchToLive — merge ONE scratch table into the live roll.
// The scratch table is NOT consumed (it keeps existing as its own copy).
//
// Body:
//   scratch_dataset_id
//   target: { mode: 'new'|'append', name?, activate? }
//   mapping: { scratchColKey -> liveKey | '__new__' | '__skip__' }
//   conflict: { primary: 'live'|'scratch' }   (fill rule for existing person_ids)
//
// Conflict rule (per already-existing person_id): keep the PRIMARY row's values;
// for any field empty in the primary, fill from the SECONDARY if it has a value;
// if both empty, stays empty. New person_ids are inserted.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { KNOWN_FIELDS } from "../_shared/personIO.ts";

const INSERT_BATCH = 500;
const sanitize = (h: string) => String(h).trim().replace(/[^\w]/g, "_");
const isBlank = (v: any) => v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
const isPhysical = (key: string) => KNOWN_FIELDS.has(key);

const readField = (row: any, key: string) => (isPhysical(key) ? row?.[key] : row?.custom_data?.[key]);
function writeField(row: any, key: string, value: any) {
  if (isPhysical(key)) row[key] = value;
  else { row.custom_data = row.custom_data || {}; row.custom_data[key] = value; }
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

    const scratchDatasetId = String(body.scratch_dataset_id ?? "").trim();
    if (!scratchDatasetId) return json({ error: "scratch_dataset_id is required" }, 400);
    const target = body.target || {};
    const mapping: Record<string, string> = body.mapping || {};
    const primary = (body.conflict?.primary === "scratch") ? "scratch" : "live";

    // Resolve the target dataset.
    let targetDatasetId: string;
    if (target.mode === "append") {
      const { data: actives } = await supabase.from("Dataset").select("id").eq("status", "active");
      if (!actives?.length) return json({ error: "Δεν υπάρχει ενεργός ζωντανός πίνακας για προσθήκη" }, 400);
      targetDatasetId = actives[0].id;
    } else {
      const name = target.name || `Merge ${new Date().toISOString().split("T")[0]}`;
      const { data: ds, error } = await supabase.from("Dataset")
        .insert({ name, status: "pending", total_records: 0 }).select().single();
      if (error) return json({ error: error.message }, 500);
      targetDatasetId = ds!.id;
    }

    // Create live ColumnDef rows for any '__new__' mapping targets.
    const { data: maxRow } = await supabase.from("ColumnDef").select("sort_order")
      .eq("table_key", "live").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    let order = (Number(maxRow?.sort_order) || 0) + 10;
    const newDefs: any[] = [];
    for (const [scol, tgt] of Object.entries(mapping)) {
      if (tgt === "__new__") {
        const key = sanitize(scol);
        newDefs.push({ table_key: "live", key, label: scol, type: "text", mandatory: false, physical: false, sort_order: order });
        order += 10;
      }
    }
    if (newDefs.length) {
      await supabase.from("ColumnDef").upsert(newDefs, { onConflict: "table_key,key", ignoreDuplicates: true });
    }

    // Transform a scratch row into a live-shaped row using the mapping.
    const transform = (srow: any): any => {
      const live: any = { custom_data: {} };
      for (const [scol, tgt] of Object.entries(mapping)) {
        if (!tgt || tgt === "__skip__") continue;
        const liveKey = tgt === "__new__" ? sanitize(scol) : tgt;
        writeField(live, liveKey, readField(srow, scol));
      }
      if (isBlank(live.person_id)) live.person_id = srow.person_id;
      if (live.custom_data && Object.keys(live.custom_data).length === 0) delete live.custom_data;
      return live;
    };

    // Load scratch rows and the target's existing rows (indexed by person_id).
    const scratchRows = (await fetchAll(supabase, "PersonScratch")).filter((r) => r.scratch_dataset_id === scratchDatasetId);
    const existing = (await fetchAll(supabase, "Person")).filter((r) => r.dataset_id === targetDatasetId);
    const byPid = new Map<string, any>();
    for (const r of existing) byPid.set(String(r.person_id), r);

    let inserted = 0, mergedCount = 0;
    const toInsert: any[] = [];

    for (const srow of scratchRows) {
      const live = transform(srow);
      const pid = String(live.person_id ?? "");
      if (isBlank(pid)) continue;
      const hit = byPid.get(pid);

      if (!hit) {
        toInsert.push({ ...live, dataset_id: targetDatasetId });
        byPid.set(pid, { ...live, __pending: true }); // avoid dup inserts within this run
        continue;
      }
      if (hit.__pending) continue; // already queued as a fresh insert

      // Conflict: keep primary, fill empties from secondary.
      const prim = primary === "scratch" ? live : hit;
      const sec = primary === "scratch" ? hit : live;
      const result: any = { ...prim, custom_data: { ...(prim.custom_data || {}) } };
      const keys = new Set<string>([...KNOWN_FIELDS, ...Object.keys(prim.custom_data || {}), ...Object.keys(sec.custom_data || {})]);
      for (const k of keys) {
        if (k === "custom_data" || k === "id" || k === "dataset_id" || k === "row_version") continue;
        if (isBlank(readField(result, k)) && !isBlank(readField(sec, k))) writeField(result, k, readField(sec, k));
      }
      const patch: any = {
        custom_data: result.custom_data,
        row_version: Number(hit.row_version || 1) + 1,
      };
      for (const k of KNOWN_FIELDS) {
        if (k === "custom_data" || k === "row_version") continue;
        if (result[k] !== undefined) patch[k] = result[k];
      }
      await supabase.from("Person").update(patch).eq("id", hit.id);
      mergedCount++;
    }

    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
      const chunk = toInsert.slice(i, i + INSERT_BATCH);
      const { error } = await supabase.from("Person").insert(chunk);
      if (!error) inserted += chunk.length;
    }

    // Optionally activate a newly-created dataset.
    if (target.mode !== "append" && target.activate) {
      const { data: actives } = await supabase.from("Dataset").select("id").eq("status", "active");
      for (const ds of actives ?? []) {
        if (ds.id !== targetDatasetId) await supabase.from("Dataset").update({ status: "archived" }).eq("id", ds.id);
      }
      await supabase.from("Dataset").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", targetDatasetId);
    }

    // Keep the target dataset's count in sync.
    const { count } = await supabase.from("Person").select("*", { count: "exact", head: true }).eq("dataset_id", targetDatasetId);
    await supabase.from("Dataset").update({ total_records: count ?? 0 }).eq("id", targetDatasetId);

    return json({ success: true, target_dataset_id: targetDatasetId, inserted, merged: mergedCount, scratch_rows: scratchRows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
