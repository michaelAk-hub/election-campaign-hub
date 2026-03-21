import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * Returns the ordered list of Person field names for use in the Excel template.
 * Auth-gated: requires a valid admin/organotiki app session.
 *
 * Note: base44.asServiceRole.entities.*.schema() is NOT available in Deno.
 * Field list is derived directly from the Person entity schema definition.
 */

// Ordered Person entity fields (mirrors entities/Person.json properties)
const PERSON_FIELDS = [
    'dataset_id', 'department', 'admission_year', 'academic_level',
    'person_id', 'ucid', 'mobile_phone', 'first_name', 'last_name',
    'contact_person_1', 'contact_person_2', 'member', 'prediction_symbol',
    'voted', 'voted_at', 'notes', 'monadikos_kanali', 'direction',
    'X', 'F26_1', 'F25', 'phone', 'T24', 'F24', 'F23', 'T22',
    'details', 'father_n', 'father_name',
    'ElectoralDistrict', 'ElectoralTown', 'RelatedMember',
    'custom_data', 'row_version'
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const sessionToken = body.session_token;

        console.log('[personSchemaFields] session_token present:', !!sessionToken);

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });

        console.log('[personSchemaFields] sessions found:', sessions.length);

        if (!sessions.length) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        console.log('[personSchemaFields] user role:', users[0]?.role);

        if (!users.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        console.log('[personSchemaFields] returning', PERSON_FIELDS.length, 'fields');
        return Response.json({ fields: PERSON_FIELDS });

    } catch (error) {
        console.error('[personSchemaFields] error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});