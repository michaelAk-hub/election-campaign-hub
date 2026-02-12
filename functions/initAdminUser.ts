import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

// This function creates the initial ADMIN user
// Call it once to set up the first admin account

Deno.serve(async (req) => {
    try {
        const { email, password, name, surname, phone } = await req.json();

        if (!email || !password || !name || !surname || !phone) {
            return Response.json({ error: 'Όλα τα πεδία είναι υποχρεωτικά' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Check if admin already exists
        const existingUsers = await base44.asServiceRole.entities.AppUser.filter({});
        const adminExists = existingUsers.some(u => u.role === 'ADMIN');

        if (adminExists) {
            return Response.json({ error: 'Υπάρχει ήδη διαχειριστής στο σύστημα' }, { status: 400 });
        }

        // Check if email exists
        const emailExists = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());
        if (emailExists) {
            return Response.json({ error: 'Το email υπάρχει ήδη' }, { status: 400 });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password);

        // Create admin user
        const admin = await base44.asServiceRole.entities.AppUser.create({
            role: 'ADMIN',
            email: email.toLowerCase(),
            password_hash,
            name,
            surname,
            phone,
            is_active: true, // Admin is always active
            session_version: 1,
            password_changed_at: new Date().toISOString()
        });

        return Response.json({
            success: true,
            message: 'Ο διαχειριστής δημιουργήθηκε επιτυχώς',
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                surname: admin.surname
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});