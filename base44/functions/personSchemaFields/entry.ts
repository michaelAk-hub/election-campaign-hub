import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { session_token } = body;

        if (!session_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Validate session using service role
        let sessions, users;
        try {
            sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
        } catch (e) {
            return Response.json({ error: 'Session lookup failed: ' + e.message }, { status: 500 });
        }

        if (!sessions?.length) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        try {
            users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        } catch (e) {
            return Response.json({ error: 'User lookup failed: ' + e.message }, { status: 500 });
        }

        if (!users?.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get schema and extract field names
        let schema;
        try {
            schema = await base44.asServiceRole.entities.Person.schema();
        } catch (e) {
            // Fallback: return hardcoded fields from Person entity definition
            const fallbackFields = [
                "dataset_id", "department", "admission_year", "academic_level",
                "person_id", "ucid", "mobile_phone", "first_name", "last_name",
                "contact_person_1", "contact_person_2", "member", "prediction_symbol",
                "voted", "voted_at", "notes", "monadikos_kanali", "direction",
                "X", "F26_1", "F25", "phone", "T24", "F24", "F23", "T22",
                "details", "father_n", "father_name", "ElectoralDistrict",
                "ElectoralTown", "RelatedMember"
            ];
            return Response.json({ fields: fallbackFields, source: 'fallback' });
        }

        // schema() returns the JSON schema object directly
        // Fields are under schema.properties
        let fields = [];
        if (schema?.properties) {
            fields = Object.keys(schema.properties);
        } else if (Array.isArray(schema)) {
            // Some SDK versions return an array of field objects
            fields = schema.map(f => f.name || f.key || f).filter(Boolean);
        }

        return Response.json({ fields, source: 'schema', raw_keys: Object.keys(schema || {}) });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});