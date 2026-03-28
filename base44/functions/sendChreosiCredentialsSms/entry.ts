import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateSession(base44, session_token) {
  if (!session_token) return { error: "Απαιτείται session token", status: 401 };
  const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
  if (sessions.length === 0) return { error: "Μη έγκυρη συνεδρία", status: 401 };
  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία έληξε", status: 401 };
  }
  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) return { error: "Χρήστης δεν βρέθηκε", status: 401 };
  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία σας έληξε.", status: 401, force_logout: true };
  }
  if (user.role === "ORGANOTIKI" && !user.is_active) return { error: "Ο λογαριασμός σας έχει απενεργοποιηθεί", status: 403 };
  if (session.last_seen_at) {
    const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: "Η συνεδρία σας έληξε λόγω αδράνειας", status: 401, reason: "idle_timeout" };
    }
  }
  return { user, session };
}

function normalizeCyPhoneToE164(input) {
  if (!input) return null;
  let digits = input.trim().replace(/\D/g, "");
  if (digits.startsWith("00357")) digits = digits.slice(2);
  if (digits.length === 8) digits = "357" + digits;
  if (digits.startsWith("357") && digits.length === 11) return "+" + digits;
  return null;
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

  if (!res.ok) throw new Error(`Twilio send failed: ${payload?.code || res.status} ${payload?.message || raw}`);
  return payload;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const auth = await validateSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
    const user = auth.user;

    const sendTarget = body.sendTarget || "chreosi";
    const mode = body.mode || "selected";
    const usernames = body.usernames || [];
    const manualPhones = body.manualPhones || [];
    const groupId = body.groupId || null;
    const title = body.title || "Στοιχεία πρόσβασης";
    const portalUrl = body.portalUrl || "https://votecontrol.info/PortalLogin";
    const template =
      (body.template && String(body.template).trim()) ||
      "Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}";
    const includeTitleLine = !!body.includeTitleLine;
    const onlyActive = body.onlyActive !== false;
    const throttleMs = Number(body.throttleMs || 150);

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

    // ── GROUP PHONE MODE ───────────────────────────────────────────────────────
    if (sendTarget === "group") {
      if (!groupId) return Response.json({ error: "No group selected" }, { status: 400 });

      // Fetch group members
      const members = await base44.asServiceRole.entities.SmsPhoneGroupMember.filter({ group_id: groupId });
      const activeMembers = members.filter(m => m.is_active !== false);

      if (activeMembers.length === 0) {
        return Response.json({ error: "Η ομάδα δεν έχει μέλη" }, { status: 400 });
      }

      // Block unsupported placeholders in group mode
      const unsupported = ["{USERNAME}", "{PASSWORD}", "{NAME}"];
      const found = unsupported.filter((p) => template.includes(p));
      if (found.length > 0) {
        return Response.json({
          error: `Group mode only supports {PORTAL_URL}. The placeholders ${found.join(", ")} require a Chreosi account.`,
        }, { status: 400 });
      }

      const seen = new Set();
      let sent = 0, failed = 0, skipped_invalid = 0, skipped_duplicate = 0;
      const results = [];

      for (const member of activeMembers) {
        const toE164 = member.normalized_phone;
        if (!toE164) { skipped_invalid++; continue; }
        if (seen.has(toE164)) { skipped_duplicate++; continue; }
        seen.add(toE164);

        let msg = template.replaceAll("{PORTAL_URL}", portalUrl);
        if (includeTitleLine && title) msg = `${title}\n${msg}`;

        try {
          const tw = await twilioSendSms({
            accountSid, authToken, toE164, body: msg,
            messagingServiceSid: messagingServiceSid || undefined,
            from: !messagingServiceSid ? from : undefined,
          });
          sent++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials_manual",
            title,
            to_phone: toE164,
            to_username: member.display_name || "",
            message_preview: msg.slice(0, 240),
            provider: "twilio",
            provider_message_id: tw?.sid || "",
            status: "sent",
            sent_by_user_id: user.id,
          });
          results.push({ phone: toE164, status: "sent", messageId: tw?.sid || "" });
        } catch (e) {
          failed++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials_manual",
            title, to_phone: toE164, provider: "twilio",
            status: "failed", error: e?.message || String(e), sent_by_user_id: user.id,
          });
          results.push({ phone: toE164, status: "failed", error: e?.message || String(e) });
        }

        if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
      }

      return Response.json({ ok: true, sent, failed, skipped: skipped_invalid + skipped_duplicate, skipped_invalid, skipped_duplicate, results });
    }

    // ── MANUAL PHONE MODE ──────────────────────────────────────────────────────
    if (sendTarget === "manual") {
      if (!manualPhones || manualPhones.length === 0) {
        return Response.json({ error: "No phone numbers provided" }, { status: 400 });
      }

      // Backend template safety check — block unsupported placeholders
      const unsupported = ["{USERNAME}", "{PASSWORD}", "{NAME}"];
      const found = unsupported.filter((p) => template.includes(p));
      if (found.length > 0) {
        return Response.json({
          error: `Manual phone mode only supports {PORTAL_URL}. The placeholders ${found.join(", ")} require a Chreosi account.`,
        }, { status: 400 });
      }

      // Normalize + deduplicate
      const seen = new Set();
      let sent = 0, failed = 0, skipped_invalid = 0, skipped_duplicate = 0;
      const results = [];

      for (const raw of manualPhones) {
        const toE164 = normalizeCyPhoneToE164(raw);
        if (!toE164) {
          skipped_invalid++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials_manual",
            title,
            to_phone: raw,
            status: "skipped",
            error: "Invalid phone format",
            sent_by_user_id: user.id,
          });
          results.push({ phone: raw, status: "skipped_invalid", reason: "Invalid phone format" });
          continue;
        }
        if (seen.has(toE164)) {
          skipped_duplicate++;
          results.push({ phone: toE164, status: "skipped_duplicate", reason: "Duplicate" });
          continue;
        }
        seen.add(toE164);

        let msg = template.replaceAll("{PORTAL_URL}", portalUrl);
        if (includeTitleLine && title) msg = `${title}\n${msg}`;

        try {
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
            category: "chreosi_credentials_manual",
            title,
            to_phone: toE164,
            message_preview: msg.slice(0, 240),
            provider: "twilio",
            provider_message_id: tw?.sid || "",
            status: "sent",
            sent_by_user_id: user.id,
          });
          results.push({ phone: toE164, status: "sent", messageId: tw?.sid || "" });
        } catch (e) {
          failed++;
          await base44.asServiceRole.entities.SmsLog.create({
            category: "chreosi_credentials_manual",
            title,
            to_phone: toE164,
            provider: "twilio",
            status: "failed",
            error: e?.message || String(e),
            sent_by_user_id: user.id,
          });
          results.push({ phone: toE164, status: "failed", error: e?.message || String(e) });
        }

        if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
      }

      return Response.json({ ok: true, sent, failed, skipped: skipped_invalid + skipped_duplicate, skipped_invalid, skipped_duplicate, results });
    }

    // ── CHREOSI MODE ───────────────────────────────────────────────────────────
    if (mode === "selected" && usernames.length === 0) {
      return Response.json({ error: "No usernames provided" }, { status: 400 });
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

      // Use plain_password; fall back to password_hash only if it's not a bcrypt hash (legacy plain text)
      const rawHash = (acc.password_hash || "").toString().trim();
      const passwordToSend = (acc.plain_password || "").toString().trim() ||
        (rawHash.startsWith("$2") ? "" : rawHash);

      if (!passwordToSend) {
        skipped++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: toE164,
          to_username: username,
          status: "skipped",
          error: "Missing password",
          sent_by_user_id: user.id,
        });
        results.push({ username, status: "skipped", reason: "Missing password" });
        continue;
      }

      let msg = template
        .replaceAll("{PORTAL_URL}", portalUrl)
        .replaceAll("{USERNAME}", username)
        .replaceAll("{PASSWORD}", passwordToSend)
        .replaceAll("{NAME}", acc.display_name || username);

      if (includeTitleLine && title) msg = `${title}\n${msg}`;

      try {
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
          message_preview: maskPassword(msg, passwordToSend).slice(0, 240),
          provider: "twilio",
          provider_message_id: tw?.sid || "",
          status: "sent",
          sent_by_user_id: user.id,
        });
        results.push({ username, status: "sent", messageId: tw?.sid || "" });
      } catch (e) {
        failed++;
        await base44.asServiceRole.entities.SmsLog.create({
          category: "chreosi_credentials",
          title,
          to_phone: toE164,
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