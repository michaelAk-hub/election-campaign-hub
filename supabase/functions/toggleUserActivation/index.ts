// toggleUserActivation — activate/deactivate a user across roles, with audit log.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

function canPerformAction(actorRole: string, targetRole: string): boolean {
  if (actorRole === "ADMIN") return targetRole !== "ADMIN";
  if (actorRole === "ORGANOTIKI") return targetRole === "ORGANOTIKI";
  return false;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { target_user_id, target_role, new_status } = body;
    if (!target_user_id || !target_role || typeof new_status !== "boolean") return json({ error: "Λείπουν απαιτούμενα πεδία" }, 400);

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    const actor = auth.user;

    if (!canPerformAction(actor.role, target_role)) {
      return json({ error: `Δεν έχετε δικαίωμα να αλλάξετε την κατάσταση ${target_role} χρηστών` }, 403);
    }

    const entityName = (target_role === "ADMIN" || target_role === "ORGANOTIKI") ? "AppUser"
      : target_role === "KANALI" ? "KanaliAccount"
      : target_role === "CHREOSI" ? "ChreosiAccount" : null;
    if (!entityName) return json({ error: "Μη έγκυρος τύπος χρήστη" }, 400);

    const { data: targetUser } = await supabase.from(entityName).select("*").eq("id", target_user_id).maybeSingle();
    if (!targetUser) return json({ error: "Χρήστης δε βρέθηκε" }, 404);
    const oldStatus = entityName === "AppUser" ? (targetUser.is_active || false) : (targetUser.is_active !== false);

    await supabase.from(entityName).update({ is_active: new_status }).eq("id", target_user_id);

    // Invalidate sessions when deactivating.
    if (!new_status) {
      if (entityName === "AppUser") {
        await supabase.from("AppSession").update({ is_active: false }).eq("app_user_id", target_user_id).eq("is_active", true);
      } else {
        await supabase.from("PortalSession").update({ is_active: false }).eq("username", targetUser.username).eq("is_active", true);
      }
    }

    await supabase.from("UserActivationLog").insert({
      actor_user_id: actor.id, actor_role: actor.role, target_user_id, target_role,
      old_status: oldStatus, new_status, action_type: new_status ? "activate" : "deactivate", timestamp: new Date().toISOString(),
    });

    const actionText = new_status ? "ενεργοποιήθηκε" : "απενεργοποιήθηκε";
    if (target_role === "ORGANOTIKI") {
      await supabase.from("Notification").insert({
        recipient_type: "organotikos", recipient_username: targetUser.email,
        type: new_status ? "success" : "warning", category: "account_update",
        title: `Ο λογαριασμός σας ${actionText}`,
        message: `Ο διαχειριστής ${actor.name} ${actor.surname} ${actionText} τον λογαριασμό σας.`,
      });
    }

    return json({ success: true, message: `Ο χρήστης ${actionText} επιτυχώς`, new_status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
