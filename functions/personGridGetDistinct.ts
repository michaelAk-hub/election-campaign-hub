import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { columnName, activeFilters } = await req.json();

        if (!columnName) {
            return Response.json({ error: 'Missing columnName' }, { status: 400 });
        }

        // Get all persons (with other filters applied if provided)
        let persons = await base44.entities.Person.list();

        // Apply active filters from other columns
        if (activeFilters && typeof activeFilters === 'object') {
            persons = persons.filter(person => {
                for (const [field, values] of Object.entries(activeFilters)) {
                    // Skip the current column
                    if (field === columnName) continue;
                    if (!values || values.length === 0) continue;

                    const cellValue = person[field];
                    let matches = false;

                    for (const filterValue of values) {
                        if (filterValue === '__BLANKS__') {
                            // Check for NULL or empty string (text fields)
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

        // Get distinct values for the column
        const distinctValues = new Set();
        let hasBlanks = false;

        persons.forEach(person => {
            const value = person[columnName];
            if (value === null || value === undefined || value === '') {
                hasBlanks = true;
            } else {
                distinctValues.add(value);
            }
        });

        // Convert to sorted array
        const values = Array.from(distinctValues).sort((a, b) => {
            if (typeof a === 'string' && typeof b === 'string') {
                return a.localeCompare(b, 'el');
            }
            return a < b ? -1 : 1;
        });

        return Response.json({
            success: true,
            values,
            hasBlanks
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});