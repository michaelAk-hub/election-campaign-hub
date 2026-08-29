// chreosiContinueCreateJob — process the queued account-creation job.
// No per-row rate limit on Postgres, so this normally finishes in one call;
// a time budget keeps it resumable if the contact list is very large.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

const BATCH_SIZE = 100;
const MAX_RUNTIME_MS = 25000;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { jobId } = body;
    if (!jobId) return json({ error: "Missing jobId" }, 400);

    const { data: jobRow } = await supabase.from("ChreosiCreateJob").select("*").eq("id", jobId).maybeSingle();
    if (!jobRow) return json({ error: "Job not found" }, 404);
    if (jobRow.status === "done" || jobRow.status === "error") return json({ ok: true, done: true, status: jobRow.status });
    if (jobRow.status !== "running") await supabase.from("ChreosiCreateJob").update({ status: "running" }).eq("id", jobId);

    const contacts = JSON.parse(jobRow.contacts_json || "[]");
    const results = JSON.parse(jobRow.results_json || "[]");
    const settings = JSON.parse(jobRow.settings_json || "{}");
    const { allowed_prediction_symbols = [], allowed_voted_statuses = [], visible_fields = [] } = settings;

    let processed = jobRow.processed || 0;
    let created = jobRow.created_count || 0;
    let updated = jobRow.updated_count || 0;
    const skipped = jobRow.skipped_count || 0;
    let failed = jobRow.failed_count || 0;

    const startTime = Date.now();
    const AC = () => supabase.from("ChreosiAccount");

    const persistProgress = async (done: boolean) =>
      supabase.from("ChreosiCreateJob").update({
        status: done ? "done" : "running", processed,
        created_count: created, updated_count: updated, skipped_count: skipped, failed_count: failed,
        results_json: JSON.stringify(results),
      }).eq("id", jobId);

    while (processed < contacts.length) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const batch = contacts.slice(processed, processed + BATCH_SIZE);
      if (batch.length === 0) break;

      for (const contact of batch) {
        try {
          if (contact.existingId) {
            const { data: existingAcc } = await AC().select("plain_password").eq("id", contact.existingId).maybeSingle();
            await AC().update({ allowed_prediction_symbols, allowed_voted_statuses, visible_fields }).eq("id", contact.existingId);
            results.push({
              username: contact.existingUsername || contact.original, display_name: contact.original,
              plain_password: existingAcc?.plain_password || "", action: "updated",
              symbols: allowed_prediction_symbols.join(", "), voted_statuses: allowed_voted_statuses.join(", "), error: "",
            });
            updated++;
          } else {
            const pw = contact.password || "changeme";
            await AC().insert({
              username: contact.original, display_name: contact.original,
              password_hash: pw, plain_password: pw, is_active: true,
              allowed_prediction_symbols, allowed_voted_statuses, visible_fields, personal_note: "",
            });
            results.push({
              username: contact.original, display_name: contact.original, plain_password: pw, action: "created",
              symbols: allowed_prediction_symbols.join(", "), voted_statuses: allowed_voted_statuses.join(", "), error: "",
            });
            created++;
          }
        } catch (err) {
          results.push({
            username: contact.original, display_name: contact.original, plain_password: "", action: "failed",
            symbols: "", voted_statuses: "", error: (err as Error).message,
          });
          failed++;
        }
        processed++;
      }
      await persistProgress(processed >= contacts.length);
    }

    const done = processed >= contacts.length;
    await persistProgress(done);
    return json({
      ok: true, done, status: done ? "done" : "running",
      processed, total: contacts.length, created, updated, skipped, failed,
      results: done ? results : results.slice(-20),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
