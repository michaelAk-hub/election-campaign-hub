// driveToken — ADMIN-authed: mint a short-lived Google Drive access token so the
// browser can build backup files and upload them directly to Drive. The refresh
// token / client secret never leave the server; only a ~1h access token (scope
// drive.file) is returned.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getAccessToken } from "../_shared/gdrive.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές" }, 403);

    const access_token = await getAccessToken();
    return json({ access_token, root: Deno.env.get("GOOGLE_DRIVE_ROOT") || "root" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
