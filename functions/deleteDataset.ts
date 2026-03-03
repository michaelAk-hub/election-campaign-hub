import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    // Delete all persons for this dataset - loop until none remain
    let totalDeleted = 0;
    while (true) {
      const r = await base44.asServiceRole.entities.Person.deleteMany({ dataset_id });
      const count = r?.deleted ?? 0;
      totalDeleted += count;
      if (!count) break;
    }

    // Delete the dataset record
    await base44.asServiceRole.entities.Dataset.delete(dataset_id);

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete dataset error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});