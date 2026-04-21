import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const IDLE_TIMEOUT_SECONDS = 15 * 60;
const HEARTBEAT_WRITE_INTERVAL_MS = 60000;

const NON_EDITABLE = new Set([
  'id', 'created_date', 'updated_date', 'created_by', 'dataset_id', 'row_version'
]);

function normalizeText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  const t = v.trim().replace(/\s+/g, ' ');
  return t === '' ? null : t;
}

async function validateSession(base44, session_token) {
  if (!session_token) {
    return { error: 'Απαιτείται session token', status: 401 };
  }

  const sessions = await base44.asServiceRole.entities.AppSession.filter({
    session_token,
    is_active: true
  });

  if (sessions.length === 0) {
    return { error: 'Μη έγκυρη συνεδρία', status: 401 };
  }

  const session = sessions[0];

  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Η συνεδρία έληξε', status: 401 };
  }

  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) {
    return { error: 'Χρήστης δεν βρέθηκε', status: 401 };
  }

  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: 'Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.', status: 401, force_logout: true };
  }

  if (user.role === 'ORGANOTIKI' && !user.is_active) {
    return { error: 'Ο λογαριασμός σας έχει απενεργοποιηθεί', status: 403 };
  }

  if (session.last_seen_at) {
    const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: 'Η συνεδρία σας έληξε λόγω αδράνειας', status: 401, reason: 'idle_timeout' };
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

    const { person_id, fields, expected_row_version } = body;

    if (!person_id || !fields || typeof fields !== 'object') {
      return Response.json({ error: 'Invalid payload: person_id and fields are required' }, { status: 400 });
    }

    // Fetch current row via .get()
    const current = await base44.asServiceRole.entities.Person.get(person_id);
    if (!current) {
      return Response.json({ error: 'Person not found' }, { status: 404 });
    }

    // Concurrency check
    if (Number(current.row_version) !== Number(expected_row_version)) {
      return Response.json(
        { error: 'Conflict', current_row: current },
        { status: 409 }
      );
    }

    // Build patch — silently strip non-editable fields
    const patch = {};
    let hasPredictionChange = false;
    const predictionFields = new Set(['prediction_symbol', 'admission_year', 'department', 'voted', 'voted_at', 'dataset_id']);

    for (const [field, value] of Object.entries(fields)) {
      if (NON_EDITABLE.has(field)) continue; // silently skip

      if (field === 'voted') {
        const newVoted = Boolean(value);
        const oldVoted = Boolean(current.voted);
        patch.voted = newVoted;
        if (!oldVoted && newVoted) patch.voted_at = new Date().toISOString();
        if (oldVoted && !newVoted) patch.voted_at = null;
      } else if (value === null || typeof value === 'string') {
        patch[field] = normalizeText(value);
      } else {
        patch[field] = value;
      }

      if (predictionFields.has(field)) hasPredictionChange = true;
    }

    patch.row_version = Number(current.row_version || 1) + 1;

    const updatedPerson = await base44.asServiceRole.entities.Person.update(person_id, patch);

    // Route prediction rebuild through triggerPredictionRebuild (fire-and-forget)
    if (hasPredictionChange) {
      base44.asServiceRole.functions.invoke('triggerPredictionRebuild', {
        internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET'),
        dataset_id: current.dataset_id
      }).catch(() => {});
    }

    return Response.json({ data: updatedPerson });

  } catch (error) {
    console.error('❌ [personGridBatchUpdate] Error:', error?.message || error);
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
});