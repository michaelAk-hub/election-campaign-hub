// notificationsSend — send in-app notifications (admin/organotikos) and/or portal
// push messages (chreosi/kanali) to groups and/or specific users.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

const VALID_GROUPS = ["admin", "organotikos", "chreosi", "kanali", "all"];
const VALID_USER_TYPES = ["admin", "organotikos", "chreosi", "kanali"];
const VALID_EXPIRY_UNITS = ["minutes", "hours", "days"];

function generateBatchId(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { title, message, selectedGroups = [], selectedUsers = [], expiry_enabled = false, expiry_value = null, expiry_unit = null } = body;

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    const sender = auth.user;

    const trimmedTitle = (title || "").trim();
    const trimmedMessage = (message || "").trim();
    if (!trimmedTitle) return json({ error: "Απαιτείται τίτλος" }, 400);
    if (trimmedTitle.length > 100) return json({ error: "Ο τίτλος δεν μπορεί να υπερβαίνει τους 100 χαρακτήρες" }, 400);
    if (!trimmedMessage) return json({ error: "Απαιτείται μήνυμα" }, 400);
    if (trimmedMessage.length > 500) return json({ error: "Το μήνυμα δεν μπορεί να υπερβαίνει τους 500 χαρακτήρες" }, 400);

    let expiresAt: string | null = null;
    if (expiry_enabled === true || expiry_enabled === "true") {
      if (expiry_value == null || expiry_value === "") return json({ error: "Απαιτείται η τιμή λήξης όταν είναι ενεργοποιημένη η λήξη" }, 400);
      const val = parseInt(expiry_value, 10);
      if (!Number.isInteger(val) || val <= 0) return json({ error: "Η τιμή λήξης πρέπει να είναι θετικός ακέραιος αριθμός" }, 400);
      if (!expiry_unit || !VALID_EXPIRY_UNITS.includes(expiry_unit)) return json({ error: `Η μονάδα λήξης πρέπει να είναι μία από: ${VALID_EXPIRY_UNITS.join(", ")}` }, 400);
      const now = Date.now();
      const mult = expiry_unit === "minutes" ? 60000 : expiry_unit === "hours" ? 3600000 : 86400000;
      expiresAt = new Date(now + val * mult).toISOString();
    }

    if (!Array.isArray(selectedGroups)) return json({ error: "selectedGroups πρέπει να είναι array" }, 400);
    const invalidGroups = selectedGroups.filter((g: string) => !VALID_GROUPS.includes(g));
    if (invalidGroups.length) return json({ error: `Μη έγκυρες ομάδες: ${invalidGroups.join(", ")}. Επιτρεπόμενες: ${VALID_GROUPS.join(", ")}` }, 400);
    const validGroups = selectedGroups;

    if (!Array.isArray(selectedUsers)) return json({ error: "selectedUsers πρέπει να είναι array" }, 400);
    const invalidUsers = selectedUsers.filter((u: any) => !u || typeof u.username !== "string" || !u.username.trim() || !VALID_USER_TYPES.includes(u.type));
    if (invalidUsers.length) return json({ error: `Μη έγκυρες εγγραφές selectedUsers. Κάθε entry πρέπει να έχει username (string) και type (${VALID_USER_TYPES.join("|")})` }, 400);
    const validUsers = selectedUsers.map((u: any) => ({ username: u.username.trim(), type: u.type }));

    if (validGroups.length === 0 && validUsers.length === 0) return json({ error: "Απαιτείται τουλάχιστον ένας παραλήπτης" }, 400);

    const sendBatchId = generateBatchId();

    // ── App users (admin/organotikos) → Notification rows ──
    const notifEmailSet = new Set<string>();
    const notifRecipients: { email: string; recipient_type: string }[] = [];
    const addAppUser = (user: any) => {
      if (!notifEmailSet.has(user.email)) {
        notifEmailSet.add(user.email);
        notifRecipients.push({ email: user.email, recipient_type: user.role === "ADMIN" ? "admin" : "organotikos" });
      }
    };

    const needsAppUsers = validGroups.some((g: string) => ["admin", "organotikos", "all"].includes(g));
    const needsSpecificAppUsers = validUsers.some((u: any) => u.type === "admin" || u.type === "organotikos");
    let allAppUsers: any[] = [];
    if (needsAppUsers || needsSpecificAppUsers) allAppUsers = await fetchAll(supabase, "AppUser");

    if (validGroups.includes("admin") || validGroups.includes("all")) allAppUsers.filter((u) => u.role === "ADMIN").forEach(addAppUser);
    if (validGroups.includes("organotikos") || validGroups.includes("all")) allAppUsers.filter((u) => u.role === "ORGANOTIKI" && u.is_active).forEach(addAppUser);
    for (const su of validUsers) {
      if (su.type === "admin" || su.type === "organotikos") {
        const found = allAppUsers.find((u) => u.email === su.username);
        if (found) { if (su.type === "organotikos" && !found.is_active) continue; addAppUser(found); }
      }
    }

    // ── Portal users (chreosi/kanali) → PushMessage ──
    const groupTargetsChreosi = validGroups.includes("chreosi") || validGroups.includes("all");
    const groupTargetsKanali = validGroups.includes("kanali") || validGroups.includes("all");
    const specificPortalKeys = new Set<string>();
    for (const su of validUsers) {
      if (su.type === "chreosi") specificPortalKeys.add(`chreosi:${su.username}`);
      if (su.type === "kanali") specificPortalKeys.add(`kanali:${su.username}`);
    }

    let portalRecipientCount = 0, portalDeliveryMode: string | null = null, pushCreated = 0, portalChreosiCount = 0, portalKanaliCount = 0;
    const hasGroupPortal = groupTargetsChreosi || groupTargetsKanali;
    const hasSpecificPortal = specificPortalKeys.size > 0;

    const activeUsernames = async (table: string): Promise<string[]> => {
      const { data } = await supabase.from(table).select("username").eq("is_active", true);
      return (data ?? []).map((a: any) => a.username);
    };
    const usernameActive = async (table: string, uname: string): Promise<boolean> => {
      const { data } = await supabase.from(table).select("id").eq("username", uname).eq("is_active", true);
      return !!data?.length;
    };
    const createPush = (extra: any) => supabase.from("PushMessage").insert({
      title: trimmedTitle, body: trimmedMessage, sender_email: sender.email, is_active: true,
      acknowledged_count: 0, expires_at: expiresAt, disabled_at: null, disabled_by: null, send_batch_id: sendBatchId, ...extra,
    });

    if (hasGroupPortal || hasSpecificPortal) {
      if (hasGroupPortal && !hasSpecificPortal) {
        let target_group = groupTargetsChreosi && groupTargetsKanali ? "both" : groupTargetsChreosi ? "chreosi" : "kanali";
        const chreosiTotal = groupTargetsChreosi ? (await activeUsernames("ChreosiAccount")).length : 0;
        const kanaliTotal = groupTargetsKanali ? (await activeUsernames("KanaliAccount")).length : 0;
        const total = chreosiTotal + kanaliTotal;
        await createPush({ delivery_mode: "group", target_group, target_user_keys: [], total_recipients: total });
        portalRecipientCount = total; portalChreosiCount = chreosiTotal; portalKanaliCount = kanaliTotal; portalDeliveryMode = "group"; pushCreated = 1;
      } else if (!hasGroupPortal && hasSpecificPortal) {
        const verifiedKeys: string[] = [];
        for (const key of specificPortalKeys) {
          const [type, ...rest] = key.split(":");
          const uname = rest.join(":");
          if (type === "chreosi" && await usernameActive("ChreosiAccount", uname)) verifiedKeys.push(key);
          else if (type === "kanali" && await usernameActive("KanaliAccount", uname)) verifiedKeys.push(key);
        }
        if (verifiedKeys.length) {
          await createPush({ delivery_mode: "specific", target_group: null, target_user_keys: verifiedKeys, total_recipients: verifiedKeys.length });
          portalRecipientCount = verifiedKeys.length;
          portalChreosiCount = verifiedKeys.filter((k) => k.startsWith("chreosi:")).length;
          portalKanaliCount = verifiedKeys.filter((k) => k.startsWith("kanali:")).length;
          portalDeliveryMode = "specific"; pushCreated = 1;
        }
      } else {
        const activeChreosiKeys = new Set<string>();
        const activeKanaliKeys = new Set<string>();
        if (groupTargetsChreosi) (await activeUsernames("ChreosiAccount")).forEach((u) => activeChreosiKeys.add(`chreosi:${u}`));
        if (groupTargetsKanali) (await activeUsernames("KanaliAccount")).forEach((u) => activeKanaliKeys.add(`kanali:${u}`));
        const finalChreosiKeys = new Set(activeChreosiKeys);
        const finalKanaliKeys = new Set(activeKanaliKeys);
        for (const key of specificPortalKeys) {
          const [type, ...rest] = key.split(":");
          const uname = rest.join(":");
          if (type === "chreosi" && !finalChreosiKeys.has(key) && await usernameActive("ChreosiAccount", uname)) finalChreosiKeys.add(key);
          else if (type === "kanali" && !finalKanaliKeys.has(key) && await usernameActive("KanaliAccount", uname)) finalKanaliKeys.add(key);
        }
        const mergedKeys = [...finalChreosiKeys, ...finalKanaliKeys];
        const chreosiSideClean = groupTargetsChreosi ? finalChreosiKeys.size === activeChreosiKeys.size : finalChreosiKeys.size === 0;
        const kanaliSideClean = groupTargetsKanali ? finalKanaliKeys.size === activeKanaliKeys.size : finalKanaliKeys.size === 0;
        if (chreosiSideClean && kanaliSideClean) {
          let target_group = groupTargetsChreosi && groupTargetsKanali ? "both" : groupTargetsChreosi ? "chreosi" : "kanali";
          await createPush({ delivery_mode: "group", target_group, target_user_keys: [], total_recipients: mergedKeys.length });
          portalDeliveryMode = "group";
        } else {
          await createPush({ delivery_mode: "specific", target_group: null, target_user_keys: mergedKeys, total_recipients: mergedKeys.length });
          portalDeliveryMode = "specific";
        }
        portalRecipientCount = mergedKeys.length; portalChreosiCount = finalChreosiKeys.size; portalKanaliCount = finalKanaliKeys.size; pushCreated = 1;
      }
    }

    // ── Notification rows ──
    let notifCount = 0;
    if (notifRecipients.length) {
      const rows = notifRecipients.map((r) => ({
        recipient_type: r.recipient_type, recipient_username: r.email, title: trimmedTitle, message: trimmedMessage,
        type: "info", read: false, sender_email: sender.email, is_active: true, expires_at: expiresAt,
        disabled_at: null, disabled_by: null, send_batch_id: sendBatchId,
      }));
      await supabase.from("Notification").insert(rows);
      notifCount = rows.length;
    }

    const adminCount = notifRecipients.filter((r) => r.recipient_type === "admin").length;
    const orgCount = notifRecipients.filter((r) => r.recipient_type === "organotikos").length;

    return json({
      ok: true, notifications_created: notifCount, push_messages_created: pushCreated,
      admin_org_recipient_count: notifCount, portal_recipient_count: portalRecipientCount,
      portal_delivery_mode: portalDeliveryMode, send_batch_id: sendBatchId,
      expiry_enabled: expiry_enabled === true || expiry_enabled === "true", expires_at: expiresAt,
      summary: { admins: adminCount, organotikoi: orgCount, chreosi: portalChreosiCount, kanali: portalKanaliCount },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
