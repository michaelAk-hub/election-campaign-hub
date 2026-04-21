import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const IDLE_TIMEOUT_SECONDS = 15 * 60;

async function validateSession(base44, session_token) {
  if (!session_token) {
    return { error: "Απαιτείται session token", status: 401 };
  }

  const sessions = await base44.asServiceRole.entities.AppSession.filter({
    session_token,
    is_active: true
  });

  if (sessions.length === 0) {
    return { error: "Μη έγκυρη συνεδρία", status: 401 };
  }

  const session = sessions[0];

  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία έληξε", status: 401 };
  }

  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) {
    return { error: "Χρήστης δεν βρέθηκε", status: 401 };
  }

  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.", status: 401, force_logout: true };
  }

  if (user.role === "ORGANOTIKI" && !user.is_active) {
    return { error: "Ο λογαριασμός σας έχει απενεργοποιηθεί", status: 403 };
  }

  if (session.last_seen_at) {
    const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: "Η συνεδρία σας έληξε λόγω αδράνειας", status: 401, reason: "idle_timeout" };
    }
  }

  // NO heartbeat write for read-only preference operations
  return { user, session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { session_token, grid_key } = body;

    const auth = await validateSession(base44, session_token);
    if (auth.error) {
      return Response.json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) }, { status: auth.status });
    }

    if (!grid_key) {
      return Response.json({ error: 'Missing grid_key' }, { status: 400 });
    }

    const preferences = await base44.asServiceRole.entities.GridPreference.filter({
      user_email: auth.user.email,
      grid_key
    });

    if (preferences.length === 0) {
      return Response.json({ preference: null, state_json: {} });
    }

    return Response.json({ preference: preferences[0], state_json: preferences[0].state_json || {} });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});