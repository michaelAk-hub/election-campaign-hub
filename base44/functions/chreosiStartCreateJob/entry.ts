import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function randomPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < len; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
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

    const { allowed_prediction_symbols = [], allowed_voted_statuses = [] } = body;

    // Check for active/pending job first
    const existingJobs = await base44.asServiceRole.entities.ChreosiCreateJob.filter({ status: 'running' });
    if (existingJobs.length > 0) {
      const job = existingJobs[0];
      return Response.json({ ok: true, jobId: job.id, resumed: true, status: job.status, processed: job.processed, total: job.total });
    }
    const pendingJobs = await base44.asServiceRole.entities.ChreosiCreateJob.filter({ status: 'pending' });
    if (pendingJobs.length > 0) {
      const job = pendingJobs[0];
      return Response.json({ ok: true, jobId: job.id, resumed: true, status: job.status, processed: job.processed, total: job.total });
    }

    // Collect all unique contacts from Person table
    const contactMap = new Map(); // normalizedKey -> originalName
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Person.list(null, 500, skip);
      if (!batch || batch.length === 0) break;
      for (const p of batch) {
        for (const field of ['contact_person_1', 'contact_person_2']) {
          const raw = (p[field] || '').trim();
          if (!raw) continue;
          const norm = normalizeUsername(raw);
          if (!contactMap.has(norm)) contactMap.set(norm, raw);
        }
      }
      skip += 500;
      if (batch.length < 500) break;
    }

    // Check for duplicates — block if any
    let allAccounts = [];
    let accSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, accSkip);
      if (!batch || batch.length === 0) break;
      allAccounts = allAccounts.concat(batch);
      accSkip += 500;
      if (batch.length < 500) break;
    }

    const accountNormMap = new Map();
    for (const acc of allAccounts) {
      const norm = normalizeUsername(acc.username);
      if (!accountNormMap.has(norm)) accountNormMap.set(norm, []);
      accountNormMap.get(norm).push(acc);
    }

    const duplicates = [...accountNormMap.values()].filter(g => g.length > 1);
    if (duplicates.length > 0) {
      return Response.json({
        ok: false,
        error: 'Υπάρχουν διπλές εγγραφές. Πρέπει πρώτα να λυθούν πριν συνεχίσετε.',
        duplicateCount: duplicates.length
      }, { status: 422 });
    }

    // Build contacts list to process (normalized key, original name, existing account if any)
    const contacts = [];
    for (const [norm, originalName] of contactMap.entries()) {
      const existingList = accountNormMap.get(norm) || [];
      contacts.push({
        norm,
        original: originalName,
        existingId: existingList[0]?.id || null,
        existingUsername: existingList[0]?.username || null,
        password: existingList.length === 0 ? randomPassword() : null, // pre-generate password for new accounts
      });
    }

    const settings = { allowed_prediction_symbols, allowed_voted_statuses };

    // Create the job
    const job = await base44.asServiceRole.entities.ChreosiCreateJob.create({
      status: 'pending',
      total: contacts.length,
      processed: 0,
      created_count: 0,
      updated_count: 0,
      skipped_count: 0,
      failed_count: 0,
      contacts_json: JSON.stringify(contacts),
      results_json: JSON.stringify([]),
      settings_json: JSON.stringify(settings),
      started_by: auth.user.id,
    });

    return Response.json({ ok: true, jobId: job.id, resumed: false, total: contacts.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});