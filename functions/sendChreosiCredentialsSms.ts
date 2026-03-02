import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function normalizeCyPhoneToE164(input) {
  if (!input) return null;
  let digits = input.trim().replace(/\D/g, "");

  if (digits.startsWith("00357")) digits = digits.slice(2);
  if (digits.length === 8) digits = "357" + digits;
  if (digits.startsWith("357") && digits.length === 11) return "+" + digits;

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

async function twilioSendSms({ accountSid, authToken, toE164, body, messagingServiceSid, from }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", toE164);
  form.set("Body", body);

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else {
    if (!from) throw new Error("Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM");
    form.set("From", from);
  }

  const basic = btoa(`${accountSid}:${authToken}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const raw = await res.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }

  if (!res.ok) {
    throw new Error(`Twilio send failed: ${payload?.code || res.status} ${payload?.message || raw}`);
  }

  return payload;
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
    const template =
      (body.template && String(body.template).trim()) ||
      "Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}";
    const passwordLength = Number(body.passwordLength || 8);
    const includeTitleLine = !!body.includeTitleLine;
    const onlyActive = body.onlyActive !== false;
    const throttleMs = Number(body.throttleMs || 150);

    if (mode === "selected" && usernames.length === 0) {
      return Response.json({ error: "No usernames provided" }, { status: 400 });
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") || "";
    const from = Deno.env.get("TWILIO_FROM") || "";

    if (!accountSid || !authToken) {
      return Response.json({ error: "Missing Twilio secrets" }, { status: 500 });
    }
    if (!messagingServiceSid && !from) {
      return Response.json({ error: "Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM" }, { status: 500 });
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

    let targets = onlyActive ? all.filter((a) => a.is_active) : all;
    if (mode === "selected") {
      const set = new Set(usernames.map((u) => (u || "").trim()));
      targets = targets.filter((a) => set.has((a.username || "").trim()));
    }

    let sent = 0, failed = 0, skipped = 0;
    const results = [];

    for (const acc of targets) {
      const username = (acc.username || "").trim();
      const phoneRaw = (acc.phone || "").trim();
      const toE164 = normalizeCyPhoneToE164(phoneRaw);

      if (!toE164) {
        skipped++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: phoneRaw,
          to_username: username,
          status: "skipped",
          error: phoneRaw ? "Invalid phone format" : "Missing phone",
          sent_by_user_id: user.id,
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
        await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, { password_hash: newPass });

        const tw = await twilioSendSms({
          accountSid,
          authToken,
          toE164,
          body: msg,
          messagingServiceSid: messagingServiceSid || undefined,
          from: !messagingServiceSid ? from : undefined,
        });

        sent++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: toE164,
          to_username: username,
          message_preview: maskPassword(msg, newPass).slice(0, 240),
          provider: "twilio",
          provider_message_id: tw?.sid || "",
          status: "sent",
          sent_by_user_id: user.id,
        });
        results.push({ username, status: "sent", messageId: tw?.sid || "" });
      } catch (e) {
        try {
          await base44.asServiceRole.entities.ChreosiAccount.update(acc.id, { password_hash: oldPass });
        } catch {}

        failed++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: toE164 || phoneRaw,
          to_username: username,
          provider: "twilio",
          status: "failed",
          error: e?.message || String(e),
          sent_by_user_id: user.id,
        });
        results.push({ username, status: "failed", error: e?.message || String(e) });
      }

      if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
    }

    return Response.json({ ok: true, sent, failed, skipped, results });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});