// backupToDrive — export the live roll + scratch tables to CSV and upload to
// Google Drive under backup/<YYYY-MM>/<YYYY-MM-DD>/. CSV is built with plain
// string concatenation (cheap — no SheetJS), so it stays within the Edge
// Function's CPU/memory limits at any table size. UTF-8 BOM keeps Greek intact
// and lets the files open directly in Excel.
// Auth: an ADMIN session (manual button) OR a matching cron_secret (daily job).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getAccessToken, ensureBackupPath, uploadFile } from "../_shared/gdrive.ts";

const CSV_MIME = "text/csv; charset=utf-8";

// Live roll + scratch tables (per request). One CSV per table.
const TABLES = ["Person", "Dataset", "PersonScratch", "ScratchDataset", "ColumnDef"];

// One table → CSV bytes (UTF-8 with BOM). Nested values (e.g. custom_data) are
// JSON-stringified into a single cell so nothing is lost.
function tableToCsv(rows: any[]): Uint8Array {
  const keySet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
  const keys = Array.from(keySet);
  const esc = (v: any): string => {
    let s = v === null || v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines: string[] = [keys.join(",")];
  for (const r of rows) lines.push(keys.map((k) => esc(r[k])).join(","));
  return new TextEncoder().encode("﻿" + lines.join("\r\n"));
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));

    // Auth: cron secret (scheduled) or an ADMIN session (manual).
    const cronSecret = Deno.env.get("BACKUP_CRON_SECRET");
    const isCron = cronSecret && body.cron_secret === cronSecret;
    if (!isCron) {
      const auth = await strictAuth(supabase, body.session_token);
      if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);
      if (auth.user.role !== "ADMIN") return json({ error: "Μόνο διαχειριστές" }, 403);
    }

    // Date parts in Cyprus local time (YYYY-MM-DD via en-CA).
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Nicosia", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const month = date.slice(0, 7);

    const token = await getAccessToken();
    const folderId = await ensureBackupPath(token, month, date);

    const results: { table: string; rows: number; ok: boolean; error?: string }[] = [];
    for (const table of TABLES) {
      try {
        const rows = await fetchAll(supabase, table);
        const bytes = tableToCsv(rows);
        await uploadFile(token, folderId, `${table}.csv`, bytes, CSV_MIME);
        results.push({ table, rows: rows.length, ok: true });
      } catch (e) {
        results.push({ table, rows: 0, ok: false, error: (e as Error).message });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return json({
      success: failed.length === 0,
      path: `backup/${month}/${date}/`,
      tables: results.length,
      uploaded: results.length - failed.length,
      failed: failed.length,
      results,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
