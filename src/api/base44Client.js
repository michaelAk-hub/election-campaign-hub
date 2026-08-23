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
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.response = { status: res.status, data };
    throw err;
  }
  return { data };
}

// Direct entity access from the browser is not wired yet (everything goes through
// Edge Functions). These no-ops keep pages that reference entities from crashing.
const noopEntity = {
  filter: async () => [],
  list: async () => [],
  get: async () => null,
  create: async () => ({}),
  update: async () => ({}),
  delete: async () => ({}),
  subscribe: () => () => {},
};
const entities = new Proxy({}, { get: () => noopEntity });

const auth = {
  me: async () => { throw new Error('not authenticated'); },
  logout: () => {},
  redirectToLogin: () => {},
};

export const base44 = { functions: { invoke }, entities, auth };
