import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token, password } = await req.json();

    if (!token || !password) {
      return Response.json({ error: 'Token και κωδικός απαιτούνται' }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες' }, { status: 400 });
    }

    // Find invitation token
    const tokens = await base44.asServiceRole.entities.InvitationToken.filter({ token });
    
    if (tokens.length === 0) {
      return Response.json({ error: 'Μη έγκυρος σύνδεσμος πρόσκλησης' }, { status: 400 });
    }

    const invitation = tokens[0];

    // Check if already used
    if (invitation.used) {
      return Response.json({ error: 'Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί' }, { status: 400 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return Response.json({ error: 'Ο σύνδεσμος έχει λήξει. Παρακαλώ ζητήστε νέα πρόσκληση.' }, { status: 400 });
    }

    // Invite user through Base44
    await base44.asServiceRole.users.inviteUser(invitation.email, invitation.role);

    // Mark token as used
    await base44.asServiceRole.entities.InvitationToken.update(invitation.id, {
      used: true
    });

    return Response.json({ 
      success: true, 
      message: 'Ο λογαριασμός σας δημιουργήθηκε επιτυχώς',
      email: invitation.email
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});