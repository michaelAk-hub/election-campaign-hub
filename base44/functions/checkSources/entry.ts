// functions/checkSources/entry.ts
// Main monitoring engine. Triggered by the scheduled automation (Base44 Automations)
// or by an external cron hitting:  POST /functions/checkSources?secret=YOUR_CRON_SECRET
//
// Secrets required (set in Base44 project settings):
//   TELEGRAM_BOT_TOKEN   - from @BotFather
//   CRON_SECRET          - any long random string; also passed in the automation function_args
//
// Settings (MonitorSetting entity, single record):
//   telegram_chat_id, notifications_enabled, verbose_logging, notification_template

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { XMLParser } from "npm:fast-xml-parser@4";
import { load } from "npm:cheerio@1.0.0";

const USER_AGENT =
  "Mozilla/5.0 (compatible; NewsMonitorBot/1.0; +https://base44.app)";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3_000_000; // ~3MB cap to avoid huge pages
const POLITE_DELAY_MS = 800; // small gap between sources
const LOCK_MINUTES = 10; // run lock duration

// ---------------------------------------------------------------------------
// HTTP with timeout + manual redirect limiting + friendly error classes
// ---------------------------------------------------------------------------
function classifyStatus(status) {
  if (status === 403 || status === 429) return "blocked";
  if (status >= 400) return "fetch_error";
  return null;
}

async function safeFetch(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en,el;q=0.8",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      throw { kind: aborted ? "timeout" : "fetch_error", message: aborted ? "Request timed out" : String(e) };
    }
    clearTimeout(timer);

    // Follow redirects manually so we can cap them
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }

    const errKind = classifyStatus(res.status);
    if (errKind) {
      throw { kind: errKind, message: `HTTP ${res.status}`, status: res.status };
    }

    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, body: "", finalUrl: url };
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total > MAX_BODY_BYTES) {
          reader.cancel();
          break;
        }
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c.subarray(0, Math.min(c.length, MAX_BODY_BYTES - offset)), offset);
      offset += c.length;
      if (offset >= MAX_BODY_BYTES) break;
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { status: res.status, body, finalUrl: url };
  }
  throw { kind: "fetch_error", message: "Too many redirects" };
}

// ---------------------------------------------------------------------------
// RSS / Atom parsing -> latest item
// ---------------------------------------------------------------------------
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function pickLink(item) {
  // RSS: <link>text</link>  |  Atom: <link href="..."/> (maybe array)
  if (typeof item.link === "string") return item.link;
  if (item.link && typeof item.link === "object") {
    if (Array.isArray(item.link)) {
      const alt = item.link.find((l) => l["@_rel"] === "alternate") || item.link[0];
      return alt?.["@_href"] || alt?.["#text"] || "";
    }
    return item.link["@_href"] || item.link["#text"] || "";
  }
  if (item.guid) return typeof item.guid === "string" ? item.guid : item.guid["#text"] || "";
  if (item.id) return String(item.id);
  return "";
}

function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] || "";
  return String(v);
}

function parseLatestItem(xml) {
  const doc = xmlParser.parse(xml);
  // RSS 2.0
  let items = doc?.rss?.channel?.item;
  // Atom
  if (!items) items = doc?.feed?.entry;
  // RDF / RSS 1.0
  if (!items) items = doc?.["rdf:RDF"]?.item;
  if (!items) return null;
  const arr = Array.isArray(items) ? items : [items];
  if (arr.length === 0) return null;
  const it = arr[0];
  return {
    title: textOf(it.title) || "(no title)",
    link: pickLink(it),
    description: textOf(it.description) || textOf(it.summary) || textOf(it.content),
    pubDate: textOf(it.pubDate) || textOf(it.published) || textOf(it.updated) || "",
  };
}

