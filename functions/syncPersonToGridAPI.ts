import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Syncs a Person record to the external Grid API read mirror
 * Called after successful writes to keep external DB in sync
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // This function can be called internally (service role) or by authenticated users
        const payload = await req.json();
        const { person_id, use_service_role = false } = payload;

        if (!person_id) {
            return Response.json({ error: 'person_id is required' }, { status: 400 });
        }

        // Fetch the person record
        let person;
        if (use_service_role) {
            person = await base44.asServiceRole.entities.Person.get(person_id);
        } else {
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            person = await base44.entities.Person.get(person_id);
        }

        if (!person) {
            return Response.json({ error: 'Person not found' }, { status: 404 });
        }

        // Get secrets
        const GRID_API_BASE_URL = Deno.env.get('GRID_API_BASE_URL');
        const GRID_API_KEY = Deno.env.get('GRID_API_KEY');

        if (!GRID_API_BASE_URL || !GRID_API_KEY) {
            console.error('Missing GRID_API_BASE_URL or GRID_API_KEY');
            return Response.json({ error: 'Grid API not configured' }, { status: 500 });
        }

        // Prepare sync payload
        const syncPayload = {
            person: {
                person_pk: person.id,
                dataset_id: person.dataset_id,
                person_id: person.person_id,
                first_name: person.first_name,
                last_name: person.last_name,
                mobile_phone: person.mobile_phone,
                department: person.department,
                admission_year: person.admission_year,
                academic_level: person.academic_level,
                ucid: person.ucid,
                contact_person_1: person.contact_person_1,
                contact_person_2: person.contact_person_2,
                member: person.member,
                prediction_symbol: person.prediction_symbol,
                voted: person.voted,
                voted_at: person.voted_at,
                notes: person.notes,
                custom_data: person.custom_data,
                row_version: person.row_version,
                created_date: person.created_date,
                updated_date: person.updated_date
            }
        };

        // Call external sync endpoint
        const syncResponse = await fetch(`${GRID_API_BASE_URL}/sync/person/upsert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GRID_API_KEY}`
            },
            body: JSON.stringify(syncPayload)
        });

        if (!syncResponse.ok) {
            const errorText = await syncResponse.text();
            console.error('Sync to Grid API failed:', syncResponse.status, errorText);
            // Log error but don't fail the request - sync can be retried
            return Response.json({ 
                success: false,
                error: 'Sync failed',
                status: syncResponse.status 
            }, { status: 200 });
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('syncPersonToGridAPI error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});