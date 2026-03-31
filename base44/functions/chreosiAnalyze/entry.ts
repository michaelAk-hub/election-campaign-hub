import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Shared normalization — same rule everywhere
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    // Collect ALL unique normalized contact names from Person table
    const contactMap = new Map(); // normalizedKey -> original display name (first seen)
    let skip = 0;
    const pageSize = 500;
    let totalPersons = 0;
    let skippedEmpty = 0;

    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, pageSize, skip);
      if (!batch || batch.length === 0) break;
      totalPersons += batch.length;
      for (const p of batch) {
        for (const field of ['contact_person_1', 'contact_person_2']) {
          const raw = (p[field] || '').trim();
          if (!raw) { skippedEmpty++; continue; }
          const norm = normalizeUsername(raw);
          if (!contactMap.has(norm)) contactMap.set(norm, raw);
        }
      }
      skip += pageSize;
      if (batch.length < pageSize) break;
    }

    // Collect ALL existing ChreosiAccount rows
    let allAccounts = [];
    let accSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, accSkip);
      if (!batch || batch.length === 0) break;
      allAccounts = allAccounts.concat(batch);
      accSkip += 500;
      if (batch.length < 500) break;
    }

    // Build normalized account map — detect duplicates
    const accountNormMap = new Map(); // normalizedKey -> [account, ...]
    for (const acc of allAccounts) {
      const norm = normalizeUsername(acc.username);
      if (!accountNormMap.has(norm)) accountNormMap.set(norm, []);
      accountNormMap.get(norm).push(acc);
    }

    // Detect duplicate groups (same normalized key, multiple rows)
    const duplicateGroups = [];
    for (const [norm, accs] of accountNormMap.entries()) {
      if (accs.length > 1) {
        duplicateGroups.push({ normalizedKey: norm, accounts: accs });
      }
    }

    // Compute per-contact analysis
    const newAccounts = [];
    const existingAccounts = [];
    const accountsNeedingReview = []; // have empty symbols or voted_statuses

    for (const [norm, originalName] of contactMap.entries()) {
      const existing = accountNormMap.get(norm) || [];
      if (existing.length === 0) {
        newAccounts.push(norm);
      } else {
        const acc = existing[0]; // use first if duplicates (merge should have resolved)
        existingAccounts.push(norm);
        if (!acc.allowed_prediction_symbols?.length || !acc.allowed_voted_statuses?.length) {
          accountsNeedingReview.push({ username: acc.username, id: acc.id });
        }
      }
    }

    // Extra accounts — have ChreosiAccount but no matching contact in Person
    const extraAccounts = [];
    for (const [norm, accs] of accountNormMap.entries()) {
      if (!contactMap.has(norm)) {
        extraAccounts.push({ normalizedKey: norm, accounts: accs.map(a => ({ id: a.id, username: a.username })) });
      }
    }

    // Collect available prediction symbols from Person table
    const symbolSet = new Set();
    let symSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, 500, symSkip);
      if (!batch || batch.length === 0) break;
      for (const p of batch) {
        if (p.prediction_symbol) symbolSet.add(p.prediction_symbol);
      }
      symSkip += 500;
      if (batch.length < 500) break;
    }

    return Response.json({
      ok: true,
      totalPersons,
      skippedEmptyNames: skippedEmpty,
      totalUniqueContacts: contactMap.size,
      existingAccountsCount: existingAccounts.length,
      newAccountsCount: newAccounts.length,
      totalAccountRows: allAccounts.length,
      duplicateGroups,
      extraAccounts,
      accountsNeedingReview,
      hasDuplicates: duplicateGroups.length > 0,
      availableSymbols: [...symbolSet].sort(),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});