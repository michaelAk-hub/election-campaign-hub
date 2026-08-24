// chreosiJobStatus — poll a chreosi account-creation job (or find an active one).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { jobId } = body;

    if (jobId) {
      const { data: job } = await supabase.from("ChreosiCreateJob").select("*").eq("id", jobId).maybeSingle();
      if (!job) return json({ found: false });
      const allResults = JSON.parse(job.results_json || "[]");
      const results = job.status === "done" ? allResults : allResults.filter((r: any) => r.action === "failed").slice(-20);
      return json({
        found: true, jobId: job.id, status: job.status, total: job.total, processed: job.processed,
        created: job.created_count, updated: job.updated_count, skipped: job.skipped_count, failed: job.failed_count,
        results, error: job.error,
      });
    }

    for (const status of ["running", "pending"]) {
      const { data: jobs } = await supabase.from("ChreosiCreateJob").select("*").eq("status", status);
      if (jobs?.length) {
        const job = jobs[0];
        return json({
          found: true, jobId: job.id, status: job.status, total: job.total, processed: job.processed,
          created: job.created_count, updated: job.updated_count, failed: job.failed_count,
        });
      }
    }
    return json({ found: false });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
