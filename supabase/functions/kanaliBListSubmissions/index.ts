// kanaliBListSubmissions — list Kanali Τύπος B submissions for the
// NotFoundVoters page (admin/organotiki). Also handles delete. Returns the
// current form fields too, so the UI can label the stored values.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    if (body.action === "delete") {
      const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return json({ error: "ids required" }, 400);
      const { error } = await supabase.from("KanaliBSubmission").delete().in("id", ids);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, deleted: ids.length });
    }

    const form = await fetchAll(supabase, "KanaliBFormField");
    const fields = (form || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

    const all = await fetchAll(supabase, "KanaliBSubmission");
    const statusFilter = body.status ? String(body.status) : null;
    const submissions = (all || [])
      .filter((s: any) => !statusFilter || s.status === statusFilter)
      .sort((a: any, b: any) => String(b.created_date).localeCompare(String(a.created_date)));

    const pending = submissions.filter((s: any) => s.status !== "done").length;
    return json({ ok: true, submissions, fields, pending, total: submissions.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
