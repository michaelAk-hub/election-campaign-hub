import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const IDLE_TIMEOUT_SECONDS = 15 * 60;
const HEARTBEAT_WRITE_INTERVAL_MS = 60000;

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

  // Throttled heartbeat — fire-and-forget
  const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen >= HEARTBEAT_WRITE_INTERVAL_MS) {
    base44.asServiceRole.entities.AppSession.update(session.id, { last_seen_at: new Date().toISOString() }).catch(() => {});
  }

  return { user, session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const auth = await validateSession(base44, body?.session_token);
    if (auth.error) {
      return Response.json(
        { error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) },
        { status: auth.status }
      );
    }

    const row_id = String(body?.row_id ?? "").trim();
    if (!row_id) return Response.json({ error: "row_id is required" }, { status: 400 });

    const row = await base44.asServiceRole.entities.Person.get(row_id);
    if (!row) return Response.json({ error: "Η εγγραφή δεν βρέθηκε" }, { status: 404 });

    return Response.json({ data: row });
  } catch (err) {
    console.error("❌ [personGridGetRow] Error:", err?.message || err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
});