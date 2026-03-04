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

    // Fetch all person IDs for this dataset in batches, then delete individually in parallel batches
    let totalDeleted = 0;
    let skip = 0;
    const fetchBatchSize = 1000;

    while (true) {
      const people = await base44.asServiceRole.entities.Person.filter({ dataset_id }, 'created_date', fetchBatchSize, skip);
      if (people.length === 0) break;

      // Delete in parallel chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < people.length; i += chunkSize) {
        const chunk = people.slice(i, i + chunkSize);
        await Promise.all(chunk.map(p => base44.asServiceRole.entities.Person.delete(p.id)));
        totalDeleted += chunk.length;
      }

      if (people.length < fetchBatchSize) break;
      // Don't advance skip since we deleted the records
    }

    // Delete the dataset record
    await base44.asServiceRole.entities.Dataset.delete(dataset_id);

    return Response.json({ success: true, deleted_count: totalDeleted });
  } catch (error) {
    console.error('Delete dataset error:', error);
    return Response.json({ success: false, error: error?.message ?? String(error) }, { status: 500 });
  }
});