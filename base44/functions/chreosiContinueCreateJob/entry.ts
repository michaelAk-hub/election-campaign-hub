import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

const BATCH_SIZE = 30;
const DELAY_MS = 200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
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

    const batch = contacts.slice(processed, processed + BATCH_SIZE);
    if (batch.length === 0) {
      // Already done
      await base44.asServiceRole.entities.ChreosiCreateJob.update(jobId, { status: 'done' });
      return Response.json({ ok: true, done: true, status: 'done', processed, total: job.total, created, updated, skipped, failed });
    }

    for (const contact of batch) {
      try {
        if (contact.existingId) {
          // Update existing — do NOT overwrite display_name or password
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
          // Create new
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
      results: done ? results : results.slice(-10), // send last 10 for live preview, all on done
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});