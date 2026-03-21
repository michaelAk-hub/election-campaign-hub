import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import * as XLSX from 'npm:xlsx@0.18.5';

// Columns to exclude (metadata from export)
const EXCLUDE_COLS = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample']);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { file_url } = await req.json();

        if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

        // Fetch the file
        const fileRes = await fetch(file_url);
        if (!fileRes.ok) return Response.json({ error: 'Failed to fetch file' }, { status: 400 });

        const arrayBuffer = await fileRes.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

        if (!rows.length) return Response.json({ error: 'No rows found' }, { status: 400 });

        // Fields that must be strings in the entity schema
        const STRING_FIELDS = new Set([
            'admission_year', 'mobile_phone', 'monadikos_kanali', 'phone',
            'person_id', 'ucid', 'department', 'first_name', 'last_name',
            'academic_level', 'prediction_symbol', 'contact_person_1', 'contact_person_2',
            'direction', 'X', 'F26_1', 'F25', 'F24', 'F23', 'T22', 'T24',
            'details', 'notes', 'member', 'ElectoralDistrict', 'ElectoralTown',
            'RelatedMember', 'father_n', 'father_name', 'dataset_id', 'voted_at'
        ]);

        // Strip excluded columns and normalize
        const cleaned = rows.map(row => {
            const out = {};
            for (const [k, v] of Object.entries(row)) {
                if (EXCLUDE_COLS.has(k)) continue;
                if (v === null || v === undefined || v === '') {
                    out[k] = null;
                } else if (STRING_FIELDS.has(k)) {
                    out[k] = String(v);
                } else {
                    out[k] = v;
                }
            }
            // Ensure voted is boolean
            const votedRaw = out.voted;
            out.voted = votedRaw === true || votedRaw === 'TRUE' || votedRaw === 1 || votedRaw === '1' || votedRaw === 'true';
            return out;
        });

        // Bulk insert in chunks of 500
        const chunkSize = 500;
        let imported = 0;
        for (let i = 0; i < cleaned.length; i += chunkSize) {
            const chunk = cleaned.slice(i, i + chunkSize);
            await base44.asServiceRole.entities.Person.bulkCreate(chunk);
            imported += chunk.length;
        }

        return Response.json({ success: true, imported, total: cleaned.length });
    } catch (error) {
        console.error('importPersonFromExport error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});