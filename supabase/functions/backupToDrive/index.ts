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

// Tables worth backing up (data, not transient sessions/challenges/throttle).
const TABLES = [
  "Person", "Dataset", "ColumnDef", "ScratchDataset", "PersonScratch",
  "ChreosiAccount", "KanaliAccount", "ChreosiCheckmark",
  "AppUser", "SavedQuery", "PredictionScenario", "PredictionVoteFlowConfig",
  "KanaliSubmission", "NotFoundVoter", "SmsLog",
  "Notification", "NotificationPreference",
];

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

    // Build ONE workbook with a sheet per table (one write, one upload — far
    // lighter on CPU/memory than 17 separate .xlsx files).
    const wb = XLSX.utils.book_new();
    const results: { table: string; rows: number; ok: boolean; error?: string }[] = [];
    for (const table of TABLES) {
      try {
        const rows = await fetchAll(supabase, table);
        const ws = tableToSheet(rows);
        // Sheet names are capped at 31 chars and can't contain []:*?/\.
        const sheetName = table.replace(/[\[\]:*?/\\]/g, "_").slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        results.push({ table, rows: rows.length, ok: true });
      } catch (e) {
        results.push({ table, rows: 0, ok: false, error: (e as Error).message });
      }
    }

    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    await uploadFile(token, folderId, `backup-${date}.xlsx`, bytes, XLSX_MIME);

    const failed = results.filter((r) => !r.ok);
    return json({
      success: failed.length === 0,
      path: `backup/${month}/${date}/backup-${date}.xlsx`,
      tables: results.length,
      uploaded: results.length - failed.length,
      failed: failed.length,
      results,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
