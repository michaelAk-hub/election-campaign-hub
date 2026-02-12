import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { hashSync } from 'npm:bcrypt@5.1.1';

// This function creates the initial ADMIN user
// Run this ONCE to bootstrap the system
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { email, password, name, surname, phone } = await req.json();

        if (!email || !password || !name || !surname || !phone) {
            return Response.json({ error: 'Όλα τα πεδία είναι υποχρεωτικά' }, { status: 400 });
        }

        // Check if any admin exists
        const existingAdmins = await base44.asServiceRole.entities.AppUser.filter({
            role: 'ADMIN'
        });

        if (existingAdmins.length > 0) {
            return Response.json({ error: 'Υπάρχει ήδη διαχειριστής στο σύστημα' }, { status: 400 });
        }

        // Hash password
        const password_hash = hashSync(password, 10);

        // Create admin
        const admin = await base44.asServiceRole.entities.AppUser.create({
            role: 'ADMIN',
            email: email.toLowerCase(),
            password_hash,
            name,
            surname,
            phone,
            is_active: true,
            session_version: 1,
            password_changed_at: new Date().toISOString()
        });

        return Response.json({
            success: true,
            message: 'Δημιουργήθηκε ο πρώτος διαχειριστής',
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