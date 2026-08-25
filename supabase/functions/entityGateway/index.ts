// entityGateway — generic admin-authed CRUD over whitelisted tables.
// Restores the Base44 `base44.entities.<Entity>.<op>(...)` surface the admin app
// still uses directly (list/filter/get/create/update/delete/bulkCreate), running
// server-side with the service key. Portal/logged-out contexts never reach here —
// the frontend shim only calls this when an admin session token is present.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

// Only these tables are reachable through the gateway.
const ALLOWED = new Set([
  "Dataset", "Person", "ChreosiAccount", "KanaliAccount", "AppUser",
  "SmsLog", "SmsPhoneGroup", "SavedQuery", "PushMessage", "PushMessageAck",
  "NotificationPreference", "Notification", "NotFoundVoter", "KanaliSubmission",
  "ImportJob", "ExportJob", "DeleteJob", "ChreosiCheckmark", "UserActivationLog",
  "PredictionScenario", "PredictionVoteFlowConfig",
]);

// Base44 sort string: "-field" = desc, "field" = asc.
function parseSort(sort: unknown): { col: string; asc: boolean } | null {
  if (typeof sort !== "string" || !sort) return null;
  return sort.startsWith("-") ? { col: sort.slice(1), asc: false } : { col: sort, asc: true };
}

// Apply a Base44-style query object ({field: value} or {field: {$in|$ne|...}}).
function applyFilter(q: any, query: any): any {
  for (const [k, v] of Object.entries(query || {})) {
    if (Array.isArray(v)) {
      q = q.in(k, v);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, any>;
      if ("$in" in o) q = q.in(k, o.$in);
      else if ("$ne" in o) q = q.neq(k, o.$ne);
      else if ("$gt" in o) q = q.gt(k, o.$gt);
      else if ("$gte" in o) q = q.gte(k, o.$gte);
      else if ("$lt" in o) q = q.lt(k, o.$lt);
      else if ("$lte" in o) q = q.lte(k, o.$lte);
      else if ("$exists" in o) q = o.$exists ? q.not(k, "is", null) : q.is(k, null);
      else q = q.eq(k, v);
    } else {
      q = q.eq(k, v);
    }
  }
  return q;
}

// Read rows with optional filter/sort/limit/skip, paging past the 1000-row cap
// when no explicit limit is given (small tables → returning everything is fine).
async function readRows(
  supabase: any, entity: string, query: any,
  sort: unknown, limit: unknown, skip: unknown,
): Promise<any[]> {
  const s = parseSort(sort);
  // NOTE: the frontend shim serializes an omitted arg as JSON null, and
  // Number(null) === 0 — so treat null/undefined/0/negative as "no limit"
  // (page through everything) rather than a literal limit of 0 (one row).
  const nLim = Number(limit);
  const lim = (limit === null || limit === undefined || !Number.isFinite(nLim) || nLim <= 0) ? null : nLim;
  const nOff = Number(skip);
  const off = (skip === null || skip === undefined || !Number.isFinite(nOff) || nOff < 0) ? 0 : nOff;

  const build = () => {
    let q = supabase.from(entity).select("*");
    q = applyFilter(q, query);
    if (s) q = q.order(s.col, { ascending: s.asc });
    return q;
  };

  // PostgREST caps each response at ~1000 rows, so page in 1000-row chunks —
  // both for an explicit limit above 1000 and for the no-limit ("get all") case.
  const out: any[] = [];
  let from = off;
  const size = 1000;
  while (lim == null || out.length < lim) {
    const want = lim == null ? size : Math.min(size, lim - out.length);
    const { data, error } = await build().range(from, from + want - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < want) break; // ran out of rows
    from += data.length;
  }
  return out;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) {
      return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    }

    const entity = String(body.entity ?? "");
    const op = String(body.op ?? "");
    const args: any[] = Array.isArray(body.args) ? body.args : [];
    if (!ALLOWED.has(entity)) return json({ error: `Entity not allowed: ${entity}` }, 400);

    switch (op) {
      case "list": {
        // args: [sort, limit, skip]
        const result = await readRows(supabase, entity, null, args[0], args[1], args[2]);
        return json({ result });
      }
      case "filter": {
        // args: [query, sort, limit, skip]
        const result = await readRows(supabase, entity, args[0] ?? {}, args[1], args[2], args[3]);
        return json({ result });
      }
      case "get": {
        const id = args[0];
        if (id == null) return json({ error: "get requires an id" }, 400);
        const { data, error } = await supabase.from(entity).select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(error.message);
        return json({ result: data ?? null });
      }
      case "create": {
        const { data, error } = await supabase.from(entity).insert(args[0] ?? {}).select().maybeSingle();
        if (error) throw new Error(error.message);
        return json({ result: data });
      }
      case "bulkCreate": {
        const rows = Array.isArray(args[0]) ? args[0] : [];
        if (!rows.length) return json({ result: [] });
        const { data, error } = await supabase.from(entity).insert(rows).select();
        if (error) throw new Error(error.message);
        return json({ result: data ?? [] });
      }
      case "update": {
        const id = args[0];
        if (id == null) return json({ error: "update requires an id" }, 400);
        const { data, error } = await supabase.from(entity).update(args[1] ?? {}).eq("id", id).select().maybeSingle();
        if (error) throw new Error(error.message);
        return json({ result: data });
      }
      case "delete": {
        const id = args[0];
        if (id == null) return json({ error: "delete requires an id" }, 400);
        const { error } = await supabase.from(entity).delete().eq("id", id);
        if (error) throw new Error(error.message);
        return json({ result: { success: true } });
      }
      default:
        return json({ error: `Unsupported op: ${op}` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
