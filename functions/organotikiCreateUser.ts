import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate admin session
        const adminSessionToken = req.headers.get('x-session-token');
        if (!adminSessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const validateRes = await base44.functions.invoke('organotikiValidateSession', {
            session_token: adminSessionToken
        });

        if (!validateRes.data.valid || validateRes.data.user.role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο διαχειριστές μπορούν να δημιουργήσουν χρήστες' }, { status: 403 });
        }

        const adminUser = validateRes.data.user;
        const { name, surname, phone, email, password, is_active } = await req.json();

        // Validate required fields
        if (!name || !surname || !phone || !email || !password) {
            return Response.json({ error: 'Όλα τα πεδία είναι υποχρεωτικά' }, { status: 400 });
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();

        // Check if email already exists
        const existing = await base44.asServiceRole.entities.OrganotikiUser.filter({
            email: normalizedEmail
        });

        if (existing.length > 0) {
            return Response.json({ error: 'Το email υπάρχει ήδη' }, { status: 400 });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password);

        // Create user
        const newUser = await base44.asServiceRole.entities.OrganotikiUser.create({
            role: 'ORGANOTIKI',
            email: normalizedEmail,
            password_hash,
            name,
            surname,
            phone,
            is_active: is_active || false,
            session_version: 1,
            password_changed_at: new Date().toISOString(),
            created_by_admin_email: adminUser.email
        });

        // Create notification
        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'success',
            category: 'account_update',
            title: 'Νέος Οργανωτικός',
            message: `Δημιουργήθηκε νέος οργανωτικός: ${name} ${surname} (${normalizedEmail})`,
            read: false
        });

        return Response.json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                surname: newUser.surname,
                phone: newUser.phone,
                is_active: newUser.is_active
            }
        });
    } catch (error) {
        console.error('Create user error:', error);
        return Response.json({ error: 'Σφάλμα κατά τη δημιουργία χρήστη' }, { status: 500 });
    }
});