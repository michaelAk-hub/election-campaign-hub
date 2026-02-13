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

        let allPersons = await base44.entities.Person.list();

        // Global search
        if (search) {
            const searchLower = search.toLowerCase();
            allPersons = allPersons.filter(p => 
                (p.person_id?.toLowerCase() || '').includes(searchLower) ||
                (p.first_name?.toLowerCase() || '').includes(searchLower) ||
                (p.last_name?.toLowerCase() || '').includes(searchLower) ||
                (p.mobile_phone?.toLowerCase() || '').includes(searchLower) ||
                (p.department?.toLowerCase() || '').includes(searchLower)
            );
        }

        // Column filters
        if (filtersParam) {
            const filters = JSON.parse(filtersParam);
            allPersons = allPersons.filter(person => {
                return Object.entries(filters).every(([field, filterValue]) => {
                    if (!filterValue) return true;
                    const value = person[field];
                    if (value === null || value === undefined) return false;
                    
                    if (typeof filterValue === 'object' && filterValue.operator) {
                        // Advanced filtering
                        const { operator, value: filterVal } = filterValue;
                        if (operator === 'contains') return String(value).toLowerCase().includes(String(filterVal).toLowerCase());
                        if (operator === 'startsWith') return String(value).toLowerCase().startsWith(String(filterVal).toLowerCase());
                        if (operator === 'equals') return value === filterVal;
                        if (operator === 'gt') return Number(value) > Number(filterVal);
                        if (operator === 'lt') return Number(value) < Number(filterVal);
                    }
                    return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
                });
            });
        }

        // Sorting
        allPersons.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (aVal === bVal) return 0;
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            
            const comparison = aVal < bVal ? -1 : 1;
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        // Pagination
        const total = allPersons.length;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const paginatedPersons = allPersons.slice(start, end);

        return Response.json({
            data: paginatedPersons,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});