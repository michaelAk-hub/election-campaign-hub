import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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

    // keeperId: the account to keep
    // mergeIds: array of account IDs to merge into keeper and then delete
    const { keeperId, mergeIds = [] } = body;
    if (!keeperId || !mergeIds.length) {
      return Response.json({ error: 'keeperId and mergeIds required' }, { status: 400 });
    }

    const keeper = await base44.asServiceRole.entities.ChreosiAccount.get(keeperId);
    if (!keeper) return Response.json({ error: 'Keeper account not found' }, { status: 404 });

    const mergeAccounts = [];
    for (const mid of mergeIds) {
      const acc = await base44.asServiceRole.entities.ChreosiAccount.get(mid);
      if (acc) mergeAccounts.push(acc);
    }

    // Compute merged values
    const allAccounts = [keeper, ...mergeAccounts];
    const mergedPhone = keeper.phone || mergeAccounts.map(a => a.phone).find(p => p) || '';
    const mergedIsActive = allAccounts.some(a => a.is_active);
    const symbolUnion = [...new Set(allAccounts.flatMap(a => a.allowed_prediction_symbols || []))];
    const votedUnion = [...new Set(allAccounts.flatMap(a => a.allowed_voted_statuses || []))];
    const notesParts = allAccounts.map(a => a.personal_note).filter(Boolean);
    const mergedNote = notesParts.join('\n---\n');

    // Update keeper
    await base44.asServiceRole.entities.ChreosiAccount.update(keeperId, {
      phone: mergedPhone,
      is_active: mergedIsActive,
      allowed_prediction_symbols: symbolUnion,
      allowed_voted_statuses: votedUnion,
      personal_note: mergedNote,
    });

    // Rewrite Person assignments for each merged-away username
    let personPagesSkip = 0;
    const personUpdateErrors = [];
    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, 500, personPagesSkip);
      if (!batch || batch.length === 0) break;

      for (const person of batch) {
        const mergedUsernames = new Set(mergeAccounts.map(a => normalizeUsername(a.username)));
        let changed = false;
        const updates = {};

        if (person.contact_person_1 && mergedUsernames.has(normalizeUsername(person.contact_person_1))) {
          updates.contact_person_1 = keeper.username;
          changed = true;
        }
        if (person.contact_person_2 && mergedUsernames.has(normalizeUsername(person.contact_person_2))) {
          updates.contact_person_2 = keeper.username;
          changed = true;
        }

        if (changed) {
          try {
            await base44.asServiceRole.entities.Person.update(person.id, updates);
            await sleep(100);
          } catch (err) {
            personUpdateErrors.push({ personId: person.id, error: err.message });
          }
        }
      }

      personPagesSkip += 500;
      if (batch.length < 500) break;
    }

    // Invalidate portal sessions for merged-away usernames
    for (const acc of mergeAccounts) {
      const sessions = await base44.asServiceRole.entities.PortalSession.filter({
        username: acc.username, portal_type: 'chreosi', is_active: true
      });
      for (const s of sessions) {
        await base44.asServiceRole.entities.PortalSession.update(s.id, { is_active: false });
        await sleep(50);
      }
    }

    // Delete merged-away accounts
    for (const acc of mergeAccounts) {
      await base44.asServiceRole.entities.ChreosiAccount.delete(acc.id);
      await sleep(100);
    }

    return Response.json({
      ok: true,
      keeperId,
      mergedCount: mergeAccounts.length,
      personUpdateErrors,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});