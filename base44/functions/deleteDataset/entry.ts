import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BATCH_SIZE = 150;


async function deleteWithRetry(entity, id, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      await entity.delete(id);
      return;
    } catch (e) {
      const errorMsg = e?.message || String(e);
      if (e?.status === 404 || errorMsg.includes('not found')) {
        return; // Already deleted — treat as success
      }
      if (e?.status === 429 && i < retries - 1) {
        await sleep(700 * (i + 1));
      } else {
        if (i === retries - 1) throw e;
      }
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
    const jobId = body.job_id;

    let job;

    const INTERNAL_SECRET = Deno.env.get('BASE44_APP_ID') + '_internal_resume';
    const isInternalResume = jobId && body.resume_key === INTERNAL_SECRET;

    if (isInternalResume) {
      // ── Server-to-server resume (fire-and-forget self-invoke) ─────────────
      const jobs = await base44.asServiceRole.entities.DeleteJob.filter({ id: jobId });
      if (jobs.length === 0) return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
      job = jobs[0];
      if (job.job_type !== 'delete_dataset') {
        return Response.json({ success: false, error: 'Job type mismatch' }, { status: 400 });
      }
      if (job.status !== 'running') {
        return Response.json({ success: true, job_id: job.id, status: job.status });
      }
    } else {
      // ── Client-initiated call (new job OR watchdog resume) ────────────────
      // FIX 3: Always validate session token for any client-initiated request
      const sessionToken = body.session_token;
      if (!sessionToken) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

      const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
      if (sessions.length === 0) return Response.json({ success: false, error: 'Invalid session' }, { status: 401 });

      const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
      if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }

      if (jobId) {
        // Watchdog resume from the frontend — just re-attach to the running job
        const jobs = await base44.asServiceRole.entities.DeleteJob.filter({ id: jobId });
        if (jobs.length === 0) return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
        job = jobs[0];
        if (job.job_type !== 'delete_dataset') {
          return Response.json({ success: false, error: 'Job type mismatch' }, { status: 400 });
        }
        if (job.status !== 'running') {
          return Response.json({ success: true, job_id: job.id, status: job.status });
        }
      } else {
        // New job
        const dataset_id = body.dataset_id;
        if (!dataset_id) return Response.json({ success: false, error: 'dataset_id is required' }, { status: 400 });

        const countBatch = await base44.asServiceRole.entities.Person.filter({ dataset_id }, 'created_date', 5000, 0);
        const total = countBatch.length;

        job = await base44.asServiceRole.entities.DeleteJob.create({
          job_type: 'delete_dataset',
          status: 'running',
          total,
          deleted: 0,
          dataset_id,
          message: `Διαγραφή εγγραφών dataset (0/${total})...`
        });
      }
    }

    jobRef = job;
    const dataset_id = job.dataset_id;

    // ── Process one batch ─────────────────────────────────────────────────
    const people = await base44.asServiceRole.entities.Person.filter({ dataset_id }, 'created_date', BATCH_SIZE, 0);

    let batchDeleted = 0;
    for (const person of people) {
      await deleteWithRetry(base44.asServiceRole.entities.Person, person.id);
      batchDeleted++;
      await sleep(40);
    }

    const newDeleted = (job.deleted || 0) + batchDeleted;
    const total = job.total || 0;

    // Check if any persons remain for this dataset
    const remaining = await base44.asServiceRole.entities.Person.filter({ dataset_id }, 'created_date', 1, 0);

    if (remaining.length > 0) {
      // ── More to delete: update progress and self-invoke ──────────────────
      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        deleted: newDeleted,
        message: `Διαγραφή εγγραφών dataset (${newDeleted}/${total})...`
      });

      const appId = Deno.env.get('BASE44_APP_ID');
      const fnUrl = `https://api.base44.com/api/apps/${appId}/functions/deleteDataset`;
      const INTERNAL_SECRET = Deno.env.get('BASE44_APP_ID') + '_internal_resume';
      fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, resume_key: INTERNAL_SECRET })
      }).catch(e => console.error('Self-invoke failed:', e));

      // FIX 1: Small delay so the outgoing fetch is dispatched before the isolate freezes
      await sleep(50);
      return Response.json({ success: true, job_id: job.id, deleted: newDeleted, total });
    } else {
      // ── All persons deleted — remove the dataset record itself ────────────
      try {
        await deleteWithRetry(base44.asServiceRole.entities.Dataset, dataset_id);
      } catch (e) {
        console.error('Dataset record delete failed (may already be removed):', e);
      }

      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        status: 'done',
        deleted: newDeleted,
        message: `Ολοκληρώθηκε! Διαγράφηκαν ${newDeleted} εγγραφές και το dataset αφαιρέθηκε.`
      });

      return Response.json({ success: true, job_id: job.id, done: true, deleted: newDeleted });
    }
  } catch (error) {
    console.error('Delete dataset error:', error);
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