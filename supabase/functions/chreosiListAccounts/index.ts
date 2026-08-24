// chreosiListAccounts — paginated/searchable list of chreosi operator accounts.
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

    const { search = "", page = 0, pageSize = 25, sortField = "username", sortDir = "asc" } = body;

    const allAccounts = await fetchAll(supabase, "ChreosiAccount");

    let filtered = allAccounts;
    if (search) {
      const q = normalizeUsername(search);
      const plain = String(search).toLowerCase();
      filtered = allAccounts.filter((a: any) => {
        const u = normalizeUsername(a.username);
        const d = normalizeUsername(a.display_name || "");
        const ph = (a.phone || "").toLowerCase();
        return u.includes(q) || d.includes(q) || ph.includes(plain);
      });
    }

    filtered.sort((a: any, b: any) => {
      let av = a[sortField] ?? "", bv = b[sortField] ?? "";
      if (typeof av === "boolean") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      const cmp = typeof av === "number" ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv), "el", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });

    const total = filtered.length;
    const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);

    // Available symbols computed live from Person.
    const persons = await fetchAll(supabase, "Person");
    const symbolSet = new Set<string>();
    for (const p of persons) if (p.prediction_symbol) symbolSet.add(p.prediction_symbol);

    return json({
      ok: true, rows, total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
      availableSymbols: [...symbolSet].sort(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
