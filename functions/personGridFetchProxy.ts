import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Enforce RBAC: Admin or Organotiki only
        if (user.role !== 'admin' && user.role !== 'ADMIN' && user.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Forbidden: Admin/Organotiki access required' }, { status: 403 });
        }

        const payload = await req.json();
        const {
            datasetId,
            blockSize = 100,
            cursor = null,
            sortModel = [],
            search = '',
            filters = {}
        } = payload;

        // Validate required datasetId
        if (!datasetId) {
            return Response.json({ error: 'datasetId is required' }, { status: 400 });
        }

        // Get secrets
        const GRID_API_BASE_URL = Deno.env.get('GRID_API_BASE_URL');
        const GRID_API_KEY = Deno.env.get('GRID_API_KEY');

        if (!GRID_API_BASE_URL || !GRID_API_KEY) {
            console.error('Missing GRID_API_BASE_URL or GRID_API_KEY');
            return Response.json({ error: 'Grid API not configured' }, { status: 500 });
        }

        // Call external Grid API
        const externalResponse = await fetch(`${GRID_API_BASE_URL}/grid/person/fetch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GRID_API_KEY}`
            },
            body: JSON.stringify({
                datasetId,
                blockSize,
                cursor,
                sortModel,
                search,
                filters
            })
        });

        if (!externalResponse.ok) {
            const errorText = await externalResponse.text();
            console.error('External Grid API error:', externalResponse.status, errorText);
            return Response.json({ 
                error: 'External Grid API error',
                status: externalResponse.status 
            }, { status: 502 });
        }

        const data = await externalResponse.json();

        // Response format: { rows, nextCursor, hasMore, totalExact, totalApprox }
        return Response.json(data);

    } catch (error) {
        console.error('personGridFetchProxy error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});