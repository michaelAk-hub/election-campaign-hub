import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteWithRetry(entity, id, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await entity.delete(id);
      return;
    } catch (e) {
      if (e?.status === 429 && i < retries - 1) {
        await sleep(600 * (i + 1));
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

    let totalDeleted = 0;

    // Delete sequentially one by one to avoid rate limits
    while (true) {
      const people = await base44.asServiceRole.entities.Person.list('created_date', 200, 0);
      if (people.length === 0) break;

      for (const person of people) {
        await deleteWithRetry(base44.asServiceRole.entities.Person, person.id);
        totalDeleted++;
        await sleep(60);
      }

      if (people.length < 200) break;
    }

    // Delete all dataset records too
    const datasets = await base44.asServiceRole.entities.Dataset.list('-created_date', 5000, 0);
    for (const ds of datasets) {
      await deleteWithRetry(base44.asServiceRole.entities.Dataset, ds.id);
      await sleep(60);
    }

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete all persons error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});