import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteWithRetry(entity, id, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await entity.delete(id);
      return;
    } catch (e) {
      const errorMsg = e?.message ? e.message.toLowerCase() : String(e).toLowerCase();
      if (e?.status === 404 || errorMsg.includes('not found')) {
        return; // Already deleted — treat as success
      }
      const isRateLimit = e?.status === 429 || errorMsg.includes('rate limit');
      if (isRateLimit && i < retries - 1) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (i === retries - 1) throw e;
    }
  }
}

Deno.serve(async (req) => {
  let base44Ref = null;
  let jobRef = null;

  try {
    const base44 = createClientFromRequest(req);
    base44Ref = base44;
    const body = await req.json();

    const sessionToken = body.session_token;
    const jobId = body.job_id;

    const INTERNAL_SECRET = Deno.env.get('BASE44_APP_ID') + '_internal_resume';
    const isInternalResume = jobId && body.resume_key === INTERNAL_SECRET;

    if (!isInternalResume) {
      // Client-initiated: always require a valid ADMIN session token
      if (!sessionToken) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

      const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
      if (sessions.length === 0) return Response.json({ success: false, error: 'Invalid session' }, { status: 401 });

      const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
      if (users.length === 0 || users[0].role !== 'ADMIN') {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    let job;

    if (jobId) {
      const jobs = await base44.asServiceRole.entities.DeleteJob.filter({ id: jobId });
      if (jobs.length === 0) return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
      job = jobs[0];
      if (job.job_type !== 'delete_all_persons') {
        return Response.json({ success: false, error: 'Job type mismatch' }, { status: 400 });
      }
      if (job.status !== 'running') return Response.json({ success: true, job_id: job.id, status: job.status });
    } else {
      const countBatch = await base44.asServiceRole.entities.Person.list('created_date', 5000, 0);
      const total = countBatch.length;

      job = await base44.asServiceRole.entities.DeleteJob.create({
        job_type: 'delete_all_persons',
        status: 'running',
        total,
        deleted: 0,
        message: `Διαγραφή εγγραφών (0/${total})...`
      });
    }

    jobRef = job;

    const BATCH_SIZE = 200;
    const people = await base44.asServiceRole.entities.Person.list('created_date', BATCH_SIZE, 0);

    let batchDeleted = 0;
    for (const person of people) {
      await deleteWithRetry(base44.asServiceRole.entities.Person, person.id);
      batchDeleted++;
      await sleep(80);
    }

    const newDeleted = (job.deleted || 0) + batchDeleted;
    const total = job.total || 0;

    const remaining = await base44.asServiceRole.entities.Person.list('created_date', 1, 0);

    if (remaining.length > 0) {
      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        deleted: newDeleted,
        message: `Διαγραφή εγγραφών (${newDeleted}/${total})...`
      });

      const appId = Deno.env.get('BASE44_APP_ID');
      const fnUrl = `https://api.base44.com/api/apps/${appId}/functions/deleteAllPersons`;
      fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, resume_key: INTERNAL_SECRET })
      }).catch(e => console.error('Self-invoke failed:', e));

      // FIX 1: Small delay so the outgoing fetch is dispatched before the isolate freezes
      await sleep(50);
      return Response.json({ success: true, job_id: job.id, deleted: newDeleted, total });
    } else {
      const datasets = await base44.asServiceRole.entities.Dataset.list('-created_date', 5000, 0);
      for (const ds of datasets) {
        await deleteWithRetry(base44.asServiceRole.entities.Dataset, ds.id);
        await sleep(80);
      }

      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        status: 'done',
        deleted: newDeleted,
        message: `Ολοκληρώθηκε! Διαγράφηκαν ${newDeleted} εγγραφές και ${datasets.length} datasets.`
      });

      return Response.json({ success: true, job_id: job.id, done: true, deleted: newDeleted });
    }
  } catch (error) {
    console.error('Delete all persons error:', error);

    // FIX 2: Use jobRef captured before the error — never re-parse the consumed request body
    if (base44Ref && jobRef) {
      try {
        await base44Ref.asServiceRole.entities.DeleteJob.update(jobRef.id, {
          status: 'error',
          error: error?.message ?? String(error),
          message: `Σφάλμα: ${error?.message ?? String(error)}`
        });
      } catch (_) {}
    }

    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});