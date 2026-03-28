import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { submittedId, username, sessionToken } = await req.json();

        if (!submittedId || !username || !sessionToken) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const normalizedId = String(submittedId).trim();

        // Validate portal session server-side
        const sessions = await base44.asServiceRole.entities.PortalSession.filter({
            session_token: sessionToken,
            username,
            portal_type: 'kanali',
            is_active: true
        });

        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            await base44.asServiceRole.entities.PortalSession.update(session.id, { is_active: false });
            return Response.json({ error: 'Session expired' }, { status: 401 });
        }

        // Look up person by monadikos_kanali
        const people = await base44.asServiceRole.entities.Person.filter({ monadikos_kanali: normalizedId });

        let status, reason;
        let personRecordId = null;

        if (people.length === 0) {
            status = 'NOT_FOUND';
            reason = 'Δεν βρέθηκε εγγραφή με αυτό το ID';
            await base44.asServiceRole.entities.NotFoundVoter.create({
                submitted_id: normalizedId,
                reason_text: reason,
                kanali_username: username
            });
        } else if (people[0].voted) {
            status = 'ALREADY_VOTED';
            reason = 'Ήδη ήταν Ψήφισε = ΝΑΙ';
            personRecordId = people[0].id;
        } else {
            const person = people[0];
            const expectedVersion = person.row_version || 1;
            // Use a precise timestamp as a unique marker for this request
            const votedAt = new Date().toISOString();

            // Attempt the update
            await base44.asServiceRole.entities.Person.update(person.id, {
                voted: true,
                voted_at: votedAt,
                row_version: expectedVersion + 1
            });

            // Re-read immediately to verify we won any concurrent race.
            // If two requests race, the last writer's row_version and voted_at will differ
            // from what the first writer expected — first writer detects the conflict here.
            const verify = await base44.asServiceRole.entities.Person.filter({ monadikos_kanali: normalizedId });
            const updated = verify[0];

            if (!updated || !updated.voted) {
                status = 'ERROR';
                reason = 'Σφάλμα ενημέρωσης';
            } else if (updated.row_version !== expectedVersion + 1 || updated.voted_at !== votedAt) {
                // Another concurrent request's update landed after ours — they won the race
                status = 'ALREADY_VOTED';
                reason = 'Ήδη ήταν Ψήφισε = ΝΑΙ';
            } else {
                status = 'MARKED_VOTED';
                reason = 'Η ψήφος καταχωρήθηκε επιτυχώς';
            }
            personRecordId = person.id;
        }

        // Always await audit log — must be durable
        await base44.asServiceRole.entities.KanaliSubmission.create({
            kanali_username: username,
            submitted_id: normalizedId,
            status,
            reason_text: reason,
            person_record_id: personRecordId
        });

        // Rebuild prediction stats cache after a successful vote — pass internal_key so auth is bypassed safely
        if (status === 'MARKED_VOTED') {
            base44.asServiceRole.functions.invoke('rebuildPredictionStats', { internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET') }).catch(() => {});
        }

        return Response.json({ status, reason });

    } catch (error) {
        console.error('submitKanaliVote error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});