// gdrive.ts — minimal Google Drive helper for backups.
// Uses a stored OAuth2 refresh token (consumer Gmail friendly): the deployed
// function exchanges it for a short-lived access token, then finds/creates
// folders and uploads files. Files are owned by the user who consented.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

export async function getAccessToken(): Promise<string> {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID");
  const client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refresh_token = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error("Λείπουν τα Google credentials (GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN)");
  }
  const body = new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${res.status} ${JSON.stringify(j)}`);
  return j.access_token as string;
}

const esc = (s: string) => s.replace(/'/g, "\\'");

// Find a folder by name under a parent, or create it. Returns its id.
export async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = `name='${esc(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const res = await fetch(`${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Drive list error: ${res.status} ${JSON.stringify(j)}`);
  if (j.files?.length) return j.files[0].id;

  const create = await fetch(`${FILES_URL}?fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const cj = await create.json();
  if (!create.ok) throw new Error(`Drive folder create error: ${create.status} ${JSON.stringify(cj)}`);
  return cj.id;
}

// Ensure backup/<month>/<date> exists under the configured root; return the date folder id.
export async function ensureBackupPath(token: string, month: string, date: string): Promise<string> {
  const root = Deno.env.get("GOOGLE_DRIVE_ROOT") || "root";
  const backup = await findOrCreateFolder(token, "backup", root);
  const monthFolder = await findOrCreateFolder(token, month, backup);
  return await findOrCreateFolder(token, date, monthFolder);
}

// Upload one binary file into a folder (multipart). Returns the new file id.
export async function uploadFile(
  token: string, folderId: string, name: string, bytes: Uint8Array, mime: string,
): Promise<string> {
  const boundary = "b" + crypto.randomUUID().replace(/-/g, "");
  const meta = JSON.stringify({ name, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const payload = new Uint8Array(head.length + bytes.length + tail.length);
  payload.set(head, 0); payload.set(bytes, head.length); payload.set(tail, head.length + bytes.length);

  const res = await fetch(`${UPLOAD_URL}&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: payload,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Drive upload error (${name}): ${res.status} ${JSON.stringify(j)}`);
  return j.id;
}
