import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Validate a portal session and return the canonical session record
async function validatePortalSession(base44, session_token) {
  if (!session_token) return { error: 'Missing session token', status: 401 };

  // Fetch all active sessions with this token (ignore username filter — resolve from DB)
  const sessions = await base44.asServiceRole.entities.PortalSession.filter({
    session_token,
    is_active: true,
  });
  if (!sessions.length) return { error: 'Invalid or expired session', status: 401 };

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
    const { action, session_token } = body;

    const authResult = await validatePortalSession(base44, session_token);
    if (authResult.error) return Response.json({ error: authResult.error }, { status: authResult.status });

    const session = authResult.session;
    const portalType = session.portal_type;
    const canonicalUsername = session.username; // as stored in DB (normalized at login time)

    // ── Save personal note (Chreosi only) ──
    if (action === 'save_personal_note') {
      if (portalType !== 'chreosi') return Response.json({ error: 'Not a chreosi session' }, { status: 403 });
      const { note } = body;

      // Find account by normalized username
      let account = null;
      const normUser = normalizeUsername(canonicalUsername);
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, skip);
        if (!batch || batch.length === 0) break;
        account = batch.find(a => normalizeUsername(a.username) === normUser) || null;
        if (account) break;
        skip += 500;
        if (batch.length < 500) break;
      }
      if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });

      await base44.asServiceRole.entities.ChreosiAccount.update(account.id, { personal_note: note ?? '' });
      return Response.json({ ok: true });
    }

    // ── Update person notes ──
    if (action === 'update_person_note') {
      if (portalType !== 'chreosi') return Response.json({ error: 'Not a chreosi session' }, { status: 403 });
      const { person_id, notes } = body;
      if (!person_id) return Response.json({ error: 'person_id required' }, { status: 400 });

      // Verify the person is actually assigned to this user
      const person = await base44.asServiceRole.entities.Person.get(person_id);
      if (!person) return Response.json({ error: 'Person not found' }, { status: 404 });

      const normUser = normalizeUsername(canonicalUsername);
      const cp1 = normalizeUsername(person.contact_person_1 || '');
      const cp2 = normalizeUsername(person.contact_person_2 || '');
      if (cp1 !== normUser && cp2 !== normUser) {
        return Response.json({ error: 'Access denied: person not assigned to you' }, { status: 403 });
      }

      await base44.asServiceRole.entities.Person.update(person_id, { notes: notes ?? '' });
      return Response.json({ ok: true });
    }

    // ── Toggle checkmark ──
    if (action === 'toggle_checkmark') {
      if (portalType !== 'chreosi') return Response.json({ error: 'Not a chreosi session' }, { status: 403 });
      const { person_id, checked } = body;
      if (!person_id) return Response.json({ error: 'person_id required' }, { status: 400 });

      // Find existing checkmark by canonical username + person_id
      const existing = await base44.asServiceRole.entities.ChreosiCheckmark.filter({
        chreosi_username: canonicalUsername,
        person_record_id: person_id,
      });

      if (existing.length > 0) {
        await base44.asServiceRole.entities.ChreosiCheckmark.update(existing[0].id, { checked: !!checked });
      } else {
        // Also try normalized match
        const allChecks = await base44.asServiceRole.entities.ChreosiCheckmark.filter({ person_record_id: person_id });
        const normUser = normalizeUsername(canonicalUsername);
        const match = allChecks.find(c => normalizeUsername(c.chreosi_username) === normUser);
        if (match) {
          await base44.asServiceRole.entities.ChreosiCheckmark.update(match.id, { checked: !!checked });
        } else {
          await base44.asServiceRole.entities.ChreosiCheckmark.create({
            chreosi_username: canonicalUsername,
            person_record_id: person_id,
            checked: !!checked,
          });
        }
      }
      return Response.json({ ok: true });
    }

    // ── Deactivate self (portal account deactivation) ──
    if (action === 'deactivate_self') {
      const normUser = normalizeUsername(canonicalUsername);

      if (portalType === 'chreosi') {
        // Scan all chreosi accounts to find by normalized username
        let account = null;
        let skip = 0;
        while (true) {
          const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, skip);
          if (!batch || batch.length === 0) break;
          account = batch.find(a => normalizeUsername(a.username) === normUser) || null;
          if (account) break;
          skip += 500;
          if (batch.length < 500) break;
        }
        if (account) {
          await base44.asServiceRole.entities.ChreosiAccount.update(account.id, { is_active: false });
        }
      } else if (portalType === 'kanali') {
        let account = null;
        let skip = 0;
        while (true) {
          const batch = await base44.asServiceRole.entities.KanaliAccount.list(null, 500, skip);
          if (!batch || batch.length === 0) break;
          account = batch.find(a => normalizeUsername(a.username) === normUser) || null;
          if (account) break;
          skip += 500;
          if (batch.length < 500) break;
        }
        if (account) {
          await base44.asServiceRole.entities.KanaliAccount.update(account.id, { is_active: false });
        }
      }

      // Invalidate the current portal session
      await base44.asServiceRole.entities.PortalSession.update(session.id, { is_active: false });
      // Also invalidate any other active sessions for this user
      let sesBatch = [];
      let sesSkip = 0;
      while (true) {
        sesBatch = await base44.asServiceRole.entities.PortalSession.filter(
          { portal_type: portalType, is_active: true }, null, 200, sesSkip
        );
        if (!sesBatch || sesBatch.length === 0) break;
        for (const s of sesBatch) {
          if (normalizeUsername(s.username) === normUser && s.id !== session.id) {
            await base44.asServiceRole.entities.PortalSession.update(s.id, { is_active: false });
            await sleep(30);
          }
        }
        sesSkip += 200;
        if (sesBatch.length < 200) break;
      }

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});