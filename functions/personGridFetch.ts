import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const startRow = parseInt(searchParams.get('startRow') || '0');
        const endRow = parseInt(searchParams.get('endRow') || '100');
        const sortField = searchParams.get('sortField') || 'created_date';
        const sortDirection = searchParams.get('sortDirection') || 'desc';
        const search = searchParams.get('search') || '';
        const filtersParam = searchParams.get('filters');

        const limit = endRow - startRow;
        const sort = sortDirection === 'asc' ? sortField : `-${sortField}`;
        let query = {};

        // Global search
        if (search) {
            const searchLower = search.toLowerCase();
            query.$or = [
                { person_id: { $regex: searchLower, $options: 'i' } },
                { first_name: { $regex: searchLower, $options: 'i' } },
                { last_name: { $regex: searchLower, $options: 'i' } },
                { mobile_phone: { $regex: searchLower, $options: 'i' } },
                { department: { $regex: searchLower, $options: 'i' } }
            ];
        }

        // Column filters - supports Access-style set filters with blanks
        if (filtersParam) {
            const filters = JSON.parse(filtersParam);
            Object.entries(filters).forEach(([field, filterValue]) => {
                if (!filterValue) return;
                
                // Access-style filter (set-based with blanks)
                if (typeof filterValue === 'object' && filterValue.filterType === 'set') {
                    const { values = [], includeBlanks = false } = filterValue;
                    
                    if (includeBlanks && values.length > 0) {
                        // Include both selected values and blanks
                        query.$or = query.$or || [];
                        query.$or.push(
                            { [field]: { $in: values } },
                            { [field]: null },
                            { [field]: '' },
                            { [field]: { $exists: false } }
                        );
                    } else if (includeBlanks) {
                        // Only blanks
                        query.$or = query.$or || [];
                        query.$or.push(
                            { [field]: null },
                            { [field]: '' },
                            { [field]: { $exists: false } }
                        );
                    } else if (values.length > 0) {
                        // Only selected values
                        query[field] = { $in: values };
                    }
                }
                // Legacy filters (for backwards compatibility)
                else if (typeof filterValue === 'object' && filterValue.operator) {
                    const { operator, value: filterVal } = filterValue;
                    if (operator === 'contains') query[field] = { $regex: String(filterVal), $options: 'i' };
                    if (operator === 'startsWith') query[field] = { $regex: `^${String(filterVal)}`, $options: 'i' };
                    if (operator === 'equals') query[field] = String(filterVal);
                    if (operator === 'gt') query[field] = { $gt: Number(filterVal) };
                    if (operator === 'lt') query[field] = { $lt: Number(filterVal) };
                    if (operator === 'in') query[field] = { $in: filterVal };
                } else if (typeof filterValue === 'boolean') {
                    query[field] = filterValue;
                } else {
                    query[field] = { $regex: String(filterValue), $options: 'i' };
                }
            });
        }

        // Fetch windowed data for infinite scroll
        const persons = await base44.entities.Person.filter(
            query,
            sort,
            limit,
            startRow
        );

        // Count total records efficiently by fetching in batches
        let total = 0;
        const countBatchSize = 1000;
        let countSkip = 0;
        while (true) {
            const batch = await base44.entities.Person.filter(query, sort, countBatchSize, countSkip);
            total += batch.length;
            if (batch.length < countBatchSize) {
                break; // Last batch, we've counted all records
            }
            countSkip += countBatchSize;
        }

        console.log("🔍 [personGridFetch] Returning data:", persons.length, "rows, total:", total, "startRow:", startRow, "endRow:", endRow);

        return Response.json({
            rows: persons,
            lastRow: total
        });

    } catch (error) {
        console.error("❌ [personGridFetch] Error:", error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});