import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate admin session
        const { session_token } = await req.json();
        const validation = await base44.functions.invoke('validateAppSession', { session_token });
        
        if (!validation.data.valid || validation.data.user.role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο οι διαχειριστές μπορούν να δημιουργήσουν Organotiki χρήστες' }, { status: 403 });
        }

        const { name, surname, phone, email, password } = await req.json();

        if (!name || !surname || !phone || !email || !password) {
            return Response.json({ error: 'Όλα τα πεδία είναι υποχρεωτικά' }, { status: 400 });
        }

        // Check if email already exists
        const existingUsers = await base44.asServiceRole.entities.AppUser.filter({});
        const emailExists = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());

        if (emailExists) {
            return Response.json({ error: 'Το email υπάρχει ήδη' }, { status: 400 });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password);

        // Create Organotiki user
        const newUser = await base44.asServiceRole.entities.AppUser.create({
            role: 'ORGANOTIKI',
            email: email.toLowerCase(),
            password_hash,
            name,
            surname,
            phone,
            is_active: false, // Inactive by default
            session_version: 1,
            created_by_admin_id: validation.data.user.id,
            password_changed_at: new Date().toISOString()
        });

        // Create notification
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'system',
            category: 'account_update',
            title: 'Νέος Organotiki Χρήστης',
            message: `Δημιουργήθηκε νέος Organotiki χρήστης: ${name} ${surname} (${email})`,
            read: false
        });

        return Response.json({
            success: true,
            user: {
                id: newUser.id,
                name: newUser.name,
                surname: newUser.surname,
                email: newUser.email,
                phone: newUser.phone,
                is_active: newUser.is_active
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});