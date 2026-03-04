import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function twilioBasicAuthHeader(accountSid, authToken) {
    return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioVerifyCheck(to, code) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    const body = new URLSearchParams();
    body.set('To', to);
    body.set('Code', code);

    const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
        method: 'POST',
        headers: {
            'Authorization': twilioBasicAuthHeader(accountSid, authToken),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(`Twilio error: ${res.status} ${JSON.stringify(json)}`);
    return json;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { preauthToken, code } = await req.json();

        if (!preauthToken || !code) {
            return Response.json({ error: 'preauthToken και code απαιτούνται' }, { status: 400 });
        }

        if (!/^\d{4,10}$/.test(String(code))) {
            return Response.json({ error: 'Μη έγκυρη μορφή κωδικού' }, { status: 400 });
        }

        // Find challenge
        const challenges = await base44.asServiceRole.entities.MfaChallenge.filter({
            preauth_token: preauthToken,
            is_used: false
        });

        if (challenges.length === 0) {
            return Response.json({ error: 'Challenge δεν βρέθηκε' }, { status: 404 });
        }

        const challenge = challenges[0];

        if (new Date(challenge.expires_at) < new Date()) {
            return Response.json({ error: 'Το challenge έχει λήξει' }, { status: 410 });
        }

        const attempts = Number(challenge.attempts ?? 0);
        if (attempts >= 5) {
            return Response.json({ error: 'Πολλές αποτυχημένες προσπάθειες' }, { status: 429 });
        }

        // Get user phone
        const user = await base44.asServiceRole.entities.AppUser.get(challenge.user_id);
        if (!user?.phone) {
            return Response.json({ error: 'Δεν υπάρχει αριθμός τηλεφώνου' }, { status: 400 });
        }

        const result = await twilioVerifyCheck(user.phone, String(code));

        if (String(result.status).toLowerCase() !== 'approved') {
            await base44.asServiceRole.entities.MfaChallenge.update(challenge.id, {
                attempts: attempts + 1
            });
            return Response.json({ error: 'Λάθος κωδικός OTP' }, { status: 401 });
        }

        // Mark challenge as used
        await base44.asServiceRole.entities.MfaChallenge.update(challenge.id, { is_used: true });

        // Create real session
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await base44.asServiceRole.entities.AppSession.create({
            session_token: sessionToken,
            app_user_id: user.id,
            session_version_at_login: user.session_version || 1,
            expires_at: expiresAt.toISOString(),
            is_active: true
        });

        return Response.json({
            success: true,
            session_token: sessionToken,
            user: {
                id: user.id,
                role: user.role,
                email: user.email,
                name: user.name,
                surname: user.surname
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});