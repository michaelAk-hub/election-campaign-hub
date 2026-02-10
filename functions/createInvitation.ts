import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, role } = await req.json();

    if (!email || !role) {
      return Response.json({ error: 'Email and role required' }, { status: 400 });
    }

    // Generate unique token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Create invitation token record
    await base44.asServiceRole.entities.InvitationToken.create({
      token,
      email,
      role,
      expires_at: expiresAt,
      used: false
    });

    // Send email with invitation link
    const appUrl = `https://app.base44.com/apps/${Deno.env.get('BASE44_APP_ID')}`;
    const inviteUrl = `${appUrl}?page=SetPassword&token=${token}`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Πρόσκληση στην Εκλογική Πλατφόρμα',
      body: `
        <h2>Καλώς ήρθατε στην Εκλογική Πλατφόρμα</h2>
        <p>Έχετε προσκληθεί ως ${role === 'admin' ? 'Διαχειριστής' : 'Οργανωτικός'}.</p>
        <p>Για να ολοκληρώσετε την εγγραφή σας και να ορίσετε τον κωδικό σας, κάντε κλικ στον παρακάτω σύνδεσμο:</p>
        <p><a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Ορισμός Κωδικού</a></p>
        <p style="color: #ef4444; font-weight: bold;">⚠️ Ο σύνδεσμος λήγει σε 5 λεπτά</p>
        <p style="color: #64748b; font-size: 12px;">Αν δεν ζητήσατε αυτή την πρόσκληση, αγνοήστε αυτό το email.</p>
      `
    });

    return Response.json({ 
      success: true,
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});