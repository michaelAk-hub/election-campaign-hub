// kanaliBResolve — mark the chosen candidate voted and close the Type B
// submission. Admin/organotiki only. Uses the same atomic guard as Type A
// (UPDATE ... WHERE voted=false) so it can't double-mark.
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

    const { submission_id, person_id } = body;
    if (!submission_id || !person_id) return json({ error: "submission_id and person_id required" }, 400);

    const { data: people } = await supabase.from("Person").select("*").eq("id", person_id);
    const person = people?.[0];
    if (!person) return json({ error: "Η εγγραφή δεν βρέθηκε" }, 404);

    let status: string;
    if (person.voted) {
      status = "ALREADY_VOTED";
    } else {
      const { data: updated } = await supabase.from("Person")
        .update({ voted: true, voted_at: new Date().toISOString(), row_version: (person.row_version || 1) + 1 })
        .eq("id", person_id).eq("voted", false).select();
      status = updated?.length ? "MARKED_VOTED" : "ALREADY_VOTED";
    }

    // Close the submission regardless — the operator's person has been identified.
    await supabase.from("KanaliBSubmission").update({
      status: "done", matched_person_id: person_id,
      resolved_by: auth.user.id, resolved_at: new Date().toISOString(),
    }).eq("id", submission_id);

    return json({ ok: true, status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
