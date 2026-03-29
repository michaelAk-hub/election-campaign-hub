import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateAdminSession(base44, session_token) {
  if (!session_token) return { error: 'Missing session token', status: 401 };
  const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
  if (!sessions.length) return { error: 'Invalid session', status: 401 };
  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Session expired', status: 401 };
  }
  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) return { error: 'User not found', status: 401 };
  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Session invalidated', status: 401 };
  }
  if (user.role === 'ORGANOTIKI' && !user.is_active) return { error: 'Account disabled', status: 403 };
  if (session.last_seen_at) {
    const idleSecs = (Date.now() - new Date(session.last_seen_at)) / 1000;
    if (idleSecs > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: 'Session idle timeout', status: 401 };
    }
  }
  return { user, session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { jobId } = body;

    if (jobId) {
      const job = await base44.asServiceRole.entities.ChreosiCreateJob.get(jobId);
      if (!job) return Response.json({ found: false });
      const results = job.status === 'done' ? JSON.parse(job.results_json || '[]') : [];
      return Response.json({
        found: true,
        jobId: job.id,
        status: job.status,
        total: job.total,
        processed: job.processed,
        created: job.created_count,
        updated: job.updated_count,
        skipped: job.skipped_count,
        failed: job.failed_count,
        results,
        error: job.error,
      });
    }

    // Check for any active job
    const runningJobs = await base44.asServiceRole.entities.ChreosiCreateJob.filter({ status: 'running' });
    if (runningJobs.length > 0) {
      const job = runningJobs[0];
      return Response.json({ found: true, jobId: job.id, status: job.status, total: job.total, processed: job.processed, created: job.created_count, updated: job.updated_count, failed: job.failed_count });
    }
    const pendingJobs = await base44.asServiceRole.entities.ChreosiCreateJob.filter({ status: 'pending' });
    if (pendingJobs.length > 0) {
      const job = pendingJobs[0];
      return Response.json({ found: true, jobId: job.id, status: job.status, total: job.total, processed: job.processed, created: job.created_count, updated: job.updated_count, failed: job.failed_count });
    }

    return Response.json({ found: false });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});