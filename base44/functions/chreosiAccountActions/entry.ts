import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import bcrypt from 'npm:bcryptjs@2.4.3';

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function randomPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

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
    return { error: 'Session invalidated', status: 401, force_logout: true };
  }
  if (user.role === 'ORGANOTIKI' && !user.is_active) return { error: 'Account disabled', status: 403 };
  if (session.last_seen_at) {
    const idleSecs = (Date.now() - new Date(session.last_seen_at)) / 1000;
    if (idleSecs > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: 'Session idle timeout', status: 401, reason: 'idle_timeout' };
    }
  }
  return { user, session };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await validateAdminSession(base44, body.session_token);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { action, accountId, accountIds, data } = body;

    // ── Update single account ──
    if (action === 'update') {
      if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 });
      await base44.asServiceRole.entities.ChreosiAccount.update(accountId, {
        display_name: data.display_name,
        phone: data.phone,
        is_active: data.is_active,
        allowed_prediction_symbols: data.allowed_prediction_symbols || [],
        allowed_voted_statuses: data.allowed_voted_statuses || [],
        personal_note: data.personal_note,
      });
      return Response.json({ ok: true });
    }

    // ── Reset password ──
    if (action === 'reset_password') {
      if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 });
      const newPw = randomPassword();
      const hash = await bcrypt.hash(newPw, 10);
      await base44.asServiceRole.entities.ChreosiAccount.update(accountId, {
        password_hash: hash,
        plain_password: newPw,
      });
      return Response.json({ ok: true, newPassword: newPw });
    }

    // ── Delete single ──
    if (action === 'delete') {
      if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 });
      try {
        await base44.asServiceRole.entities.ChreosiAccount.delete(accountId);
      } catch { /* already deleted */ }
      return Response.json({ ok: true });
    }

    // ── Bulk delete ──
    if (action === 'bulk_delete') {
      if (!accountIds?.length) return Response.json({ error: 'accountIds required' }, { status: 400 });
      for (const id of accountIds) {
        try { await base44.asServiceRole.entities.ChreosiAccount.delete(id); } catch {}
        await sleep(100);
      }
      return Response.json({ ok: true, deleted: accountIds.length });
    }

    // ── Bulk activate/deactivate ──
    if (action === 'bulk_set_active') {
      if (!accountIds?.length) return Response.json({ error: 'accountIds required' }, { status: 400 });
      const active = data?.is_active ?? true;
      for (const id of accountIds) {
        try { await base44.asServiceRole.entities.ChreosiAccount.update(id, { is_active: active }); } catch {}
        await sleep(100);
      }
      return Response.json({ ok: true, updated: accountIds.length });
    }

    // ── Bulk settings (symbols + voted) ──
    if (action === 'bulk_settings') {
      if (!accountIds?.length) return Response.json({ error: 'accountIds required' }, { status: 400 });
      const { allowed_prediction_symbols = [], allowed_voted_statuses = [] } = data || {};
      let updated = 0;
      const failed = [];
      for (const id of accountIds) {
        try {
          await base44.asServiceRole.entities.ChreosiAccount.update(id, {
            allowed_prediction_symbols,
            allowed_voted_statuses,
          });
          updated++;
        } catch (err) {
          failed.push({ id, error: err.message });
        }
        await sleep(120);
      }
      return Response.json({ ok: true, updated, failed });
    }

    // ── Get all filtered IDs (for true select-all across pages) ──
    if (action === 'get_all_filtered_ids') {
      const { search = '' } = data || {};
      let allAccounts = [];
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, skip);
        if (!batch || batch.length === 0) break;
        allAccounts = allAccounts.concat(batch);
        skip += 500;
        if (batch.length < 500) break;
      }
      let filtered = allAccounts;
      if (search) {
        const q = normalizeUsername(search);
        filtered = allAccounts.filter(a => {
          const u = normalizeUsername(a.username);
          const d = normalizeUsername(a.display_name || '');
          const ph = (a.phone || '').toLowerCase();
          return u.includes(q) || d.includes(q) || ph.includes(search.toLowerCase());
        });
      }
      return Response.json({ ok: true, ids: filtered.map(a => a.id), total: filtered.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});