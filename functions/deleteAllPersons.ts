import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

    let totalDeleted = 0;
    const fetchBatchSize = 500;
    const chunkSize = 5; // small parallel batch to avoid rate limits

    while (true) {
      const people = await base44.asServiceRole.entities.Person.list('created_date', fetchBatchSize, 0);
      if (people.length === 0) break;

      for (let i = 0; i < people.length; i += chunkSize) {
        const chunk = people.slice(i, i + chunkSize);
        await Promise.all(chunk.map(p => base44.asServiceRole.entities.Person.delete(p.id)));
        totalDeleted += chunk.length;
        if (i + chunkSize < people.length) await sleep(150);
      }

      if (people.length < fetchBatchSize) break;
    }

    // Reset total_records on all datasets
    const datasets = await base44.asServiceRole.entities.Dataset.list('-created_date', 5000, 0);
    for (const ds of datasets) {
      if ((ds.total_records ?? 0) !== 0) {
        await base44.asServiceRole.entities.Dataset.update(ds.id, { total_records: 0 });
        await sleep(100);
      }
    }

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete all persons error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});