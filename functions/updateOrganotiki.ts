import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate admin session
        const { session_token, user_id, updates } = await req.json();
        const validation = await base44.functions.invoke('validateAppSession', { session_token });
        
        if (!validation.data.valid || validation.data.user.role !== 'ADMIN') {
            return Response.json({ error: 'Μόνο οι διαχειριστές μπορούν να ενημερώσουν Organotiki χρήστες' }, { status: 403 });
        }

        if (!user_id || !updates) {
            return Response.json({ error: 'Απαιτούνται user_id και updates' }, { status: 400 });
        }

        // Get user
        const user = await base44.asServiceRole.entities.AppUser.get(user_id);

        if (!user || user.role !== 'ORGANOTIKI') {
            return Response.json({ error: 'Χρήστης Organotiki δεν βρέθηκε' }, { status: 404 });
        }

        // Update user
        const updatedUser = await base44.asServiceRole.entities.AppUser.update(user_id, updates);

        // Create notification
        let notificationMessage = `Ενημερώθηκε ο λογαριασμός: ${user.name} ${user.surname}`;
        
        if (updates.is_active !== undefined) {
            notificationMessage = updates.is_active 
                ? `Ενεργοποιήθηκε ο λογαριασμός: ${user.name} ${user.surname}`
                : `Απενεργοποιήθηκε ο λογαριασμός: ${user.name} ${user.surname}`;
        }

        await base44.asServiceRole.entities.Notification.create({
            recipient_type: 'admin',
            type: 'system',
            category: 'account_update',
            title: 'Ενημέρωση Organotiki Χρήστη',
            message: notificationMessage,
            read: false
        });

        return Response.json({
            success: true,
            user: updatedUser
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});