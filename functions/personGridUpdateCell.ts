import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const sessionToken = String(body?.session_token ?? "").trim();

        if (!sessionToken) return Response.json({ error: "Απαιτείται session token" }, { status: 401 });
        const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
        if (sessions.length === 0) return Response.json({ error: "Μη έγκυρη συνεδρία" }, { status: 401 });
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (users.length === 0 || !["ADMIN", "ORGANOTIKI"].includes(users[0].role)) {
            return Response.json({ error: "Δεν επιτρέπεται η πρόσβαση" }, { status: 403 });
        }
        if (users[0].role === "ORGANOTIKI" && !users[0].is_active) {
            return Response.json({ error: "Ο λογαριασμός σας έχει απενεργοποιηθεί" }, { status: 403 });
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

        // Normalize incoming string values
        value = normalizeText(value);

        // Load the person row by record id
        const rows = await base44.asServiceRole.entities.Person.filter({ id: person_id }, null, 1, 0);
        if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });

        const current = rows[0];

        // Optimistic locking
        if (Number(current.row_version) !== expected_row_version) {
            return Response.json(
                { error: "Conflict", current_row: current },
                { status: 409 }
            );
        }

        // Build update patch
        const patch = {};
        patch[field] = value;
        patch.row_version = Number(current.row_version || 1) + 1;

        // voted_at logic
        if (field === "voted") {
            const newVoted = Boolean(value);
            const oldVoted = Boolean(current.voted);
            patch.voted = newVoted;

            if (!oldVoted && newVoted) patch.voted_at = new Date().toISOString();
            if (oldVoted && !newVoted) patch.voted_at = null;
        }

        const updated = await base44.asServiceRole.entities.Person.update(current.id, patch);

        return Response.json({ data: updated });
    } catch (err) {
        console.error("❌ [personGridUpdateCell] Error:", err?.message || err);
        return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
    }
});