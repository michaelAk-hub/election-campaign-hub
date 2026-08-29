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

function buildCsv(rows) {
  const keySet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
  const keys = Array.from(keySet);
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [keys.join(',')];
  for (const r of rows) lines.push(keys.map(k => esc(r[k])).join(','));
  return '﻿' + lines.join('\r\n'); // BOM → Greek-safe, opens in Excel
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

async function uploadCsv(token, folderId, name, text) {
  const boundary = 'b' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n${text}\r\n` +
    `--${boundary}--`;
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

  const results = [];
  for (const table of TABLES) {
    onStep(`Αντίγραφο: ${table}...`);
    const rows = await fetchAllRows(table);
    await uploadCsv(token, dateFolder, `${table}.csv`, buildCsv(rows));
    results.push({ table, rows: rows.length });
  }
  return { path: `backup/${month}/${date}/`, results };
}
