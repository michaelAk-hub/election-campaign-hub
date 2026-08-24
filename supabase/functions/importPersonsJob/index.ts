// importPersonsJob — parse an uploaded CSV/XLSX and insert Person rows.
// The file arrives as a data: URL in file_url (the frontend shim encodes it),
// so no file storage is needed. Postgres bulk-inserts, so the whole import runs
// synchronously and the ImportJob is marked done before the modal first polls.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { parseFile, buildHeaderMap, mapRow } from "../_shared/personIO.ts";

const INSERT_BATCH = 500;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    // Resume calls from the modal's watchdog: report current job state.
    if (body.job_id && body.resume_key === "internal_resume") {
      const { data: jobs } = await supabase.from("ImportJob").select("status").eq("id", body.job_id);
      return json({ success: true, status: jobs?.[0]?.status ?? "unknown" });
    }

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Unauthorized" }, 401);

    const { file_url, dataset_name, person_id_col } = body;
    if (!file_url) return json({ error: "file_url is required" }, 400);

    // Parse the file.
    let rawRows: Record<string, any>[];
    try {
      rawRows = await parseFile(file_url);
    } catch (e) {
      return json({ error: `File parse error: ${(e as Error).message}` }, 400);
    }
    const total = rawRows.length;
    const name = dataset_name || `Import ${new Date().toISOString().split("T")[0]}`;

    // Map + assign person_id.
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

    // Create the dataset (pending) and the job.
    const { data: dataset } = await supabase.from("Dataset").insert({
      name, status: "pending", total_records: total,
    }).select().single();

    const { data: createdJob } = await supabase.from("ImportJob").insert({
      status: "running", total, processed: 0, dataset_id: dataset!.id, dataset_name: name,
      message: `Έναρξη εισαγωγής ${total} εγγραφών...`, failed_rows: [],
    }).select().single();
    const job = createdJob!;

    try {
      const failed: string[] = [];
      let processed = 0;
      for (let i = 0; i < valid.length; i += INSERT_BATCH) {
        const chunk = valid.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, dataset_id: dataset!.id }));
        const { error } = await supabase.from("Person").insert(chunk);
        if (error) {
          // Fall back to per-row inserts so one bad row doesn't fail the batch.
          for (const row of chunk) {
            const { error: e2 } = await supabase.from("Person").insert(row);
            if (e2) failed.push(String(row.person_id));
            else processed++;
          }
        } else {
          processed += chunk.length;
        }
        await supabase.from("ImportJob").update({
          processed, failed_rows: failed, message: `Αποθήκευση εγγραφών ${processed}/${valid.length}...`,
        }).eq("id", job.id);
      }

      // Activate the new dataset (archive others).
      const { data: actives } = await supabase.from("Dataset").select("id").eq("status", "active");
      for (const ds of actives ?? []) {
        if (ds.id !== dataset!.id) await supabase.from("Dataset").update({ status: "archived" }).eq("id", ds.id);
      }
      await supabase.from("Dataset").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", dataset!.id);

      await supabase.from("ImportJob").update({
        status: "done", processed,
        message: `Ολοκληρώθηκε! Εισήχθησαν ${processed - failed.length} εγγραφές.`,
        failed_rows: failed,
      }).eq("id", job.id);

      // TODO(prediction stats): rebuild once predictions are ported.
      return json({ success: true, job_id: job.id, dataset_id: dataset!.id, done: true });
    } catch (e) {
      const msg = (e as Error).message;
      await supabase.from("ImportJob").update({ status: "error", error: msg, message: `Σφάλμα: ${msg}` }).eq("id", job.id);
      return json({ error: msg, job_id: job.id }, 500);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
