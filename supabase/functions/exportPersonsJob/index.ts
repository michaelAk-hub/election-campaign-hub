// exportPersonsJob — build an XLSX of the (filtered) active-dataset rows and
// upload it to Supabase Storage, returning a public download URL. Runs
// synchronously; the modal polls the ExportJob and sees it done.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { filterAndSort } from "../_shared/personFilter.ts";
import { buildXlsx } from "../_shared/personIO.ts";

const BUCKET = "exports";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    if (body.job_id && body.resume_key === "internal_resume") {
      const { data: jobs } = await supabase.from("ExportJob").select("status, file_url").eq("id", body.job_id);
      return json({ success: true, status: jobs?.[0]?.status ?? "unknown", file_url: jobs?.[0]?.file_url });
    }

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Unauthorized" }, 401);

    const datasetId = body.datasetId;
    if (!datasetId) return json({ error: "datasetId is required" }, 400);

    const partition = String(body.partition ?? "all");
    const sortField = String(body.sortField ?? "created_date");
    const sortDirection = String(body.sortDirection ?? "desc");
    const search = String(body.search ?? "");
    let filters = body.filters;
    if (typeof filters === "string") { try { filters = JSON.parse(filters); } catch { filters = null; } }

    const { data: created } = await supabase.from("ExportJob").insert({
      status: "running", total: 0, processed: 0, dataset_id: datasetId,
      dataset_name: body.datasetName || "Export", message: "Έναρξη εξαγωγής...",
    }).select().single();
    const job = created!;

    try {
      const all = await fetchAll(supabase, "Person");
      const rows = filterAndSort(all, datasetId, partition, search, filters, sortField, sortDirection);

      const xlsx = buildXlsx(rows);
      const path = `${job.id}.xlsx`;

      // Private bucket + short-lived signed URL — the export holds voter PII and
      // must not be publicly downloadable. updateBucket flips an older public
      // bucket to private; createBucket covers the first-ever run.
      await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});
      await supabase.storage.updateBucket(BUCKET, { public: false }).catch(() => {});
      const up = await supabase.storage.from(BUCKET).upload(path, xlsx, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (up.error) throw new Error(up.error.message);
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600); // valid 1 hour
      if (signed.error) throw new Error(signed.error.message);
      const fileUrl = signed.data.signedUrl;

      await supabase.from("ExportJob").update({
        status: "done", total: rows.length, processed: rows.length, file_url: fileUrl,
        message: `Ολοκληρώθηκε! ${rows.length} εγγραφές εξήχθησαν.`,
      }).eq("id", job.id);

      return json({ success: true, job_id: job.id, done: true, file_url: fileUrl });
    } catch (e) {
      const msg = (e as Error).message;
      await supabase.from("ExportJob").update({ status: "error", error: msg, message: `Σφάλμα: ${msg}` }).eq("id", job.id);
      return json({ error: msg, job_id: job.id }, 500);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
