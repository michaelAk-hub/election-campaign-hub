// functions/sendTestNotification/entry.ts
// Sends a test Telegram message so you can confirm the bot token + chat ID work.
// Called from the dashboard:  await base44.functions.invoke("sendTestNotification", { session_token })
//
// Auth: matches the app's custom session layer (AppSession -> AppUser role).
// Allowed roles: ADMIN, ORGANOTIKI.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { session_token } = await req.json().catch(() => ({}));

    // --- auth: custom session layer (AppSession -> AppUser role) ---
    if (!session_token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (sessions.length === 0) return Response.json({ ok: false, error: "Invalid session" }, { status: 401 });
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
    if (users.length === 0 || !["ADMIN", "ORGANOTIKI"].includes(users[0].role)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    if (!token) return Response.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN secret" });

    const settings = (await base44.asServiceRole.entities.MonitorSetting.list())[0];
    const chatId = settings?.telegram_chat_id || "";
    if (!chatId) return Response.json({ ok: false, error: "Set telegram_chat_id in Settings first" });

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ Test message from your News Monitor bot. If you can read this, notifications work!",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return Response.json({ ok: false, error: json.description || `Telegram HTTP ${res.status}` });
    }
    return Response.json({ ok: true, message: "Test sent — check Telegram." });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 200 });
  }
});