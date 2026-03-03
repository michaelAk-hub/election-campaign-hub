import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const LIMIT = 500;
const CONCURRENCY = 5;
const DELAY_MS = 300;

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

    let deletedCount = 0;

    while (true) {
      const batch = await base44.asServiceRole.entities.Person.filter({ dataset_id }, '-created_date', LIMIT, 0);
      if (batch.length === 0) break;

      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        await Promise.all(batch.slice(i, i + CONCURRENCY).map(p => base44.asServiceRole.entities.Person.delete(p.id)));
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
      deletedCount += batch.length;
      console.log(`[deleteDataset] deleted so far: ${deletedCount}`);
    }

    await base44.asServiceRole.entities.Dataset.delete(dataset_id);

    return Response.json({ success: true, deleted_count: deletedCount });
  } catch (error) {
    console.error('Delete dataset error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});