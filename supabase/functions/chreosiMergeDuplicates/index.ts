// chreosiMergeDuplicates — merge duplicate chreosi accounts into one keeper:
// union settings, reassign Person contacts, invalidate portal sessions, delete dupes.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { normalizeUsername } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { keeperId, mergeIds = [] } = body;
    if (!keeperId || !mergeIds.length) return json({ error: "keeperId and mergeIds required" }, 400);

    const { data: keeper } = await supabase.from("ChreosiAccount").select("*").eq("id", keeperId).maybeSingle();
    if (!keeper) return json({ error: "Keeper account not found" }, 404);

    const mergeAccounts: any[] = [];
    for (const mid of mergeIds) {
      const { data: acc } = await supabase.from("ChreosiAccount").select("*").eq("id", mid).maybeSingle();
      if (acc) mergeAccounts.push(acc);
    }

    const allAccounts = [keeper, ...mergeAccounts];
    const mergedPhone = keeper.phone || mergeAccounts.map((a) => a.phone).find((p) => p) || "";
    const mergedIsActive = allAccounts.some((a) => a.is_active);
    const symbolUnion = [...new Set(allAccounts.flatMap((a) => a.allowed_prediction_symbols || []))];
    const votedUnion = [...new Set(allAccounts.flatMap((a) => a.allowed_voted_statuses || []))];
    const mergedNote = allAccounts.map((a) => a.personal_note).filter(Boolean).join("\nΕποπροσθετες σημείωσης\n");

    await supabase.from("ChreosiAccount").update({
      phone: mergedPhone, is_active: mergedIsActive,
      allowed_prediction_symbols: symbolUnion, allowed_voted_statuses: votedUnion, personal_note: mergedNote,
    }).eq("id", keeperId);

    // Reassign Person contacts pointing at merged-away usernames → keeper.username.
    const mergedUsernames = new Set(mergeAccounts.map((a) => normalizeUsername(a.username)));
    const persons = await fetchAll(supabase, "Person");
    const personUpdateErrors: any[] = [];
    for (const person of persons) {
      const updates: any = {};
      if (person.contact_person_1 && mergedUsernames.has(normalizeUsername(person.contact_person_1))) updates.contact_person_1 = keeper.username;
      if (person.contact_person_2 && mergedUsernames.has(normalizeUsername(person.contact_person_2))) updates.contact_person_2 = keeper.username;
      if (Object.keys(updates).length) {
        const { error } = await supabase.from("Person").update(updates).eq("id", person.id);
        if (error) personUpdateErrors.push({ personId: person.id, error: error.message });
      }
    }

    // Invalidate active chreosi portal sessions for merged-away usernames.
    const { data: sessions } = await supabase.from("PortalSession").select("id, username").eq("portal_type", "chreosi").eq("is_active", true);
    for (const s of sessions ?? []) {
      if (mergedUsernames.has(normalizeUsername(s.username))) {
        await supabase.from("PortalSession").update({ is_active: false }).eq("id", s.id);
      }
    }

    // Delete merged-away accounts.
    if (mergeAccounts.length) await supabase.from("ChreosiAccount").delete().in("id", mergeAccounts.map((a) => a.id));

    return json({ ok: true, keeperId, mergedCount: mergeAccounts.length, personUpdateErrors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
