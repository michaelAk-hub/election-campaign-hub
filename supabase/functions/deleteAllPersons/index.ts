// deleteAllPersons — wipe every Person and Dataset row. ADMIN only.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    if (body.job_id && body.resume_key === "internal_resume") {
      const { data: jobs } = await supabase.from("DeleteJob").select("*").eq("id", body.job_id);
      const job = jobs?.[0];
      if (!job) return json({ success: false, error: "Job not found" }, 404);
      return json({ success: true, job_id: job.id, status: job.status });
    }

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ success: false, error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ success: false, error: "Unauthorized" }, 401);

    const { count } = await supabase.from("Person").select("*", { count: "exact", head: true });
    const total = count ?? 0;

    const { data: created } = await supabase.from("DeleteJob").insert({
      job_type: "delete_all_persons", status: "running", total, deleted: 0,
      message: `Διαγραφή εγγραφών (0/${total})...`,
    }).select().single();
    const job = created!;

    try {
      // PostgREST requires a filter on delete; `id is not null` matches all rows.
      const delP = await supabase.from("Person").delete().not("id", "is", null);
      if (delP.error) throw new Error(delP.error.message);
      const delD = await supabase.from("Dataset").delete().not("id", "is", null);
      if (delD.error) throw new Error(delD.error.message);

      await supabase.from("DeleteJob").update({
        status: "done", deleted: total,
        message: `Ολοκληρώθηκε! Διαγράφηκαν όλες οι εγγραφές και τα datasets.`,
      }).eq("id", job.id);
      // Prediction stats are computed live from Person rows — no cache rebuild needed.
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
