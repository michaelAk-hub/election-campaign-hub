import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Archive only currently active datasets (skip target)
    const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' }, '-created_date', 5000, 0);
    for (const ds of activeDatasets) {
      if (ds.id !== dataset_id) {
        await base44.asServiceRole.entities.Dataset.update(ds.id, { status: 'archived' });
      }
    }

    await base44.asServiceRole.entities.Dataset.update(dataset_id, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Activation error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});