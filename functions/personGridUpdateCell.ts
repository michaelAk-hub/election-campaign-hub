import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { person_id, field, value, expected_row_version } = await req.json();

        if (!person_id || !field || expected_row_version === undefined) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get current person
        const persons = await base44.entities.Person.filter({ id: person_id });
        if (persons.length === 0) {
            return Response.json({ error: 'Person not found' }, { status: 404 });
        }

        const currentPerson = persons[0];

        // Optimistic concurrency check
        if (currentPerson.row_version !== expected_row_version) {
            return Response.json({
                error: 'Conflict',
                current_row: currentPerson,
                current_row_version: currentPerson.row_version
            }, { status: 409 });
        }

        // Validate field is editable
        const nonEditableFields = ['id', 'created_date', 'updated_date', 'created_by', 'updated_by', 'row_version'];
        if (nonEditableFields.includes(field)) {
            return Response.json({ error: 'Field is not editable' }, { status: 403 });
        }

        // Update with version increment
        const updatedPerson = await base44.entities.Person.update(person_id, {
            [field]: value,
            row_version: currentPerson.row_version + 1
        });

        // Trigger sync to external Grid API (non-blocking)
        try {
            await base44.functions.invoke('syncPersonToGridAPI', {
                person_id: person_id,
                use_service_role: false
            });
        } catch (syncError) {
            console.error('Failed to sync to Grid API:', syncError);
            // Don't fail the request - sync can be retried by reconciliation job
        }

        return Response.json({
            success: true,
            data: updatedPerson,
            row_version: updatedPerson.row_version
        });

    } catch (error) {
        if (error.message?.includes('required')) {
            return Response.json({ error: 'Validation error: ' + error.message }, { status: 422 });
        }
        return Response.json({ error: error.message }, { status: 500 });
    }
});