// ---------------------------------------------------------------------------
// Website content extraction + cleaning + hashing
// ---------------------------------------------------------------------------
function extractWebsiteText(html, selector) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();
  let scope = selector && selector.trim() ? $(selector) : $("body");
  if (scope.length === 0) scope = $("body"); // selector matched nothing -> fall back
  const text = scope.text() || "";
  // Collapse whitespace so trivial reflows don't trigger false alerts
  return text.replace(/\s+/g, " ").trim();
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------
async function sendTelegram(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.description || `Telegram HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function nowIso() {
  return new Date().toISOString();
}
function humanTime() {
  return new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const summary = { success: true, checked: 0, updates_found: 0, notifications_sent: 0, errors: 0, skipped: false };

  // --- auth: accept secret from query, header, or automation function_args ---
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const urlObj = new URL(req.url);
  let bodyArgs = {};
  try {
    const raw = await req.clone().json();
    bodyArgs = raw?.args ?? raw ?? {};
  } catch (_) { /* no body */ }
  const provided =
    urlObj.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    bodyArgs?.secret ||
    "";
  if (!cronSecret || provided !== cronSecret) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  const log = async (fields) => {
    try { await db.MonitorLog.create(fields); } catch (_) { /* never let logging crash a run */ }
  };

  // --- settings (single record) ---
  let settings = (await db.MonitorSetting.list())[0];
  if (!settings) {
    settings = await db.MonitorSetting.create({ notifications_enabled: true, verbose_logging: false });
  }

  // --- run lock (prevents overlapping cron runs) ---
  const now = Date.now();
  if (settings.lock_until && new Date(settings.lock_until).getTime() > now) {
    summary.skipped = true;
    return Response.json({ ...summary, reason: "another run in progress" });
  }
  await db.MonitorSetting.update(settings.id, { lock_until: new Date(now + LOCK_MINUTES * 60000).toISOString() });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = settings.telegram_chat_id || "";
  const template = settings.notification_template ||
    "New update detected\n\nSource: {name}\nType: {type}\nTitle: {title}\nLink: {link}\nChecked at: {time}";
  const notificationsEnabled = settings.notifications_enabled !== false;
  const verbose = settings.verbose_logging === true;

  try {
    const sources = await db.MonitorSource.filter({ active: true });

    for (const src of sources) {
      // due-for-check gate (per-source interval)
      const interval = (src.check_interval || 15) * 60000;
      if (src.last_checked_at && now - new Date(src.last_checked_at).getTime() < interval) {
        continue;
      }
      summary.checked++;

      const patch = { last_checked_at: nowIso() };
      try {
        const { body } = await safeFetch(src.url);

        let changed = false;
        let title = "";
        let link = "";
        let description = "";

        if (src.type === "website") {
          const textContent = extractWebsiteText(body, src.css_selector);
          const newHash = await sha256(textContent);
          title = src.name + " updated";
          link = src.url;
          if (!src.last_hash) {
            patch.last_hash = newHash; // first run -> baseline silently
            patch.last_status = "no_change";
          } else if (src.last_hash !== newHash) {
            changed = true;
            patch.last_hash = newHash;
          } else {
            patch.last_status = "no_change";
          }
        } else {
          // rss / facebook_rss / instagram_rss
          const item = parseLatestItem(body);
          if (!item) {
            throw { kind: "parse_error", message: "No items found in feed" };
          }
          title = item.title;
          link = item.link;
          description = item.description;
          const key = item.link || item.title;
          if (!src.last_item_url) {
            patch.last_item_url = key; // first run -> baseline silently
            patch.last_item_title = title;
            patch.last_status = "no_change";
          } else if (src.last_item_url !== key) {
            changed = true;
            patch.last_item_url = key;
            patch.last_item_title = title;
          } else {
            patch.last_status = "no_change";
          }
        }

        if (verbose && !changed) {
          await log({ source_id: src.id, source_name: src.name, event_type: "check", status: "info", message: "Checked, no change" });
        }

        if (changed) {
          summary.updates_found++;
          patch.last_status = "changed";
          patch.last_changed_at = nowIso();
          patch.last_error = "";
          await log({
            source_id: src.id, source_name: src.name, event_type: "update_found",
            status: "success", message: "New content detected", item_title: title, item_url: link,
          });

          if (notificationsEnabled) {
            const text = renderTemplate(template, {
              name: src.name, type: src.type, title, link,
              description: (description || "").slice(0, 300), time: humanTime(),
            });
            if (!token || !chatId) {
              summary.errors++;
              await log({
                source_id: src.id, source_name: src.name, event_type: "notification_failed",
                status: "error", message: "Telegram not configured",
                error_message: !token ? "Missing TELEGRAM_BOT_TOKEN secret" : "Missing telegram_chat_id setting",
              });
            } else {
              const sent = await sendTelegram(token, chatId, text);
              if (sent.ok) {
                summary.notifications_sent++;
                await log({ source_id: src.id, source_name: src.name, event_type: "notification_sent", status: "success", message: "Telegram sent", item_title: title, item_url: link });
              } else {
                summary.errors++;
                await log({ source_id: src.id, source_name: src.name, event_type: "notification_failed", status: "error", message: "Telegram send failed", error_message: sent.error, item_title: title, item_url: link });
              }
            }
          }
        }
      } catch (err) {
        summary.errors++;
        const kind = err?.kind || "fetch_error";
        const msg = err?.message || String(err);
        patch.last_status = "error";
        patch.last_error = `${kind}: ${msg}`;
        await log({ source_id: src.id, source_name: src.name, event_type: kind, status: "error", message: "Check failed", error_message: `${kind}: ${msg}` });
      }

      await db.MonitorSource.update(src.id, patch);
      await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    }
  } finally {
    // release lock
    await db.MonitorSetting.update(settings.id, { lock_until: null });
  }

  return Response.json(summary);
});