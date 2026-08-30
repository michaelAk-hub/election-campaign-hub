// submitKanaliBForm — a Kanali Τύπος B operator submits the shared form.
// Stores one KanaliBSubmission (status=pending) for later identification by an
// admin/organotikos. Never touches Person directly.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { username, sessionToken, values } = await req.json().catch(() => ({}));
    if (!username || !sessionToken) return json({ error: "Missing session" }, 400);

    const auth = await validatePortalSession(supabase, sessionToken, { username, portalType: "kanali" });
    if (auth.error) return json({ error: auth.error }, auth.status);

    const form = await fetchAll(supabase, "KanaliBFormField");
    const keys = new Set((form || []).map((f: any) => f.field_key));

    // Keep only non-empty values for keys that are actually part of the form.
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(values || {})) {
      if (!keys.has(k)) continue;
      if (v === null || v === undefined || String(v).trim() === "") continue;
      clean[k] = v;
    }
    if (Object.keys(clean).length === 0) return json({ error: "Κενή υποβολή" }, 400);

    // Enforce required fields server-side too.
    const missing = (form || []).filter((f: any) => f.required && !(f.field_key in clean)).map((f: any) => f.label || f.field_key);
    if (missing.length) return json({ error: "Λείπουν υποχρεωτικά πεδία: " + missing.join(", ") }, 400);

    const { error } = await supabase.from("KanaliBSubmission").insert({
      kanali_username: username, values: clean, status: "pending",
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
