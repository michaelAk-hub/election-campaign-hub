import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function twilioBasicAuthHeader(accountSid, authToken) {
    return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioVerifyStart(to) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    const body = new URLSearchParams();
    body.set('To', to);
    body.set('Channel', 'sms');
    body.set('Locale', 'el');

    const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
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
        const { preauthToken } = await req.json();

        if (!preauthToken) {
            return Response.json({ error: 'preauthToken απαιτείται' }, { status: 400 });
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

        // Resend cooldown (30s)
        if (challenge.last_send_at) {
            const elapsed = Date.now() - new Date(challenge.last_send_at).getTime();
            if (elapsed < 30000) {
                const wait = Math.ceil((30000 - elapsed) / 1000);
                return Response.json({ error: 'Παρακαλώ περιμένετε', resendAfterSec: wait }, { status: 429 });
            }
        }

        const sendCount = Number(challenge.send_count ?? 0);
        if (sendCount >= 3) {
            return Response.json({ error: 'Υπερβήκατε το όριο αποστολής OTP' }, { status: 429 });
        }

        // Get user phone
        const user = await base44.asServiceRole.entities.AppUser.get(challenge.user_id);
        if (!user?.phone) {
            return Response.json({ error: 'Δεν υπάρχει αριθμός τηλεφώνου για αυτόν τον χρήστη' }, { status: 400 });
        }

        await twilioVerifyStart(user.phone);

        await base44.asServiceRole.entities.MfaChallenge.update(challenge.id, {
            send_count: sendCount + 1,
            last_send_at: new Date().toISOString(),
        });

        // Mask phone for display
        const p = user.phone.replace(/\s+/g, '');
        const maskedPhone = p.length >= 9 ? `${p.slice(0, 6)}***${p.slice(-3)}` : '****';

        return Response.json({ ok: true, resendAfterSec: 30, maskedPhone });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});