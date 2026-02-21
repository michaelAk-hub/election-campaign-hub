import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { columnKey, searchText = '' } = await req.json();

        if (!columnKey) {
            return Response.json({ error: 'columnKey is required' }, { status: 400 });
        }

        // Get active dataset
        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (activeDatasets.length === 0) {
            return Response.json({ values: [], hasBlanks: false });
        }
        const activeDatasetId = activeDatasets[0].id;

        // Fetch all persons from active dataset
        let allPersons = [];
        let skip = 0;
        const limit = 1000;
        
        while (true) {
            const batch = await base44.asServiceRole.entities.Person.filter(
                { dataset_id: activeDatasetId },
                '-created_date',
                limit,
                skip
            );
            
            if (batch.length === 0) break;
            allPersons = allPersons.concat(batch);
            
            if (batch.length < limit) break;
            skip += limit;
        }

        // Extract unique values for the column
        const isCustomColumn = columnKey.startsWith('custom:');
        const fieldKey = isCustomColumn ? columnKey.substring(7) : columnKey;
        
        const valuesSet = new Set();
        let hasBlanks = false;

        for (const person of allPersons) {
            let value;
            
            if (isCustomColumn) {
                value = person.custom_data?.[fieldKey];
            } else {
                value = person[fieldKey];
            }

            // Check for blanks
            if (value === null || value === undefined || value === '' || 
                (typeof value === 'string' && value.trim() === '')) {
                hasBlanks = true;
            } else {
                // Convert to string for consistent handling
                const strValue = String(value);
                valuesSet.add(strValue);
            }
        }

        // Convert to sorted array
        let values = Array.from(valuesSet).sort((a, b) => {
            // Natural sort for numbers and strings
            const aNum = Number(a);
            const bNum = Number(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.localeCompare(b, 'el');
        });

        // Apply search filter if provided
        if (searchText) {
            const searchLower = searchText.toLowerCase();
            values = values.filter(v => v.toLowerCase().includes(searchLower));
        }

        return Response.json({
            values,
            hasBlanks,
            totalCount: values.length + (hasBlanks ? 1 : 0)
        });

    } catch (error) {
        console.error('Error fetching filter values:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});