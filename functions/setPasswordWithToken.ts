import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token, password, fullName } = await req.json();

    if (!token || !password) {
      return Response.json({ error: 'Token and password required' }, { status: 400 });
    }

    // Find invitation token
    const tokens = await base44.asServiceRole.entities.InvitationToken.filter({ 
      token,
      used: false 
    });

    if (tokens.length === 0) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const invitationToken = tokens[0];

    // Check expiration
    if (new Date(invitationToken.expires_at) < new Date()) {
      return Response.json({ error: 'Token has expired' }, { status: 400 });
    }

    // Check if user already exists
    const existingUsers = await base44.asServiceRole.entities.User.filter({ 
      email: invitationToken.email 
    });

    if (existingUsers.length > 0) {
      return Response.json({ error: 'User already exists' }, { status: 400 });
    }

    // Create user with password
    await base44.asServiceRole.entities.User.create({
      email: invitationToken.email,
      full_name: fullName || invitationToken.email.split('@')[0],
      role: invitationToken.role,
      password: password
    });

    // Mark token as used
    await base44.asServiceRole.entities.InvitationToken.update(invitationToken.id, {
      used: true
    });

    return Response.json({ 
      success: true,
      message: 'Password set successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});