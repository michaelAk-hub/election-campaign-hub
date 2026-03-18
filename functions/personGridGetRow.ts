import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

        const row_id = String(body?.row_id ?? "").trim();
        if (!row_id) return Response.json({ error: "row_id is required" }, { status: 400 });

        const rows = await base44.asServiceRole.entities.Person.filter({ id: row_id }, null, 1, 0);
        if (!rows.length) return Response.json({ error: "Η εγγραφή δεν βρέθηκε" }, { status: 404 });

        return Response.json({ data: rows[0] });
    } catch (err) {
        console.error("❌ [personGridGetRow] Error:", err?.message || err);
        return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
    }
});