import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { updates } = await req.json();

        if (!Array.isArray(updates) || updates.length === 0) {
            return Response.json({ error: 'Invalid updates array' }, { status: 400 });
        }

        const results = [];

        for (const update of updates) {
            const { person_id, changes, expected_row_version } = update;

            try {
                // Get current person
                const persons = await base44.entities.Person.filter({ id: person_id });
                if (persons.length === 0) {
                    results.push({
                        person_id,
                        status: 'error',
                        error: 'Person not found'
                    });
                    continue;
                }

                const currentPerson = persons[0];

                // Optimistic concurrency check
                if (currentPerson.row_version !== expected_row_version) {
                    results.push({
                        person_id,
                        status: 'conflict',
                        current_row: currentPerson,
                        current_row_version: currentPerson.row_version
                    });
                    continue;
                }

                // Filter out non-editable fields
                const nonEditableFields = ['id', 'created_date', 'updated_date', 'created_by', 'updated_by', 'row_version'];
                const validChanges = {};
                for (const [field, value] of Object.entries(changes)) {
                    if (!nonEditableFields.includes(field)) {
                        validChanges[field] = value;
                    }
                }

                // Update with version increment
                const updatedPerson = await base44.entities.Person.update(person_id, {
                    ...validChanges,
                    row_version: currentPerson.row_version + 1
                });

                results.push({
                    person_id,
                    status: 'success',
                    data: updatedPerson,
                    row_version: updatedPerson.row_version
                });

            } catch (error) {
                results.push({
                    person_id,
                    status: 'error',
                    error: error.message
                });
            }
        }

        // Rebuild prediction stats if any prediction-relevant field was changed
        const predictionFields = new Set(['prediction_symbol', 'admission_year', 'department', 'voted', 'voted_at']);
        const hasPredictionChange = updates.some(u =>
            u.changes && Object.keys(u.changes).some(f => predictionFields.has(f))
        );
        if (hasPredictionChange) {
            base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});
        }

        return Response.json({ results });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});