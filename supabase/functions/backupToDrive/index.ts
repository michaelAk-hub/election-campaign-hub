// backupToDrive — export every important table to .xlsx and upload to Google
// Drive under backup/<YYYY-MM>/<YYYY-MM-DD>/. Greek is preserved (xlsx is UTF-8).
// Auth: an ADMIN session (manual button) OR a matching cron_secret (daily job).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { fetchAll } from "../_shared/db.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getAccessToken, ensureBackupPath, uploadFile } from "../_shared/gdrive.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Backed up (per request: live roll + scratch tables only — also keeps the job
// within the Edge Function's limits):
//   live-<date>.xlsx    → Person (live roll), Dataset (roll metadata)
//   scratch-<date>.xlsx → PersonScratch (rows), ScratchDataset (registry),
//                         ColumnDef (per-table column schemas)

// Flatten a table's rows: nested values (e.g. custom_data) → JSON text so nothing
// is lost. Returns a worksheet ready to append to a workbook.
function tableToSheet(rows: any[]) {
  const flat = rows.map((r) => {
    const o: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      o[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return o;
  });
  return XLSX.utils.json_to_sheet(flat);
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

    // Build one workbook (a sheet per table) from a set of tables, then upload it.
    // Splitting live vs scratch keeps each XLSX.write small so we stay within the
    // Edge Function's CPU/memory limits even with large rolls.
    const backupGroup = async (fileName: string, tables: string[]) => {
      const wb = XLSX.utils.book_new();
      let any = false;
      for (const table of tables) {
        try {
          const rows = await fetchAll(supabase, table);
          const sheetName = table.replace(/[\[\]:*?/\\]/g, "_").slice(0, 31);
          XLSX.utils.book_append_sheet(wb, tableToSheet(rows), sheetName);
          any = true;
          results.push({ table, rows: rows.length, ok: true });
        } catch (e) {
          results.push({ table, rows: 0, ok: false, error: (e as Error).message });
        }
      }
      if (!any) return;
      const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      await uploadFile(token, folderId, fileName, bytes, XLSX_MIME);
    };

    await backupGroup(`live-${date}.xlsx`, ["Person", "Dataset"]);
    await backupGroup(`scratch-${date}.xlsx`, ["PersonScratch", "ScratchDataset", "ColumnDef"]);

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
