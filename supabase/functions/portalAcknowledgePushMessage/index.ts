// portalAcknowledgePushMessage — a portal user acknowledges a push message.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const { sessionToken, username, messageId } = await req.json().catch(() => ({}));
    if (!sessionToken || !username || !messageId) return json({ success: false, error: "Missing fields" }, 400);

    const v = await validatePortalSession(supabase, sessionToken, { username });
    if (v.error) return json({ success: false, error: v.error }, v.status);
    const session = v.session;

    // Idempotent per (message, portal_type, username).
    const { data: existing } = await supabase.from("PushMessageAck").select("id")
      .eq("message_id", messageId).eq("recipient_type", session.portal_type).eq("username", username);
    if (existing?.length) return json({ success: true });

    const { data: message } = await supabase.from("PushMessage").select("*").eq("id", messageId).eq("is_active", true).maybeSingle();
    if (!message) return json({ success: false, error: "Message not found" }, 404);

    await supabase.from("PushMessageAck").insert({
      message_id: messageId, recipient_type: session.portal_type, username, acknowledged_at: new Date().toISOString(),
    });
    await supabase.from("PushMessage").update({ acknowledged_count: (message.acknowledged_count || 0) + 1 }).eq("id", messageId);

    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
