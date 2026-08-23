// chreosiPortalPeople — the assigned, permission-filtered voter list for a Chreosi operator.
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
    const { session_token, username, search = "", dept_filter = "all", year_filter = "all", voted_tab = "all" } = body;

    const auth = await validatePortalSession(supabase, session_token, { username, portalType: "chreosi" });
    if (auth.error) return json({ error: auth.error }, auth.status);

    const normalizedUsername = normalizeUsername(username);

    const accounts = await fetchAll(supabase, "ChreosiAccount");
    const account = accounts.find((a: any) => normalizeUsername(a.username) === normalizedUsername) || null;
    if (!account) return json({ error: "Account not found" }, 404);

    const allowedSymbols = account.allowed_prediction_symbols || [];
    const allowedVotedStatuses = account.allowed_voted_statuses || [];
    if (!allowedSymbols.length || !allowedVotedStatuses.length) {
      return json({ ok: true, people: [], account, totalCount: 0, availableDepts: [], availableYears: [], checkmarks: [] });
    }

    const persons = await fetchAll(supabase, "Person");
    const result: any[] = [];
    for (const p of persons) {
      const cp1 = normalizeUsername(p.contact_person_1 || "");
      const cp2 = normalizeUsername(p.contact_person_2 || "");
      if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) continue;
      if (!allowedSymbols.includes(p.prediction_symbol)) continue;
      const votedStr = p.voted === true ? "true" : "false";
      if (!allowedVotedStatuses.includes(votedStr)) continue;
      if (voted_tab === "voted" && !p.voted) continue;
      if (voted_tab === "not_voted" && p.voted) continue;
      if (dept_filter !== "all" && p.department !== dept_filter) continue;
      if (year_filter !== "all" && p.admission_year !== year_filter) continue;
      if (search) {
        const q = String(search).toLowerCase();
        const matches = (p.first_name || "").toLowerCase().includes(q)
          || (p.last_name || "").toLowerCase().includes(q)
          || (p.mobile_phone || "").includes(search);
        if (!matches) continue;
      }
      result.push(p);
    }

    const depts = [...new Set(result.map((p) => p.department).filter(Boolean))].sort();
    const years = [...new Set(result.map((p) => p.admission_year).filter(Boolean))].sort();

    let { data: checkmarks } = await supabase.from("ChreosiCheckmark").select("*").eq("chreosi_username", normalizedUsername);
    if (!checkmarks?.length) {
      const all = await fetchAll(supabase, "ChreosiCheckmark");
      checkmarks = all.filter((c: any) => normalizeUsername(c.chreosi_username) === normalizedUsername);
    }

    return json({ ok: true, people: result, totalCount: result.length, account, availableDepts: depts, availableYears: years, checkmarks });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
