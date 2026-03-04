import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteWithRetry(entity, id, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await entity.delete(id);
      return;
    } catch (e) {
      if (e?.status === 429 && i < retries - 1) {
        await sleep(500 * (i + 1));
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
    if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const dataset_id = body.dataset_id;
    if (!dataset_id) return Response.json({ success: false, error: 'dataset_id is required' }, { status: 400 });

    let totalDeleted = 0;

    while (true) {
      const people = await base44.asServiceRole.entities.Person.filter({ dataset_id }, 'created_date', 200, 0);
      if (people.length === 0) break;

      for (const person of people) {
        await deleteWithRetry(base44.asServiceRole.entities.Person, person.id);
        totalDeleted++;
        await sleep(50);
      }

      if (people.length < 200) break;
    }

    await base44.asServiceRole.entities.Dataset.delete(dataset_id);

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete dataset error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});