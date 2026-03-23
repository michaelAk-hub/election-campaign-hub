// This function is no longer used. Person schema is fetched on the frontend
// via base44.entities.Person.schema() which is the live authoritative source.
// File kept to avoid broken references if any old code still points here.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    return Response.json({ error: 'Deprecated. Use base44.entities.Person.schema() on the frontend.' }, { status: 410 });
});