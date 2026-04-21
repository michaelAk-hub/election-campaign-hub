import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LOCK_STALE_SECONDS = 90;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  let base44;
  let jobId;

  try {
    base44 = createClientFromRequest(req);
    const body = await req.json();

    const sessionToken = body.session_token;
    jobId = body.job_id;
    const resumeKey = body.resume_key;

    // Auth check — skip for internal resume calls
    if (!jobId || resumeKey !== 'internal_resume') {
      if (!sessionToken) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

      const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
      if (sessions.length === 0) return Response.json({ success: false, error: 'Invalid session' }, { status: 401 });

      const user = await base44.asServiceRole.entities.AppUser.get(sessions[0].app_user_id);
      if (!user || user.role !== 'ADMIN') {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    let job;

    if (jobId) {
      // Resume existing job
      const jobs = await base44.asServiceRole.entities.DeleteJob.filter({ id: jobId });
      if (jobs.length === 0) return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
      job = jobs[0];

      if (job.job_type !== 'delete_all_persons') {
        return Response.json({ success: false, error: 'Job type mismatch' }, { status: 400 });
      }
      if (job.status !== 'running') return Response.json({ success: true, job_id: job.id, status: job.status });

      // Stale lock check — if last heartbeat < LOCK_STALE_SECONDS ago, another worker is active
      if (job.last_heartbeat_at) {
        const ageSeconds = (Date.now() - new Date(job.last_heartbeat_at).getTime()) / 1000;
        if (ageSeconds < LOCK_STALE_SECONDS) {
          return Response.json({ success: true, job_id: job.id, skipped: true, reason: 'Another worker is active' });
        }
      }
    } else {
      // New job
      const countBatch = await base44.asServiceRole.entities.Person.list('created_date', 5000, 0);
      const total = countBatch.length;

      job = await base44.asServiceRole.entities.DeleteJob.create({
        job_type: 'delete_all_persons',
        status: 'running',
        total,
        deleted: 0,
        message: `Διαγραφή εγγραφών (0/${total})...`,
        last_heartbeat_at: new Date().toISOString()
      });
      jobId = job.id;
    }

    // Update heartbeat before processing
    await base44.asServiceRole.entities.DeleteJob.update(job.id, {
      last_heartbeat_at: new Date().toISOString()
    });

    // ── FAST PATH: try atomic deleteMany ──────────────────────────────────
    try {
      await base44.asServiceRole.entities.Person.deleteMany({});
      await base44.asServiceRole.entities.Dataset.deleteMany({});

      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        status: 'done',
        deleted: job.total || 0,
        message: `Ολοκληρώθηκε! Διαγράφηκαν όλες οι εγγραφές και τα datasets.`,
        last_heartbeat_at: new Date().toISOString()
      });

      base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});

      return Response.json({ success: true, job_id: job.id, done: true });
    } catch (_fastPathErr) {
      // deleteMany not supported or failed — fall through to paginated fallback
    }

    // ── FALLBACK: paginated deletion per dataset ──────────────────────────
    const datasets = await base44.asServiceRole.entities.Dataset.list('-created_date', 3, 0);

    if (datasets.length === 0) {
      // No datasets left — check if any orphan persons remain
      const remaining = await base44.asServiceRole.entities.Person.list('created_date', 1, 0);
      if (remaining.length === 0) {
        await base44.asServiceRole.entities.DeleteJob.update(job.id, {
          status: 'done',
          deleted: job.deleted || 0,
          message: `Ολοκληρώθηκε! Διαγράφηκαν ${job.deleted || 0} εγγραφές.`,
          last_heartbeat_at: new Date().toISOString()
        });
        base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});
        return Response.json({ success: true, job_id: job.id, done: true });
      }
    }

    let batchDeleted = 0;

    for (const ds of datasets) {
      // Delete persons for this dataset in batches of 200
      while (true) {
        const persons = await base44.asServiceRole.entities.Person.filter({ dataset_id: ds.id }, 'created_date', 200, 0);
        if (!persons.length) break;

        for (const p of persons) {
          try {
            await base44.asServiceRole.entities.Person.delete(p.id);
            batchDeleted++;
          } catch (_) {}
          await sleep(20);
        }

        // Update heartbeat mid-batch
        await base44.asServiceRole.entities.DeleteJob.update(job.id, {
          deleted: (job.deleted || 0) + batchDeleted,
          last_heartbeat_at: new Date().toISOString()
        });
      }

      // Delete the dataset itself
      try { await base44.asServiceRole.entities.Dataset.delete(ds.id); } catch (_) {}
      await sleep(30);
    }

    const newDeleted = (job.deleted || 0) + batchDeleted;

    // Check if more datasets remain
    const remainingDatasets = await base44.asServiceRole.entities.Dataset.list('created_date', 1, 0);
    const remainingPersons = await base44.asServiceRole.entities.Person.list('created_date', 1, 0);

    if (remainingDatasets.length > 0 || remainingPersons.length > 0) {
      // More work to do — update progress and self-invoke
      await base44.asServiceRole.entities.DeleteJob.update(job.id, {
        deleted: newDeleted,
        message: `Διαγραφή εγγραφών (${newDeleted}/${job.total || 0})...`,
        last_heartbeat_at: new Date().toISOString()
      });

      const appId = Deno.env.get('BASE44_APP_ID');
      const fnUrl = `https://api.base44.com/api/apps/${appId}/functions/deleteAllPersons`;
      fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, resume_key: 'internal_resume' })
      }).catch(() => {});

      return Response.json({ success: true, job_id: job.id, deleted: newDeleted, total: job.total || 0 });
    }

    // All done
    await base44.asServiceRole.entities.DeleteJob.update(job.id, {
      status: 'done',
      deleted: newDeleted,
      message: `Ολοκληρώθηκε! Διαγράφηκαν ${newDeleted} εγγραφές.`,
      last_heartbeat_at: new Date().toISOString()
    });

    base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});

    return Response.json({ success: true, job_id: job.id, done: true, deleted: newDeleted });

  } catch (error) {
    console.error('Delete all persons error:', error);

    try {
      if (base44 && jobId) {
        await base44.asServiceRole.entities.DeleteJob.update(jobId, {
          status: 'error',
          error: error?.message ?? String(error),
          message: `Σφάλμα: ${error?.message ?? String(error)}`,
          last_heartbeat_at: new Date().toISOString()
        });
      }
    } catch (_) {}

    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});