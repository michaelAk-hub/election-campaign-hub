import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateAdminSession(base44, session_token) {
  if (!session_token) return { error: 'Missing session token', status: 401 };
  const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
  if (!sessions.length) return { error: 'Invalid session', status: 401 };
  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Session expired', status: 401 };
  }
  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) return { error: 'User not found', status: 401 };
  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Session invalidated', status: 401 };
  }
  if (user.role === 'ORGANOTIKI' && !user.is_active) return { error: 'Account disabled', status: 403 };
  if (session.last_seen_at) {
    const idleSecs = (Date.now() - new Date(session.last_seen_at)) / 1000;
    if (idleSecs > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: 'Session idle timeout', status: 401 };
    }
  }
  return { user, session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { search = '', page = 0, pageSize = 25, sortField = 'username', sortDir = 'asc' } = body;

    // Load all accounts (the entity layer doesn't support server search, so we load all and filter)
    // This is OK — ChreosiAccount table is expected to be at most a few thousand rows
    let allAccounts = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ChreosiAccount.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) break;
      allAccounts = allAccounts.concat(batch);
      skip += 500;
      if (batch.length < 500) break;
    }

    // Apply search
    let filtered = allAccounts;
    if (search) {
      const q = normalizeUsername(search);
      filtered = allAccounts.filter(a => {
        const u = normalizeUsername(a.username);
        const d = normalizeUsername(a.display_name || '');
        const ph = (a.phone || '').toLowerCase();
        return u.includes(q) || d.includes(q) || ph.includes(search.toLowerCase());
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let av = a[sortField] ?? '';
      let bv = b[sortField] ?? '';
      if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      const cmp = typeof av === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'el', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const total = filtered.length;
    const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);

    // Get available symbols from PredictionStatsBySymbol (pre-aggregated, cheap to read)
    // Fall back to scanning Person if no stats exist yet.
    const symbolSet = new Set();
    const stats = await base44.asServiceRole.entities.PredictionStatsBySymbol.list(null, 500, 0);
    if (stats && stats.length > 0) {
      for (const s of stats) {
        if (s.symbol) symbolSet.add(s.symbol);
      }
    } else {
      // Fallback: scan Person table (only if no stats cached)
      let pSkip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.Person.list(null, 500, pSkip);
        if (!batch || batch.length === 0) break;
        for (const p of batch) {
          if (p.prediction_symbol) symbolSet.add(p.prediction_symbol);
        }
        pSkip += 500;
        if (batch.length < 500) break;
      }
    }

    return Response.json({
      ok: true,
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      availableSymbols: [...symbolSet].sort(),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});