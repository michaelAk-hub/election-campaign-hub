import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        const { session_token, partition } = body;

        if (!session_token) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token,
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const session = sessions[0];
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get active dataset
        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' }, '-activated_at', 1, 0);
        const datasetId = datasets?.[0]?.id;

        if (!datasetId) {
            return Response.json({ rows: [] });
        }

        // Build partition filter
        let partitionCondition;
        if (partition === 'postgrad') {
            partitionCondition = { academic_level: { $in: POSTGRAD } };
        } else if (partition === 'undergrad') {
            partitionCondition = { academic_level: { $in: UNDERGRAD } };
        } else {
            // unknown = blanks
            partitionCondition = { academic_level: { $in: [null, ''] } };
        }

        const query = { dataset_id: datasetId, ...partitionCondition };

        const batchSize = 1000;
        let skip = 0;
        const all = [];

        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(query, '-created_date', batchSize, skip);
            all.push(...batch);
            if (batch.length < batchSize) break;
            skip += batchSize;
        }

        return Response.json({ rows: all });
    } catch (error) {
        console.error('personGridLoadPartition error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});