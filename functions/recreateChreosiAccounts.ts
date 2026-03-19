import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function randomPassword(len = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < len; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    return pass;
}

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

    const contactList = [...uniqueContacts].sort();

    // Create accounts in batches of 50
    let created = 0;
    const batchSize = 50;
    for (let i = 0; i < contactList.length; i += batchSize) {
        const batch = contactList.slice(i, i + batchSize).map(name => ({
            username: name,
            display_name: name,
            plain_password: randomPassword(),
            password_hash: randomPassword(),
            is_active: true,
            personal_note: '',
            allowed_prediction_symbols: ['Σ', 'Ο', 'Π'],
        }));
        // Set password_hash = plain_password for consistency
        for (const acc of batch) acc.password_hash = acc.plain_password;
        await base44.asServiceRole.entities.ChreosiAccount.bulkCreate(batch);
        created += batch.length;
    }

    return Response.json({
        success: true,
        total_unique_contacts: contactList.length,
        accounts_created: created,
    });
});