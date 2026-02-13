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

        // Column filters (Access-like IN filters)
        if (filtersParam && filtersParam !== '{}') {
            const filters = JSON.parse(filtersParam);
            allPersons = allPersons.filter(person => {
                for (const [field, values] of Object.entries(filters)) {
                    if (!values || values.length === 0) continue;

                    const cellValue = person[field];
                    let matches = false;

                    for (const filterValue of values) {
                        if (filterValue === '__BLANKS__') {
                            // Check for blanks (NULL or empty string)
                            if (cellValue === null || cellValue === undefined || cellValue === '') {
                                matches = true;
                                break;
                            }
                        } else {
                            // Exact match
                            if (cellValue === filterValue) {
                                matches = true;
                                break;
                            }
                        }
                    }

                    if (!matches) return false;
                }
                return true;
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