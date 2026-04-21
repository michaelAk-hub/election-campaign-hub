import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOCK_TTL_SECONDS = 5;
const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateAdminSession(base44, session_token) {
  if (!session_token) return null;

  const sessions = await base44.asServiceRole.entities.AppSession.filter({
    session_token,
    is_active: true
  });
  if (!sessions.length) return null;

  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) return null;

  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) return null;

  if (session.session_version_at_login !== user.session_version) return null;
  if (user.role === 'ORGANOTIKI' && !user.is_active) return null;

  if (session.last_seen_at) {
    const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) return null;
  }

  return user;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { internal_key, session_token, dataset_id } = body;

    // Auth: accept internal key OR valid ADMIN session
    const isInternal = internal_key && internal_key === Deno.env.get('INTERNAL_REBUILD_SECRET');
    if (!isInternal) {
      const user = await validateAdminSession(base44, session_token);
      if (!user || user.role !== 'ADMIN') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!dataset_id) {
      return Response.json({ error: 'dataset_id is required' }, { status: 400 });
    }

    const lockKey = `rebuild:${dataset_id}`;
    const now = new Date();

    // Fetch existing lock rows for this key
    const lockRows = await base44.asServiceRole.entities.PredictionRebuildLock.filter({ lock_key: lockKey });

    // Clean up duplicate lock rows (keep only the first if multiple exist)
    if (lockRows.length > 1) {
      for (let i = 1; i < lockRows.length; i++) {
        base44.asServiceRole.entities.PredictionRebuildLock.delete(lockRows[i].id).catch(() => {});
      }
    }

    const existingLock = lockRows[0] || null;

    // Debounce gate: if locked_at < LOCK_TTL_SECONDS ago, skip
    if (existingLock?.locked_at) {
      const ageSeconds = (now.getTime() - new Date(existingLock.locked_at).getTime()) / 1000;
      if (ageSeconds < LOCK_TTL_SECONDS) {
        return Response.json({ skipped: true, reason: `Rebuild already triggered ${ageSeconds.toFixed(1)}s ago` });
      }
    }

    // Update or create lock
    if (existingLock) {
      await base44.asServiceRole.entities.PredictionRebuildLock.update(existingLock.id, {
        locked_at: now.toISOString(),
        lock_version: (existingLock.lock_version || 1) + 1
      });
    } else {
      await base44.asServiceRole.entities.PredictionRebuildLock.create({
        lock_key: lockKey,
        locked_at: now.toISOString(),
        lock_version: 1
      });
    }

    // Fire-and-forget rebuild
    base44.asServiceRole.functions.invoke('rebuildPredictionStats', {
      internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET')
    }).catch(() => {});

    return Response.json({ triggered: true, dataset_id, lock_key: lockKey });

  } catch (err) {
    console.error('❌ [triggerPredictionRebuild] Error:', err?.message || err);
    return Response.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
});