import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const IDLE_TIMEOUT_SECONDS = 15 * 60;

function normalizeText(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    const t = v.trim().replace(/\s+/g, " ");
    return t === "" ? null : t;
}

const NON_EDITABLE = new Set([
    "id",
    "created_date",
    "updated_date",
    "created_by",
    "dataset_id",
    "row_version",
]);

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

    await base44.asServiceRole.entities.AppSession.update(session.id, { last_seen_at: new Date().toISOString() });

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

        const person_id = String(body?.person_id ?? "").trim();
        const field = String(body?.field ?? "").trim();
        const expected_row_version = Number(body?.expected_row_version);
        let value = body?.value;

        if (!person_id || !field || Number.isNaN(expected_row_version)) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (NON_EDITABLE.has(field)) {
            return Response.json({ error: `Field not editable: ${field}` }, { status: 400 });
        }

        value = normalizeText(value);

        const rows = await base44.asServiceRole.entities.Person.filter({ id: person_id }, null, 1, 0);
        if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });

        const current = rows[0];

        if (Number(current.row_version) !== expected_row_version) {
            return Response.json(
                { error: "Conflict", current_row: current },
                { status: 409 }
            );
        }

        const patch = {};
        patch[field] = value;
        patch.row_version = Number(current.row_version || 1) + 1;

        if (field === "voted") {
            const newVoted = Boolean(value);
            const oldVoted = Boolean(current.voted);
            patch.voted = newVoted;
            if (!oldVoted && newVoted) patch.voted_at = new Date().toISOString();
            if (oldVoted && !newVoted) patch.voted_at = null;
        }

        const updated = await base44.asServiceRole.entities.Person.update(current.id, patch);

        // Rebuild prediction stats if a prediction-relevant field changed
        const predictionFields = new Set(['prediction_symbol', 'admission_year', 'department', 'voted', 'voted_at', 'dataset_id']);
        if (predictionFields.has(field)) {
            base44.asServiceRole.functions.invoke('rebuildPredictionStats', {}).catch(() => {});
        }

        return Response.json({ data: updated });
    } catch (err) {
        console.error("❌ [personGridUpdateCell] Error:", err?.message || err);
        return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
    }
});