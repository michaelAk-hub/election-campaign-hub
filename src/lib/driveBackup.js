// Client-side Google Drive backup: build each table's CSV in the browser and
// upload directly to Drive. Heavy work (fetch rows, build CSV, upload) runs in
// the browser, so it never hits the Edge Function's CPU/memory limits.
import { base44 } from '@/api/base44Client';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Live roll + scratch tables (one CSV each).
const TABLES = ['Person', 'Dataset', 'PersonScratch', 'ScratchDataset', 'ColumnDef'];

const sessionToken = () => localStorage.getItem('app_session_token');

async function fetchAllRows(entity) {
  const PAGE = 5000;
  let all = [], skip = 0;
  while (true) {
    const batch = await base44.entities[entity].list('-created_date', PAGE, skip);
    all = all.concat(batch || []);
    if (!batch || batch.length < PAGE) break;
    skip += PAGE;
  }
  return all;
}

// Flatten a table's rows into a worksheet (nested values → JSON text).
function tableToSheet(XLSX, rows) {
  const flat = rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
    return o;
  });
  return XLSX.utils.json_to_sheet(flat);
}

async function findOrCreateFolder(token, name, parentId) {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`;
  const r = await fetch(`${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Drive list ${r.status}: ${JSON.stringify(j)}`);
  if (j.files?.length) return j.files[0].id;
  const c = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const cj = await c.json();
  if (!c.ok) throw new Error(`Drive mkdir ${c.status}: ${JSON.stringify(cj)}`);
  return cj.id;
}

async function uploadBinary(token, folderId, name, bytes, mime) {
  const boundary = 'b' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const meta = JSON.stringify({ name, parents: [folderId] });
  const pre =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Blob([pre, bytes, post]); // strings + binary in one multipart body
  const res = await fetch(DRIVE_UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload (${name}) ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

// Run a full backup. onStep(msg) is called with progress messages.
export async function runDriveBackup(onStep = () => {}) {
  onStep('Σύνδεση με Google Drive...');
  const { data } = await base44.functions.invoke('driveToken', { session_token: sessionToken() });
  if (data?.error) throw new Error(data.error);
  const token = data.access_token;
  const root = data.root || 'root';

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const month = date.slice(0, 7);

  const backupFolder = await findOrCreateFolder(token, 'backup', root);
  const monthFolder = await findOrCreateFolder(token, month, backupFolder);
  const dateFolder = await findOrCreateFolder(token, date, monthFolder);

  // Build ONE .xlsx workbook with a sheet per table (in the browser).
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const results = [];
  for (const table of TABLES) {
    onStep(`Ανάγνωση: ${table}...`);
    const rows = await fetchAllRows(table);
    XLSX.utils.book_append_sheet(wb, tableToSheet(XLSX, rows), table.slice(0, 31));
    results.push({ table, rows: rows.length });
  }
  onStep('Δημιουργία αρχείου Excel...');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  onStep('Μεταφόρτωση στο Drive...');
  await uploadBinary(token, dateFolder, `backup-${date}.xlsx`, bytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  return { path: `backup/${month}/${date}/backup-${date}.xlsx`, results };
}
