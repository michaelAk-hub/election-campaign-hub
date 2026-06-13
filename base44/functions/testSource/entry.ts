// functions/testSource/entry.ts
// Dry-run a single source: fetch it, show what would be detected, WITHOUT saving
// or sending a notification. Called from the dashboard:
//   await base44.functions.invoke("testSource", { sourceId, session_token })
//
// Auth: matches the app's custom session layer (AppSession -> AppUser role).
// Allowed roles: ADMIN, ORGANOTIKI.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { XMLParser } from "npm:fast-xml-parser@4";
import { load } from "npm:cheerio@1.0.0";

const USER_AGENT = "Mozilla/5.0 (compatible; NewsMonitorBot/1.0; +https://base44.app)";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

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
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xml,application/rss+xml;q=0.9,*/*;q=0.8" },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      throw new Error(aborted ? "Request timed out" : String(e));
    }
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}` + (res.status === 403 || res.status === 429 ? " (blocked)" : ""));
    return { status: res.status, body: await res.text() };
  }
  throw new Error("Too many redirects");
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
function textOf(v) { return v == null ? "" : typeof v === "string" ? v : v["#text"] || String(v); }
function pickLink(item) {
  if (typeof item.link === "string") return item.link;
  if (Array.isArray(item.link)) { const a = item.link.find((l) => l["@_rel"] === "alternate") || item.link[0]; return a?.["@_href"] || a?.["#text"] || ""; }
  if (item.link?.["@_href"]) return item.link["@_href"];
  if (item.guid) return typeof item.guid === "string" ? item.guid : item.guid["#text"] || "";
  return item.id ? String(item.id) : "";
}
function parseLatestItem(xml) {
  const doc = xmlParser.parse(xml);
  let items = doc?.rss?.channel?.item || doc?.feed?.entry || doc?.["rdf:RDF"]?.item;
  if (!items) return null;
  const arr = Array.isArray(items) ? items : [items];
  if (!arr.length) return null;
  const it = arr[0];
  return { title: textOf(it.title) || "(no title)", link: pickLink(it), itemCount: arr.length };
}
function extractWebsiteText(html, selector) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();
  let scope = selector && selector.trim() ? $(selector) : $("body");
  if (scope.length === 0) scope = $("body");
  return (scope.text ? scope.text() : "").replace(/\s+/g, " ").trim();
}
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { sourceId, session_token } = await req.json().catch(() => ({}));

    // --- auth: custom session layer (AppSession -> AppUser role) ---
    if (!session_token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (sessions.length === 0) return Response.json({ ok: false, error: "Invalid session" }, { status: 401 });
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
    if (users.length === 0 || !["ADMIN", "ORGANOTIKI"].includes(users[0].role)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!sourceId) return Response.json({ ok: false, error: "sourceId is required" }, { status: 400 });

    const src = await base44.asServiceRole.entities.MonitorSource.get(sourceId);
    if (!src) return Response.json({ ok: false, error: "Source not found" }, { status: 404 });

    const { status, body } = await safeFetch(src.url);

    if (src.type === "website") {
      const text = extractWebsiteText(body, src.css_selector);
      const hash = await sha256(text);
      const selectorMatched = !(src.css_selector && src.css_selector.trim()) || load(body)(src.css_selector).length > 0;
      return Response.json({
        ok: true, type: src.type, http_status: status,
        selector_matched: selectorMatched,
        extracted_chars: text.length,
        preview: text.slice(0, 200),
        fingerprint: hash,
        would_notify: !!src.last_hash && src.last_hash !== hash,
      });
    } else {
      const item = parseLatestItem(body);
      if (!item) return Response.json({ ok: false, type: src.type, http_status: status, error: "No items found in feed" });
      return Response.json({
        ok: true, type: src.type, http_status: status,
        items_in_feed: item.itemCount,
        latest_title: item.title,
        latest_link: item.link,
        would_notify: !!src.last_item_url && src.last_item_url !== (item.link || item.title),
      });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 200 });
  }
});