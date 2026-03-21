import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const sessionToken = body.session_token;

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });

        if (!sessions.length) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        if (!users.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch all required data in parallel (server-side, no client involvement)
        const [activeDatasets, chreosiAccounts, kanaliAccounts, recentSubmissions, notFoundVoters, smsLogs] = await Promise.all([
            base44.asServiceRole.entities.Dataset.filter({ status: 'active' }),
            base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true }),
            base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true }),
            base44.asServiceRole.entities.KanaliSubmission.list('-created_date', 5, 0),
            base44.asServiceRole.entities.NotFoundVoter.list('-created_date', 1, 0),
            base44.asServiceRole.entities.SmsLog.list('-created_date', 50, 0)
        ]);

        // NotFoundVoter total count — fetch count via paginated approach but only need 1 page for count
        // Use a filter count trick: fetch all with small fields is ok since we need count
        let notFoundCount = 0;
        {
            let skip = 0;
            const limit = 500;
            while (true) {
                const batch = await base44.asServiceRole.entities.NotFoundVoter.list('-created_date', limit, skip);
                notFoundCount += batch.length;
                if (batch.length < limit) break;
                skip += limit;
            }
        }

        // Aggregate person stats from active dataset
        let total_people = 0;
        let voted_count = 0;
        const deptMap = {};

        if (activeDatasets.length > 0) {
            const datasetId = activeDatasets[0].id;
            let skip = 0;
            const limit = 500;
            while (true) {
                const batch = await base44.asServiceRole.entities.Person.filter(
                    { dataset_id: datasetId },
                    '-created_date',
                    limit,
                    skip
                );
                if (!batch.length) break;

                for (const p of batch) {
                    total_people++;
                    if (p.voted === true) voted_count++;

                    const dept = p.department || 'Άγνωστο';
                    if (!deptMap[dept]) deptMap[dept] = { total: 0, voted: 0 };
                    deptMap[dept].total++;
                    if (p.voted === true) deptMap[dept].voted++;
                }

                if (batch.length < limit) break;
                skip += limit;
            }
        }

        const not_voted_count = total_people - voted_count;
        const vote_percentage = total_people > 0 ? Math.round((voted_count / total_people) * 100) : 0;

        const top_departments = Object.entries(deptMap)
            .map(([department, d]) => ({
                department,
                total: d.total,
                voted: d.voted,
                percentage: Math.round((d.voted / d.total) * 100)
            }))
            .sort((a, b) => b.voted - a.voted)
            .slice(0, 5);

        return Response.json({
            total_people,
            voted_count,
            not_voted_count,
            vote_percentage,
            top_departments,
            active_chreosi_count: chreosiAccounts.length,
            active_kanali_count: kanaliAccounts.length,
            recent_submissions: recentSubmissions,
            not_found_count: notFoundCount,
            sms_logs: smsLogs,
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('dashboardSummary error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});