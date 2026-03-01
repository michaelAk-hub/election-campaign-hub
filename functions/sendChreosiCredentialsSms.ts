import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeCyPhoneToDigits(input) {
  if (!input) return null;
  let digits = input.trim().replace(/\D/g, "");

  if (digits.startsWith("00357")) digits = digits.slice(2);
  if (digits.length === 8) digits = "357" + digits;
  if (digits.startsWith("357") && digits.length === 11) return digits;

  return null;
}

function generatePassword(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function maskPassword(text, password) {
  if (!password) return text;
  return text.split(password).join("********");
}

async function vonageSendSms({ apiKey, apiSecret, from, toDigits, text }) {
  const basic = btoa(`${apiKey}:${apiSecret}`);
  const form = new URLSearchParams();
  form.set("from", from);
  form.set("to", toDigits);
  form.set("text", text);
  form.set("type", "unicode");

  const res = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Vonage HTTP ${res.status}: ${raw}`);

  try { return JSON.parse(raw); } catch { return { raw }; }
}

function isPrivileged(user) {
  if (!user) return false;
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "user"; // All logged-in AppUsers are privileged
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mode = body.mode || "selected";
    const usernames = body.usernames || [];
    const title = body.title || "Στοιχεία πρόσβασης";
    const portalUrl = body.portalUrl || "https://votecontrol.info/PortalLogin";
    const template = (body.template && String(body.template).trim()) ||
      "Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}";
    const passwordLength = Number(body.passwordLength || 8);
    const includeTitleLine = !!body.includeTitleLine;
    const onlyActive = body.onlyActive !== false;
    const throttleMs = Number(body.throttleMs || 150);

    if (mode === "selected" && usernames.length === 0) {
      return Response.json({ error: "No usernames provided" }, { status: 400 });
    }

    const apiKey = Deno.env.get("VONAGE_API_KEY");
    const apiSecret = Deno.env.get("VONAGE_API_SECRET");
    const from = Deno.env.get("VONAGE_SMS_FROM") || "VoteControl";

    if (!apiKey || !apiSecret) {
      return Response.json({ error: "Missing Vonage secrets" }, { status: 500 });
    }

    // Load all Chreosi accounts
    let all = [];
    let offset = 0;
    const pageSize = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, pageSize, offset);
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    let targets = onlyActive ? all.filter(a => a.is_active) : all;
    if (mode === "selected") {
      const set = new Set(usernames.map(u => (u || "").trim()));
      targets = targets.filter(a => set.has((a.username || "").trim()));
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results = [];

    for (const acc of targets) {
      const username = (acc.username || "").trim();
      const phoneRaw = (acc.phone || "").trim();
      const toDigits = normalizeCyPhoneToDigits(phoneRaw);

      if (!toDigits) {
        skipped++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: phoneRaw,
          to_username: username,
          status: "skipped",
          error: phoneRaw ? "Invalid phone format" : "Missing phone",
          sent_by_user_id: user.id
        });
        results.push({ username, status: "skipped", reason: phoneRaw ? "Invalid phone format" : "Missing phone" });
        continue;
      }

      const oldPass = acc.password_hash;
      const newPass = generatePassword(passwordLength);

      let msg = template
        .replaceAll("{PORTAL_URL}", portalUrl)
        .replaceAll("{USERNAME}", username)
        .replaceAll("{PASSWORD}", newPass)
        .replaceAll("{NAME}", acc.display_name || username);

      if (includeTitleLine && title) msg = `${title}\n${msg}`;

      try {
        // Update password first
        await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, {
          password_hash: newPass
        });

        const vonageResp = await vonageSendSms({ apiKey, apiSecret, from, toDigits, text: msg });
        const m = vonageResp?.messages?.[0] || null;
        const status = m?.status;
        const messageId = m?.["message-id"] || "";

        if (status !== "0") {
          // Rollback password if SMS failed
          await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, { password_hash: oldPass });

          failed++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials",
            title,
            to_phone: toDigits,
            to_username: username,
            message_preview: maskPassword(msg, newPass).slice(0, 240),
            provider: "vonage",
            provider_message_id: messageId,
            status: "failed",
            error: `Vonage status=${status}`,
            sent_by_user_id: user.id
          });
          results.push({ username, status: "failed", error: `vonage status ${status}`, messageId });
        } else {
          sent++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials",
            title,
            to_phone: toDigits,
            to_username: username,
            message_preview: maskPassword(msg, newPass).slice(0, 240),
            provider: "vonage",
            provider_message_id: messageId,
            status: "sent",
            sent_by_user_id: user.id
          });
          results.push({ username, status: "sent", messageId });
        }
      } catch (e) {
        // Best effort rollback
        try {
          await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, { password_hash: oldPass });
        } catch {}

        failed++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: toDigits || phoneRaw,
          to_username: username,
          status: "failed",
          error: e?.message || String(e),
          sent_by_user_id: user.id
        });
        results.push({ username, status: "failed", error: e?.message || String(e) });
      }

      if (throttleMs > 0) await new Promise(r => setTimeout(r, throttleMs));
    }

    return Response.json({ ok: true, sent, failed, skipped, results });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});