// chreosiStartCreateJob — build the contact list and queue an account-creation job.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { normalizeUsername } from "../_shared/portal.ts";

function randomPassword(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { allowed_prediction_symbols = [], allowed_voted_statuses = [] } = body;

    // Resume an existing running/pending job if present.
    for (const status of ["running", "pending"]) {
      const { data: jobs } = await supabase.from("ChreosiCreateJob").select("*").eq("status", status);
      if (jobs?.length) {
        const job = jobs[0];
        return json({ ok: true, jobId: job.id, resumed: true, status: job.status, processed: job.processed, total: job.total });
      }
    }

    // Unique contacts from Person.
    const persons = await fetchAll(supabase, "Person");
    const contactMap = new Map<string, string>();
    for (const p of persons) {
      for (const field of ["contact_person_1", "contact_person_2"]) {
        const raw = (p[field] || "").trim();
        if (!raw) continue;
        const norm = normalizeUsername(raw);
        if (!contactMap.has(norm)) contactMap.set(norm, raw);
      }
    }

    // Existing accounts — block if duplicates exist.
    const allAccounts = await fetchAll(supabase, "ChreosiAccount");
    const accountNormMap = new Map<string, any[]>();
    for (const acc of allAccounts) {
      const norm = normalizeUsername(acc.username);
      if (!accountNormMap.has(norm)) accountNormMap.set(norm, []);
      accountNormMap.get(norm)!.push(acc);
    }
    const duplicates = [...accountNormMap.values()].filter((g) => g.length > 1);
    if (duplicates.length > 0) {
      return json({ ok: false, error: "Υπάρχουν διπλές εγγραφές. Πρέπει πρώτα να λυθούν πριν συνεχίσετε.", duplicateCount: duplicates.length }, 422);
    }

    const contacts: any[] = [];
    for (const [norm, originalName] of contactMap.entries()) {
      const existingList = accountNormMap.get(norm) || [];
      contacts.push({
        norm, original: originalName,
        existingId: existingList[0]?.id || null,
        existingUsername: existingList[0]?.username || null,
        password: existingList.length === 0 ? randomPassword() : null,
      });
    }

    const settings = { allowed_prediction_symbols, allowed_voted_statuses };
    const { data: job } = await supabase.from("ChreosiCreateJob").insert({
      status: "pending", total: contacts.length, processed: 0,
      created_count: 0, updated_count: 0, skipped_count: 0, failed_count: 0,
      contacts_json: JSON.stringify(contacts), results_json: JSON.stringify([]),
      settings_json: JSON.stringify(settings), started_by: auth.user.id,
    }).select().single();

    return json({ ok: true, jobId: job!.id, resumed: false, total: contacts.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
