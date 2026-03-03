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
    if (users.length === 0 || !['ADMIN'].includes(users[0].role)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Delete ALL persons - loop until none remain
    let totalDeleted = 0;
    while (true) {
      const r = await base44.asServiceRole.entities.Person.deleteMany({});
      const count = r?.deleted ?? 0;
      totalDeleted += count;
      if (!count) break;
    }

    // Reset total_records on all datasets
    const datasets = await base44.asServiceRole.entities.Dataset.filter({}, '-created_date', 5000, 0);
    await Promise.all(
      datasets.filter(ds => (ds.total_records ?? 0) !== 0)
              .map(ds => base44.asServiceRole.entities.Dataset.update(ds.id, { total_records: 0 }))
    );

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete all persons error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});