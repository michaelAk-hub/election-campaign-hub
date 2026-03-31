import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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
    return { error: 'Session invalidated', status: 401, force_logout: true };
  }
  if (user.role === 'ORGANOTIKI' && !user.is_active) return { error: 'Account disabled', status: 403 };
  if (session.last_seen_at) {
    const idleSecs = (Date.now() - new Date(session.last_seen_at)) / 1000;
    if (idleSecs > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: 'Session idle timeout', status: 401, reason: 'idle_timeout' };
    }
  }
  return { user, session };
}

// Given a list of account IDs, return only the Person rows needed for printing those accounts.
// We load all Person rows server-side (they're needed for filtering anyway) and return only relevant ones.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { accountIds = [] } = body;
    if (!accountIds.length) return Response.json({ ok: true, people: [] });

    // Fetch the requested accounts
    const accounts = [];
    for (const id of accountIds) {
      try {
        const acc = await base44.asServiceRole.entities.ChreosiAccount.get(id);
        if (acc) accounts.push(acc);
      } catch {}
    }

    // Build the set of normalized usernames we need people for
    const normalizeUsername = (str) => {
      if (!str) return '';
      return str.trim().replace(/\s+/g, ' ').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
    };

    const usernameSet = new Set(accounts.map(a => normalizeUsername(a.username)));

    // Collect only relevant Person rows
    const people = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, 500, skip);
      if (!batch || batch.length === 0) break;
      for (const p of batch) {
        const cp1 = normalizeUsername(p.contact_person_1);
        const cp2 = normalizeUsername(p.contact_person_2);
        if (usernameSet.has(cp1) || usernameSet.has(cp2)) {
          people.push(p);
        }
      }
      skip += 500;
      if (batch.length < 500) break;
    }

    return Response.json({ ok: true, people, accounts });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});