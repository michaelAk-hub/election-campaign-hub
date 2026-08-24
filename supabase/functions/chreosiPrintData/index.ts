// chreosiPrintData — Person rows assigned to the given chreosi accounts, for printing.
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

    const { accountIds = [] } = body;
    if (!accountIds.length) return json({ ok: true, people: [] });

    const accounts: any[] = [];
    for (const id of accountIds) {
      const { data: acc } = await supabase.from("ChreosiAccount").select("*").eq("id", id).maybeSingle();
      if (acc) accounts.push(acc);
    }

    const usernameSet = new Set(accounts.map((a) => normalizeUsername(a.username)));
    const persons = await fetchAll(supabase, "Person");
    const people = persons.filter((p) =>
      usernameSet.has(normalizeUsername(p.contact_person_1)) || usernameSet.has(normalizeUsername(p.contact_person_2))
    );

    return json({ ok: true, people, accounts });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
