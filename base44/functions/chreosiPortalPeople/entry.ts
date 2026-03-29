import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

async function validatePortalSession(base44, sessionToken, username, portalType) {
  if (!sessionToken || !username) return { error: 'Missing credentials', status: 401 };
  const sessions = await base44.asServiceRole.entities.PortalSession.filter({
    session_token: sessionToken, username, portal_type: portalType, is_active: true
  });
  if (!sessions.length) return { error: 'Invalid session', status: 401 };
  const session = sessions[0];
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.PortalSession.update(session.id, { is_active: false });
    return { error: 'Session expired', status: 401 };
  }
  return { session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { session_token, username, search = '', dept_filter = 'all', year_filter = 'all', voted_tab = 'all' } = body;

    const authResult = await validatePortalSession(base44, session_token, username, 'chreosi');
    if (authResult.error) return Response.json({ error: authResult.error }, { status: authResult.status });

    // Load the chreosi account to get allowed symbols and voted statuses
    const normalizedUsername = normalizeUsername(username);
    const accounts = await base44.asServiceRole.entities.ChreosiAccount.filter({ username });
    let account = accounts[0] || null;

    // Try normalized match if exact doesn't find
    if (!account) {
      let allAccs = [];
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, skip);
        if (!batch || batch.length === 0) break;
        allAccs = allAccs.concat(batch);
        skip += 500;
        if (batch.length < 500) break;
      }
      account = allAccs.find(a => normalizeUsername(a.username) === normalizedUsername) || null;
    }

    if (!account) return Response.json({ error: 'Account not found', status: 404 });

    const allowedSymbols = account.allowed_prediction_symbols || [];
    const allowedVotedStatuses = account.allowed_voted_statuses || [];

    // Empty either array = no records
    if (!allowedSymbols.length || !allowedVotedStatuses.length) {
      return Response.json({ ok: true, people: [], account, totalCount: 0 });
    }

    // Fetch and filter Person records server-side
    const result = [];
    let pSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, 500, pSkip);
      if (!batch || batch.length === 0) break;

      for (const p of batch) {
        // Assignment match — normalized
        const cp1 = normalizeUsername(p.contact_person_1 || '');
        const cp2 = normalizeUsername(p.contact_person_2 || '');
        if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) continue;

        // Allowed symbols
        if (!allowedSymbols.includes(p.prediction_symbol)) continue;

        // Allowed voted statuses
        const votedStr = p.voted === true ? 'true' : 'false';
        if (!allowedVotedStatuses.includes(votedStr)) continue;

        // Voted tab filter
        if (voted_tab === 'voted' && !p.voted) continue;
        if (voted_tab === 'not_voted' && p.voted) continue;

        // Department filter
        if (dept_filter !== 'all' && p.department !== dept_filter) continue;

        // Year filter
        if (year_filter !== 'all' && p.admission_year !== year_filter) continue;

        // Search
        if (search) {
          const q = search.toLowerCase();
          const matches = (p.first_name || '').toLowerCase().includes(q)
            || (p.last_name || '').toLowerCase().includes(q)
            || (p.mobile_phone || '').includes(search);
          if (!matches) continue;
        }

        result.push(p);
      }

      pSkip += 500;
      if (batch.length < 500) break;
    }

    // Compute available filter options from result set (before search/tab filter for dept/year combos)
    const depts = [...new Set(result.map(p => p.department).filter(Boolean))].sort();
    const years = [...new Set(result.map(p => p.admission_year).filter(Boolean))].sort();

    return Response.json({
      ok: true,
      people: result,
      totalCount: result.length,
      account,
      availableDepts: depts,
      availableYears: years,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});