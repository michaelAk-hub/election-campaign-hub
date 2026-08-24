// sendChreosiCredentialsSms — send portal credentials / links via Twilio SMS.
// Three targets: chreosi accounts, an SmsPhoneGroup, or manual phone numbers.
// Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and one of
// TWILIO_MESSAGING_SERVICE_SID / TWILIO_FROM in the Edge Function env.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";

function normalizeCyPhoneToE164(input: string): string | null {
  if (!input) return null;
  let digits = input.trim().replace(/\D/g, "");
  if (digits.startsWith("00357")) digits = digits.slice(2);
  if (digits.length === 8) digits = "357" + digits;
  if (digits.startsWith("357") && digits.length === 11) return "+" + digits;
  return null;
}

const maskPassword = (text: string, password: string) =>
  password ? text.split(password).join("********") : text;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function twilioSendSms(
  { accountSid, authToken, toE164, body, messagingServiceSid, from }:
  { accountSid: string; authToken: string; toE164: string; body: string; messagingServiceSid?: string; from?: string },
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", toE164);
  form.set("Body", body);
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else {
    if (!from) throw new Error("Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM");
    form.set("From", from);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const raw = await res.text();
  let payload: any;
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }
  if (!res.ok) throw new Error(`Twilio send failed: ${payload?.code || res.status} ${payload?.message || raw}`);
  return payload;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
    const user = auth.user;

    const sendTarget = body.sendTarget || "chreosi";
    const mode = body.mode || "selected";
    const usernames = body.usernames || [];
    const manualPhones = body.manualPhones || [];
    const groupId = body.groupId || null;
    const title = body.title || "Στοιχεία πρόσβασης";
    const portalUrl = body.portalUrl || "https://votecontrol.info/PortalLogin";
    const template = (body.template && String(body.template).trim()) ||
      "Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}";
    const includeTitleLine = !!body.includeTitleLine;
    const onlyActive = body.onlyActive !== false;
    const throttleMs = Number(body.throttleMs || 150);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") || "";
    const from = Deno.env.get("TWILIO_FROM") || "";
    if (!accountSid || !authToken) return json({ error: "Missing Twilio secrets" }, 500);
    if (!messagingServiceSid && !from) return json({ error: "Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM" }, 500);

    const twilioArgs = { accountSid, authToken, messagingServiceSid: messagingServiceSid || undefined, from: !messagingServiceSid ? from : undefined };
    const logSms = (row: any) => supabase.from("SmsLog").insert({ provider: "twilio", sent_by_user_id: user.id, ...row });

    // ── GROUP or MANUAL: only {PORTAL_URL} allowed ──
    if (sendTarget === "group" || sendTarget === "manual") {
      const unsupported = ["{USERNAME}", "{PASSWORD}", "{NAME}"].filter((p) => template.includes(p));
      if (unsupported.length > 0) {
        const label = sendTarget === "group" ? "Group" : "Manual phone";
        return json({ error: `${label} mode only supports {PORTAL_URL}. The placeholders ${unsupported.join(", ")} require a Chreosi account.` }, 400);
      }

      let entries: { phone: string; label: string; preValidated: boolean }[] = [];
      if (sendTarget === "group") {
        if (!groupId) return json({ error: "No group selected" }, 400);
        const { data: members } = await supabase.from("SmsPhoneGroupMember").select("*").eq("group_id", groupId);
        const active = (members ?? []).filter((m: any) => m.is_active !== false);
        if (active.length === 0) return json({ error: "Η ομάδα δεν έχει μέλη" }, 400);
        entries = active.map((m: any) => ({ phone: m.normalized_phone, label: m.display_name || "", preValidated: true }));
      } else {
        if (!manualPhones.length) return json({ error: "No phone numbers provided" }, 400);
        entries = manualPhones.map((raw: string) => ({ phone: raw, label: "", preValidated: false }));
      }

      const seen = new Set<string>();
      let sent = 0, failed = 0, skipped_invalid = 0, skipped_duplicate = 0;
      const results: any[] = [];
      for (const entry of entries) {
        const toE164 = entry.preValidated ? entry.phone : normalizeCyPhoneToE164(entry.phone);
        if (!toE164) {
          skipped_invalid++;
          if (!entry.preValidated) await logSms({ category: "chreosi_credentials_manual", title, to_phone: entry.phone, status: "skipped", error: "Invalid phone format" });
          results.push({ phone: entry.phone, status: "skipped_invalid", reason: "Invalid phone format" });
          continue;
        }
        if (seen.has(toE164)) { skipped_duplicate++; results.push({ phone: toE164, status: "skipped_duplicate", reason: "Duplicate" }); continue; }
        seen.add(toE164);
        let msg = template.replaceAll("{PORTAL_URL}", portalUrl);
        if (includeTitleLine && title) msg = `${title}\n${msg}`;
        try {
          const tw = await twilioSendSms({ ...twilioArgs, toE164, body: msg });
          sent++;
          await logSms({ category: "chreosi_credentials_manual", title, to_phone: toE164, to_username: entry.label, message_preview: msg.slice(0, 240), provider_message_id: tw?.sid || "", status: "sent" });
          results.push({ phone: toE164, status: "sent", messageId: tw?.sid || "" });
        } catch (e) {
          failed++;
          await logSms({ category: "chreosi_credentials_manual", title, to_phone: toE164, status: "failed", error: (e as Error).message });
          results.push({ phone: toE164, status: "failed", error: (e as Error).message });
        }
        if (throttleMs > 0) await sleep(throttleMs);
      }
      return json({ ok: true, sent, failed, skipped: skipped_invalid + skipped_duplicate, skipped_invalid, skipped_duplicate, results });
    }

    // ── CHREOSI MODE ──
    if (mode === "selected" && usernames.length === 0) return json({ error: "No usernames provided" }, 400);

    const all = await fetchAll(supabase, "ChreosiAccount");
    let targets = onlyActive ? all.filter((a: any) => a.is_active) : all;
    if (mode === "selected") {
      const set = new Set(usernames.map((u: string) => (u || "").trim()));
      targets = targets.filter((a: any) => set.has((a.username || "").trim()));
    }

    let sent = 0, failed = 0, skipped = 0;
    const results: any[] = [];
    for (const acc of targets) {
      const username = (acc.username || "").trim();
      const phoneRaw = (acc.phone || "").trim();
      const toE164 = normalizeCyPhoneToE164(phoneRaw);
      if (!toE164) {
        skipped++;
        await logSms({ category: "chreosi_credentials", title, to_phone: phoneRaw, to_username: username, status: "skipped", error: phoneRaw ? "Invalid phone format" : "Missing phone" });
        results.push({ username, status: "skipped", reason: phoneRaw ? "Invalid phone format" : "Missing phone" });
        continue;
      }
      const rawHash = (acc.password_hash || "").toString().trim();
      const passwordToSend = (acc.plain_password || "").toString().trim() || (rawHash.startsWith("$2") ? "" : rawHash);
      if (!passwordToSend) {
        skipped++;
        await logSms({ category: "chreosi_credentials", title, to_phone: toE164, to_username: username, status: "skipped", error: "Missing password" });
        results.push({ username, status: "skipped", reason: "Missing password" });
        continue;
      }
      let msg = template
        .replaceAll("{PORTAL_URL}", portalUrl).replaceAll("{USERNAME}", username)
        .replaceAll("{PASSWORD}", passwordToSend).replaceAll("{NAME}", acc.display_name || username);
      if (includeTitleLine && title) msg = `${title}\n${msg}`;
      try {
        const tw = await twilioSendSms({ ...twilioArgs, toE164, body: msg });
        sent++;
        await logSms({ category: "chreosi_credentials", title, to_phone: toE164, to_username: username, message_preview: maskPassword(msg, passwordToSend).slice(0, 240), provider_message_id: tw?.sid || "", status: "sent" });
        results.push({ username, status: "sent", messageId: tw?.sid || "" });
      } catch (e) {
        failed++;
        await logSms({ category: "chreosi_credentials", title, to_phone: toE164, to_username: username, status: "failed", error: (e as Error).message });
        results.push({ username, status: "failed", error: (e as Error).message });
      }
      if (throttleMs > 0) await sleep(throttleMs);
    }
    return json({ ok: true, sent, failed, skipped, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
