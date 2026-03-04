import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteWithRetry(entity, id, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      await entity.delete(id);
      return;
    } catch (e) {
      if (e?.status === 429 && i < retries - 1) {
        await sleep(700 * (i + 1));
      } else {
        throw e;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const sessionToken = body.session_token;
    if (!sessionToken) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
    if (sessions.length === 0) return Response.json({ success: false, error: 'Invalid session' }, { status: 401 });

    const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
    if (users.length === 0 || users[0].role !== 'ADMIN') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Count total persons
    let countBatch = await base44.asServiceRole.entities.Person.list('created_date', 5000, 0);
    let total = countBatch.length;

    // Create job record
    const job = await base44.asServiceRole.entities.DeleteJob.create({
      job_type: 'delete_all_persons',
      status: 'running',
      total,
      deleted: 0,
      message: `Διαγραφή εγγραφών (0/${total})...`
    });

    // Run deletion in background (don't await)
    (async () => {
      try {
        let totalDeleted = 0;

        while (true) {
          const people = await base44.asServiceRole.entities.Person.list('created_date', 100, 0);
          if (people.length === 0) break;

          for (const person of people) {
            await deleteWithRetry(base44.asServiceRole.entities.Person, person.id);
            totalDeleted++;
            await sleep(60);

            // Update progress every 10 records
            if (totalDeleted % 10 === 0) {
              await base44.asServiceRole.entities.DeleteJob.update(job.id, {
                deleted: totalDeleted,
                message: `Διαγραφή εγγραφών (${totalDeleted}/${total})...`
              });
            }
          }

          if (people.length < 100) break;
        }

        // Delete all datasets
        const datasets = await base44.asServiceRole.entities.Dataset.list('-created_date', 5000, 0);
        for (const ds of datasets) {
          await deleteWithRetry(base44.asServiceRole.entities.Dataset, ds.id);
          await sleep(60);
        }

        await base44.asServiceRole.entities.DeleteJob.update(job.id, {
          status: 'done',
          deleted: totalDeleted,
          message: `Ολοκληρώθηκε! Διαγράφηκαν ${totalDeleted} εγγραφές και ${datasets.length} datasets.`
        });
      } catch (err) {
        console.error('Background delete error:', err);
        await base44.asServiceRole.entities.DeleteJob.update(job.id, {
          status: 'error',
          error: err?.message ?? String(err),
          message: `Σφάλμα: ${err?.message ?? String(err)}`
        });
      }
    })();

    return Response.json({ success: true, job_id: job.id });
  } catch (error) {
    console.error('Delete all persons error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});