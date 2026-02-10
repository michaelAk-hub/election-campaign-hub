import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateToken() {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, role } = await req.json();

    if (!email || !role) {
      return Response.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
    if (existingUsers.length > 0) {
      return Response.json({ error: 'Ο χρήστης υπάρχει ήδη' }, { status: 400 });
    }

    // Create invitation token that expires in 5 minutes
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await base44.asServiceRole.entities.InvitationToken.create({
      token,
      email,
      role,
      expires_at: expiresAt,
      invited_by: user.email,
      used: false
    });

    // Send invitation email
    const appUrl = Deno.env.get('BASE44_APP_URL') || 'https://app.base44.com';
    const invitationLink = `${appUrl}/SetPassword?token=${token}`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Πρόσκληση στην Εκλογική Πλατφόρμα',
      body: `
        <h2>Καλωσήρθατε στην Εκλογική Πλατφόρμα!</h2>
        <p>Έχετε προσκληθεί να συμμετάσχετε ως ${role === 'admin' ? 'Διαχειριστής' : 'Οργανωτικός'}.</p>
        <p>Παρακαλώ ορίστε τον κωδικό πρόσβασής σας κάνοντας κλικ στον παρακάτω σύνδεσμο:</p>
        <p><a href="${invitationLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Ορισμός Κωδικού</a></p>
        <p style="color: #ef4444; font-weight: bold;">Ο σύνδεσμος λήγει σε 5 λεπτά.</p>
        <p style="color: #64748b; font-size: 12px;">Αν δεν ζητήσατε αυτή την πρόσκληση, αγνοήστε αυτό το email.</p>
      `
    });

    return Response.json({ 
      success: true, 
      message: 'Η πρόσκληση εστάλη με επιτυχία',
      expiresIn: '5 λεπτά'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});