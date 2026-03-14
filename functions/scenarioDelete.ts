import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { session_token, scenario_id } = body;

    // --- Input validation (never 500) ---
    if (!session_token) {
        return Response.json({ message: 'Session token απαιτείται.' }, { status: 401 });
    }
    if (!scenario_id) {
        return Response.json({ message: 'Scenario ID απαιτείται.' }, { status: 400 });
    }

    // --- Auth validation (never 500) ---
    let sessions;
    try {
        sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    } catch (_) {
        sessions = [];
    }
    if (!sessions?.length) {
        return Response.json({ message: 'Μη έγκυρη ή ληγμένη συνεδρία.' }, { status: 401 });
    }
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
        return Response.json({ message: 'Η συνεδρία έχει λήξει.' }, { status: 401 });
    }

    let users;
    try {
        users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
    } catch (_) {
        users = [];
    }
    if (!users?.length) {
        return Response.json({ message: 'Ο χρήστης δεν βρέθηκε.' }, { status: 401 });
    }
    if (!['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
        return Response.json({ message: 'Δεν έχετε δικαίωμα διαγραφής.' }, { status: 403 });
    }

    // --- Scenario existence check (never 500) ---
    let scenarios;
    try {
        scenarios = await base44.asServiceRole.entities.PredictionScenario.filter({ id: scenario_id });
    } catch (_) {
        scenarios = [];
    }
    if (!scenarios?.length) {
        return Response.json({ message: 'Το σενάριο δεν βρέθηκε.' }, { status: 404 });
    }

    // --- Actual delete (only true unexpected errors become 500) ---
    try {
        await base44.asServiceRole.entities.PredictionScenario.delete(scenario_id);
        return Response.json({ success: true });
    } catch (error) {
        console.error('[scenarioDelete] Unexpected error during delete:', error.message);
        return Response.json({ message: 'Σφάλμα κατά τη διαγραφή.' }, { status: 500 });
    }
});