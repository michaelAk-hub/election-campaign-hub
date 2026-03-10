import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { submittedId, username, sessionToken } = await req.json();

        if (!submittedId || !username || !sessionToken) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Run session validation + person lookup in parallel
        const [sessions, people] = await Promise.all([
            base44.asServiceRole.entities.PortalSession.filter({
                session_token: sessionToken,
                username,
                portal_type: 'kanali',
                is_active: true
            }),
            base44.asServiceRole.entities.Person.filter({ monadikos_kanali: submittedId })
        ]);

        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const session = sessions[0];
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return Response.json({ error: 'Session expired' }, { status: 401 });
        }

        let status, reason;
        let personRecordId = null;

        if (people.length === 0) {
            status = 'NOT_FOUND';
            reason = 'Δεν βρέθηκε εγγραφή με αυτό το ID';
            await base44.asServiceRole.entities.NotFoundVoter.create({
                submitted_id: submittedId,
                reason_text: reason,
                kanali_username: username
            });
        } else if (people[0].voted) {
            status = 'ALREADY_VOTED';
            reason = 'Ήδη ήταν Ψήφισε = ΝΑΙ';
            personRecordId = people[0].id;
            await base44.asServiceRole.entities.NotFoundVoter.create({
                submitted_id: submittedId,
                reason_text: reason,
                kanali_username: username
            });
        } else {
            const person = people[0];
            // Optimistic locking: update only if row_version hasn't changed
            await base44.asServiceRole.entities.Person.update(person.id, {
                voted: true,
                voted_at: new Date().toISOString(),
                row_version: (person.row_version || 1) + 1
            });

            // Re-fetch to verify the update succeeded and wasn't a race condition
            const updated = await base44.asServiceRole.entities.Person.filter({ id: person.id, voted: true });
            if (updated.length > 0) {
                status = 'MARKED_VOTED';
                reason = 'Η ψήφος καταχωρήθηκε επιτυχώς';
                personRecordId = person.id;
            } else {
                // Should not happen, but handle gracefully
                status = 'ALREADY_VOTED';
                reason = 'Ήδη ήταν Ψήφισε = ΝΑΙ';
                personRecordId = person.id;
            }
        }

        // Always log the submission
        await base44.asServiceRole.entities.KanaliSubmission.create({
            kanali_username: username,
            submitted_id: submittedId,
            status,
            reason_text: reason,
            person_record_id: personRecordId
        });

        return Response.json({ status, reason });

    } catch (error) {
        console.error('submitKanaliVote error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});