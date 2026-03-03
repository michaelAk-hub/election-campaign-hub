import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeText(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    const t = v.trim().replace(/\s+/g, " ");
    return t === "" ? null : t;
}

const STRING_FIELDS = [
    "person_id", "ucid", "department", "admission_year", "academic_level",
    "mobile_phone", "first_name", "last_name", "contact_person_1",
    "contact_person_2", "member", "prediction_symbol", "notes", "monadikos_kanali"
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });

        // Get active dataset
        const datasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' }, null, 1);
        if (!datasets.length) return Response.json({ error: "No active dataset" }, { status: 404 });
        const dataset_id = datasets[0].id;

        let offset = 0;
        const batchSize = 100;
        let updatedCount = 0;
        let processedCount = 0;

        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id }, null, batchSize, offset
            );
            if (!batch.length) break;

            for (const person of batch) {
                const patch = {};
                let changed = false;

                for (const field of STRING_FIELDS) {
                    const original = person[field];
                    const normalized = normalizeText(original);
                    // Compare: treat null == null, and catch "" → null changes
                    const originalNorm = (original === null || original === undefined) ? null : original;
                    if (normalized !== originalNorm) {
                        patch[field] = normalized;
                        changed = true;
                    }
                }

                if (changed) {
                    patch.row_version = Number(person.row_version || 1) + 1;
                    await base44.asServiceRole.entities.Person.update(person.id, patch);
                    updatedCount++;
                }
            }

            processedCount += batch.length;
            offset += batchSize;

            if (batch.length < batchSize) break;
        }

        return Response.json({
            success: true,
            processed: processedCount,
            updated: updatedCount,
            message: `Ολοκληρώθηκε: ${updatedCount} από ${processedCount} εγγραφές κανονικοποιήθηκαν.`
        });
    } catch (err) {
        console.error("❌ [normalizePeopleDatasetStrings] Error:", err?.message || err);
        return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
    }
});