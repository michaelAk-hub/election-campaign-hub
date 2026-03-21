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

        // Strip excluded columns and normalize
        const cleaned = rows.map(row => {
            const out = {};
            for (const [k, v] of Object.entries(row)) {
                if (EXCLUDE_COLS.has(k)) continue;
                // Convert empty strings to null for non-required fields
                if (v === '' || v === undefined) {
                    out[k] = null;
                } else {
                    out[k] = v;
                }
            }
            // Ensure booleans
            if (out.voted !== null && out.voted !== undefined) {
                out.voted = out.voted === true || out.voted === 'TRUE' || out.voted === 1 || out.voted === '1';
            } else {
                out.voted = false;
            }
            if (out.member !== null && out.member !== undefined) {
                out.member = out.member === true || out.member === 'TRUE' || out.member === 1 || out.member === '1';
            } else {
                out.member = false;
            }
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