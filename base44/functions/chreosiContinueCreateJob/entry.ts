import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

const BATCH_SIZE = 30;
const DELAY_MS = 200;
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

    // Require valid admin session
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { jobId } = body;
    if (!jobId) return Response.json({ error: 'Missing jobId' }, { status: 400 });

    const job = await base44.asServiceRole.entities.ChreosiCreateJob.get(jobId);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (job.status === 'done' || job.status === 'error') {
      return Response.json({ ok: true, done: true, status: job.status });
    }

    // Mark running
    if (job.status !== 'running') {
      await base44.asServiceRole.entities.ChreosiCreateJob.update(jobId, { status: 'running' });
    }

    const contacts = JSON.parse(job.contacts_json || '[]');
    const results = JSON.parse(job.results_json || '[]');
    const settings = JSON.parse(job.settings_json || '{}');
    const { allowed_prediction_symbols = [], allowed_voted_statuses = [] } = settings;

    let processed = job.processed || 0;
    let created = job.created_count || 0;
    let updated = job.updated_count || 0;
    let skipped = job.skipped_count || 0;
    let failed = job.failed_count || 0;

    // Process batches in a loop until done or budget exhausted (~25s safe budget)
    const START_TIME = Date.now();
    const MAX_RUNTIME_MS = 25000; // stay well under Deno's 30s limit

    while (processed < contacts.length) {
      // Stop if we're running out of time — client will call us again
      if (Date.now() - START_TIME > MAX_RUNTIME_MS) break;

      const batch = contacts.slice(processed, processed + BATCH_SIZE);
      if (batch.length === 0) break;

      for (const contact of batch) {
        try {
          if (contact.existingId) {
            // Fetch existing account to preserve plain_password in CSV
            const existingAcc = await base44.asServiceRole.entities.ChreosiAccount.get(contact.existingId);
            await base44.asServiceRole.entities.ChreosiAccount.update(contact.existingId, {
              allowed_prediction_symbols,
              allowed_voted_statuses,
            });
            results.push({
              username: contact.existingUsername || contact.original,
              display_name: contact.original,
              plain_password: existingAcc?.plain_password || '',
              action: 'updated',
              symbols: allowed_prediction_symbols.join(', '),
              voted_statuses: allowed_voted_statuses.join(', '),
              error: '',
            });
            updated++;
          } else {
            const pw = contact.password || 'changeme';
            await base44.asServiceRole.entities.ChreosiAccount.create({
              username: contact.original,
              display_name: contact.original,
              password_hash: pw,
              plain_password: pw,
              is_active: true,
              allowed_prediction_symbols,
              allowed_voted_statuses,
              personal_note: '',
            });
            results.push({
              username: contact.original,
              display_name: contact.original,
              plain_password: pw,
              action: 'created',
              symbols: allowed_prediction_symbols.join(', '),
              voted_statuses: allowed_voted_statuses.join(', '),
              error: '',
            });
            created++;
          }
        } catch (err) {
          results.push({
            username: contact.original,
            display_name: contact.original,
            plain_password: '',
            action: 'failed',
            symbols: '',
            voted_statuses: '',
            error: err.message || String(err),
          });
          failed++;
        }
        processed++;
        await sleep(DELAY_MS);
      }

      // Persist progress after each batch
      const done = processed >= contacts.length;
      await base44.asServiceRole.entities.ChreosiCreateJob.update(jobId, {
        status: done ? 'done' : 'running',
        processed,
        created_count: created,
        updated_count: updated,
        skipped_count: skipped,
        failed_count: failed,
        results_json: JSON.stringify(results),
      });

      if (done) {
        return Response.json({
          ok: true,
          done: true,
          status: 'done',
          processed,
          total: contacts.length,
          created,
          updated,
          skipped,
          failed,
          results,
        });
      }
    }

    // Not done yet — return current progress so client can call again
    const done = processed >= contacts.length;
    await base44.asServiceRole.entities.ChreosiCreateJob.update(jobId, {
      status: done ? 'done' : 'running',
      processed,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      results_json: JSON.stringify(results),
    });

    // Return last 20 results for live failed display
    const recentResults = results.slice(-20);

    return Response.json({
      ok: true,
      done,
      status: done ? 'done' : 'running',
      processed,
      total: contacts.length,
      created,
      updated,
      skipped,
      failed,
      results: done ? results : recentResults,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});