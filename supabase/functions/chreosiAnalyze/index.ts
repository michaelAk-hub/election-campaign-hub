// chreosiAnalyze — compare Person contacts vs chreosi accounts (new/existing/dupes).
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

    const persons = await fetchAll(supabase, "Person");
    const contactMap = new Map<string, string>();
    const symbolSet = new Set<string>();
    let skippedEmpty = 0;
    for (const p of persons) {
      for (const field of ["contact_person_1", "contact_person_2"]) {
        const raw = (p[field] || "").trim();
        if (!raw) { skippedEmpty++; continue; }
        const norm = normalizeUsername(raw);
        if (!contactMap.has(norm)) contactMap.set(norm, raw);
      }
      if (p.prediction_symbol) symbolSet.add(p.prediction_symbol);
    }

    const allAccounts = await fetchAll(supabase, "ChreosiAccount");
    const accountNormMap = new Map<string, any[]>();
    for (const acc of allAccounts) {
      const norm = normalizeUsername(acc.username);
      if (!accountNormMap.has(norm)) accountNormMap.set(norm, []);
      accountNormMap.get(norm)!.push(acc);
    }

    const duplicateGroups: any[] = [];
    for (const [norm, accs] of accountNormMap.entries()) {
      if (accs.length > 1) duplicateGroups.push({ normalizedKey: norm, accounts: accs });
    }

    const newAccounts: string[] = [];
    const existingAccounts: string[] = [];
    const accountsNeedingReview: any[] = [];
    for (const [norm] of contactMap.entries()) {
      const existing = accountNormMap.get(norm) || [];
      if (existing.length === 0) newAccounts.push(norm);
      else {
        const acc = existing[0];
        existingAccounts.push(norm);
        if (!acc.allowed_prediction_symbols?.length || !acc.allowed_voted_statuses?.length) {
          accountsNeedingReview.push({ username: acc.username, id: acc.id });
        }
      }
    }

    const extraAccounts: any[] = [];
    for (const [norm, accs] of accountNormMap.entries()) {
      if (!contactMap.has(norm)) {
        extraAccounts.push({ normalizedKey: norm, accounts: accs.map((a) => ({ id: a.id, username: a.username })) });
      }
    }

    return json({
      ok: true,
      totalPersons: persons.length,
      skippedEmptyNames: skippedEmpty,
      totalUniqueContacts: contactMap.size,
      existingAccountsCount: existingAccounts.length,
      newAccountsCount: newAccounts.length,
      totalAccountRows: allAccounts.length,
      duplicateGroups, extraAccounts, accountsNeedingReview,
      hasDuplicates: duplicateGroups.length > 0,
      availableSymbols: [...symbolSet].sort(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
