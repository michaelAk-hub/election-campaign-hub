import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '50');
        const sortField = searchParams.get('sortField') || 'created_date';
        const sortDirection = searchParams.get('sortDirection') || 'desc';
        const search = searchParams.get('search') || '';
        const filtersParam = searchParams.get('filters');

        const skip = (page - 1) * pageSize;
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

        // Column filters
        if (filtersParam) {
            const filters = JSON.parse(filtersParam);
            Object.entries(filters).forEach(([field, filterValue]) => {
                if (!filterValue) return;
                
                if (typeof filterValue === 'object' && filterValue.operator) {
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

        // Fetch paginated and filtered data
        const persons = await base44.entities.Person.filter(
            query,
            sort,
            pageSize,
            skip
        );

        // Fetch total count of filtered records
        const total = (await base44.entities.Person.filter(query, sort, null, null)).length;

        console.log("🔍 [personGridFetch] Returning data:", persons.length, "rows, total:", total, "search:", search);

        return Response.json({
            data: persons,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        });

    } catch (error) {
        console.error("❌ [personGridFetch] Error:", error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});