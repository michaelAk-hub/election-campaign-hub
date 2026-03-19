import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Collect all unique contact persons from Person table
    const uniqueContacts = new Set();
    let skip = 0;
    const limit = 500;

    while (true) {
        const records = await base44.asServiceRole.entities.Person.list(null, limit, skip);
        if (!records || records.length === 0) break;
        for (const r of records) {
            const c1 = r.contact_person_1?.trim();
            const c2 = r.contact_person_2?.trim();
            if (c1) uniqueContacts.add(c1);
            if (c2) uniqueContacts.add(c2);
        }
        skip += limit;
        if (records.length < limit) break;
    }

    const existing = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500);
    const existingUsernames = new Set(existing.map(e => e.username));

    const missing = [...uniqueContacts].filter(c => !existingUsernames.has(c)).sort();
    const extra = [...existingUsernames].filter(u => !uniqueContacts.has(u)).sort();

    return Response.json({
        total_persons: skip, // approx
        unique_contacts_in_person: uniqueContacts.size,
        existing_chreosi_accounts: existing.length,
        missing_accounts: missing.length,
        extra_accounts: extra.length,
        missing_list: missing,
        extra_list: extra,
    });
});