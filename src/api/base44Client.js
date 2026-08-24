// Supabase-backed replacement for the Base44 SDK client.
// Keeps the same surface the app already uses: base44.functions.invoke(...) and base44.entities.*
// so pages need no changes. Under the hood, calls go to Supabase Edge Functions.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  || 'https://tszeafgeavsupwecpkhc.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzemVhZmdlYXZzdXB3ZWNwa2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTk4OTgsImV4cCI6MjEwMzA3NTg5OH0.-L-uBOmxdCkT6rdKYI7r0cUXpUv5xNrgZbnon1uBfv0';

// Mirrors Base44's functions.invoke: resolves to { data } on 2xx, throws an
// axios-style error (err.response.data) on non-2xx — matching how pages read it.
async function invoke(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  // Functions return JSON bodies for 4xx too (e.g. { valid:false }, { success:false },
  // { error }) which pages read directly — so return those as { data }. Only throw on
  // 5xx or a missing body, matching how pages' try/catch blocks expect real failures.
  if (res.status >= 500 || (data == null && !res.ok)) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.response = { status: res.status, data };
    throw err;
  }
  return { data };
}

// Entity access mirrors the Base44 SDK surface (list/filter/get/create/update/
// delete/bulkCreate) by routing through the admin-authed `entityGateway` Edge
// Function. Without an admin session token (portal or logged-out contexts), we
// preserve the old no-op behavior so those pages don't error or leak reads.
async function entityInvoke(entity, op, args) {
  const token = localStorage.getItem('app_session_token');
  if (!token) {
    if (op === 'get') return null;
    if (op === 'list' || op === 'filter') return [];
    if (op === 'bulkCreate') return [];
    return {};
  }
  const { data } = await invoke('entityGateway', { entity, op, args, session_token: token });
  if (data?.error) {
    const err = new Error(data.error);
    if (data.force_logout) err.force_logout = true;
    throw err;
  }
  return data?.result;
}

function makeEntity(name) {
  return {
    list: (sort, limit, skip) => entityInvoke(name, 'list', [sort, limit, skip]),
    filter: (query, sort, limit, skip) => entityInvoke(name, 'filter', [query, sort, limit, skip]),
    get: (id) => entityInvoke(name, 'get', [id]),
    create: (data) => entityInvoke(name, 'create', [data]),
    bulkCreate: (rows) => entityInvoke(name, 'bulkCreate', [rows]),
    update: (id, data) => entityInvoke(name, 'update', [id, data]),
    delete: (id) => entityInvoke(name, 'delete', [id]),
    subscribe: () => () => {},
  };
}
const entities = new Proxy({}, {
  get: (_t, name) => (typeof name === 'symbol' ? undefined : makeEntity(name)),
});

const auth = {
  me: async () => { throw new Error('not authenticated'); },
  logout: () => {},
  redirectToLogin: () => {},
};

// Encode a File/Blob as a base64 data: URL. Edge Functions can fetch() a data:
// URL, so this replaces Base44's storage upload for the import flow — the file
// content rides along in the request body, no bucket needed.
async function fileToDataUrl(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const mime = file.type || 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}

// Minimal shim of Base44's Core integrations. UploadFile returns a data: URL
// (see above). ExtractDataFromUploadedFile isn't migrated yet.
const integrations = {
  Core: {
    UploadFile: async ({ file }) => ({ file_url: await fileToDataUrl(file) }),
    ExtractDataFromUploadedFile: async () => {
      throw new Error('ExtractDataFromUploadedFile is not available yet');
    },
  },
};

export const base44 = { functions: { invoke }, entities, auth, integrations };
