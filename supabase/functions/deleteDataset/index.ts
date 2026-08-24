// deleteDataset — delete all Person rows of a dataset, then the dataset itself.
// Postgres does the bulk delete in one statement, so the job completes
// synchronously; the progress modal polls the DeleteJob and sees it done.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    // Internal resume calls from the modal's watchdog: just report current state.
    if (body.job_id && body.resume_key === "internal_resume") {
      const { data: jobs } = await supabase.from("DeleteJob").select("*").eq("id", body.job_id);
      const job = jobs?.[0];
      if (!job) return json({ success: false, error: "Job not found" }, 404);
      return json({ success: true, job_id: job.id, status: job.status });
    }

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ success: false, error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const datasetId = body.dataset_id;
    if (!datasetId) return json({ success: false, error: "dataset_id is required" }, 400);

    const { count } = await supabase.from("Person").select("*", { count: "exact", head: true }).eq("dataset_id", datasetId);
    const total = count ?? 0;

    const { data: created } = await supabase.from("DeleteJob").insert({
      job_type: "delete_dataset", status: "running", total, deleted: 0,
      dataset_id: datasetId, message: `Διαγραφή εγγραφών dataset (0/${total})...`,
    }).select().single();
    const job = created!;

    try {
      const del = await supabase.from("Person").delete().eq("dataset_id", datasetId);
      if (del.error) throw new Error(del.error.message);
      await supabase.from("Dataset").delete().eq("id", datasetId);

      await supabase.from("DeleteJob").update({
        status: "done", deleted: total,
        message: `Ολοκληρώθηκε! Διαγράφηκαν ${total} εγγραφές και το dataset αφαιρέθηκε.`,
      }).eq("id", job.id);
      // TODO(prediction stats): rebuild once predictions are ported.
      return json({ success: true, job_id: job.id, done: true, deleted: total });
    } catch (e) {
      const msg = (e as Error).message;
      await supabase.from("DeleteJob").update({ status: "error", error: msg, message: `Σφάλμα: ${msg}` }).eq("id", job.id);
      return json({ success: false, job_id: job.id, error: msg }, 500);
    }
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
