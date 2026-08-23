// submitKanaliVote — a Kanali operator records a voter as voted by their ΑΤ (monadikos_kanali).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { submittedId, username, sessionToken } = await req.json();
    if (!submittedId || !username || !sessionToken) {
      return json({ error: "Missing required fields" }, 400);
    }
    const normalizedId = String(submittedId).trim();

    // Validate the Kanali portal session
    const { data: sessions } = await supabase.from("PortalSession").select("*")
      .eq("session_token", sessionToken).eq("username", username)
      .eq("portal_type", "kanali").eq("is_active", true);
    if (!sessions?.length) return json({ error: "Invalid or expired session" }, 401);
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      await supabase.from("PortalSession").update({ is_active: false }).eq("id", session.id);
      return json({ error: "Session expired" }, 401);
    }

    // Look up the voter by monadikos_kanali
    const { data: people } = await supabase.from("Person").select("*").eq("monadikos_kanali", normalizedId);

    let status: string;
    let reason: string;
    let personRecordId: string | null = null;

    if (!people?.length) {
      status = "NOT_FOUND";
      reason = "Δεν βρέθηκε εγγραφή με αυτό το ID";
      await supabase.from("NotFoundVoter").insert({
        submitted_id: normalizedId, reason_text: reason, kanali_username: username,
      });
    } else if (people[0].voted) {
      status = "ALREADY_VOTED";
      reason = "Ήδη ήταν Ψήφισε = ΝΑΙ";
      personRecordId = people[0].id;
    } else {
      const person = people[0];
      personRecordId = person.id;
      // Atomic mark: only succeeds if still not voted (Postgres UPDATE ... WHERE voted=false).
      const { data: updated } = await supabase.from("Person")
        .update({ voted: true, voted_at: new Date().toISOString(), row_version: (person.row_version || 1) + 1 })
        .eq("id", person.id).eq("voted", false).select();
      if (updated?.length) {
        status = "MARKED_VOTED";
        reason = "Η ψήφος καταχωρήθηκε επιτυχώς";
      } else {
        status = "ALREADY_VOTED";
        reason = "Ήδη ήταν Ψήφισε = ΝΑΙ";
      }
    }

    await supabase.from("KanaliSubmission").insert({
      kanali_username: username, submitted_id: normalizedId, status,
      reason_text: reason, person_record_id: personRecordId,
    });

    // TODO(prediction stats): trigger a rebuild once rebuildPredictionStats is ported.
    return json({ status, reason });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
