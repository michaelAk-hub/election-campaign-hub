import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message ?? err ?? '');
  const status = err?.status ?? err?.statusCode ?? err?.code;
  return status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit');
}

async function retry(fn, attempts = 7) {
  let delay = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || i === attempts - 1) throw err;
      await sleep(delay + Math.floor(Math.random() * 80));
      delay = Math.min(delay * 2, 2000);
    }
  }
  throw new Error('Retry failed');
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
    if (users.length === 0 || !['ADMIN'].includes(users[0].role)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const LIMIT = 500;
    const CONCURRENCY = 8;
    const BATCH_DELAY_MS = 150;

    let deletedCount = 0;
    let failedDeletes = 0;

    while (true) {
      const batch = await retry(() =>
        base44.asServiceRole.entities.Person.filter({}, '-created_date', LIMIT, 0)
      );
      if (batch.length === 0) break;

      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const slice = batch.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          slice.map((p) => retry(() => base44.asServiceRole.entities.Person.delete(p.id)))
        );
        for (const r of results) {
          if (r.status === 'fulfilled') deletedCount++;
          else failedDeletes++;
        }
        await sleep(BATCH_DELAY_MS);
      }
      console.log(`[deleteAllPersons] deleted so far: ${deletedCount}`);
    }

    // Reset total_records on all datasets
    const datasets = await base44.asServiceRole.entities.Dataset.filter({}, '-created_date', 5000, 0);
    for (const ds of datasets) {
      if ((ds.total_records ?? 0) !== 0) {
        await retry(() => base44.asServiceRole.entities.Dataset.update(ds.id, { total_records: 0 }));
      }
    }

    return Response.json({ success: failedDeletes === 0, deleted_count: deletedCount, failed_deletes: failedDeletes });
  } catch (error) {
    console.error('Delete all persons error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});