// chreosiPortalActions — note/checkmark edits and self-deactivation for portal operators.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { normalizeUsername, validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { action, session_token } = body;

    const auth = await validatePortalSession(supabase, session_token);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const session = auth.session;
    const portalType = session.portal_type;
    const canonicalUsername = session.username;
    const normUser = normalizeUsername(canonicalUsername);

    // ── Save personal note (Chreosi) ──
    if (action === "save_personal_note") {
      if (portalType !== "chreosi") return json({ error: "Not a chreosi session" }, 403);
      const accounts = await fetchAll(supabase, "ChreosiAccount");
      const account = accounts.find((a: any) => normalizeUsername(a.username) === normUser);
      if (!account) return json({ error: "Account not found" }, 404);
      await supabase.from("ChreosiAccount").update({ personal_note: body.note ?? "" }).eq("id", account.id);
      return json({ ok: true });
    }

    // ── Update a person's notes (only if assigned to this operator) ──
    if (action === "update_person_note") {
      if (portalType !== "chreosi") return json({ error: "Not a chreosi session" }, 403);
      const { person_id, notes } = body;
      if (!person_id) return json({ error: "person_id required" }, 400);
      const { data: person } = await supabase.from("Person").select("*").eq("id", person_id).maybeSingle();
      if (!person) return json({ error: "Person not found" }, 404);
      const cp1 = normalizeUsername(person.contact_person_1 || "");
      const cp2 = normalizeUsername(person.contact_person_2 || "");
      if (cp1 !== normUser && cp2 !== normUser) return json({ error: "Access denied: person not assigned to you" }, 403);
      await supabase.from("Person").update({ notes: notes ?? "" }).eq("id", person_id);
      return json({ ok: true });
    }

    // ── Toggle a checkmark ──
    if (action === "toggle_checkmark") {
      if (portalType !== "chreosi") return json({ error: "Not a chreosi session" }, 403);
      const { person_id, checked } = body;
      if (!person_id) return json({ error: "person_id required" }, 400);
      const { data: existing } = await supabase.from("ChreosiCheckmark").select("*")
        .eq("chreosi_username", canonicalUsername).eq("person_record_id", person_id);
      if (existing?.length) {
        await supabase.from("ChreosiCheckmark").update({ checked: !!checked }).eq("id", existing[0].id);
      } else {
        const { data: forPerson } = await supabase.from("ChreosiCheckmark").select("*").eq("person_record_id", person_id);
        const match = (forPerson ?? []).find((c: any) => normalizeUsername(c.chreosi_username) === normUser);
        if (match) {
          await supabase.from("ChreosiCheckmark").update({ checked: !!checked }).eq("id", match.id);
        } else {
          await supabase.from("ChreosiCheckmark").insert({
            chreosi_username: canonicalUsername, person_record_id: person_id, checked: !!checked,
          });
        }
      }
      return json({ ok: true });
    }

    // ── Deactivate own account + invalidate sessions ──
    if (action === "deactivate_self") {
      const table = portalType === "chreosi" ? "ChreosiAccount" : portalType === "kanali" ? "KanaliAccount" : null;
      if (table) {
        const accounts = await fetchAll(supabase, table);
        const account = accounts.find((a: any) => normalizeUsername(a.username) === normUser);
        if (account) await supabase.from(table).update({ is_active: false }).eq("id", account.id);
      }
      await supabase.from("PortalSession").update({ is_active: false }).eq("id", session.id);
      const allSessions = await fetchAll(supabase, "PortalSession");
      for (const s of allSessions) {
        if (s.is_active && s.portal_type === portalType && s.id !== session.id
          && normalizeUsername(s.username) === normUser) {
          await supabase.from("PortalSession").update({ is_active: false }).eq("id", s.id);
        }
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
