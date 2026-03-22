import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const sessionToken = body.session_token;

        console.log('[dashboardSummary] session_token present:', !!sessionToken);

        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[dashboardSummary] validating session...');
        const sessions = await base44.asServiceRole.entities.AppSession.filter({
            session_token: sessionToken,
            is_active: true
        });
        console.log('[dashboardSummary] sessions found:', sessions.length);

        if (!sessions.length) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
        console.log('[dashboardSummary] user found:', users.length > 0, 'role:', users[0]?.role);

        if (!users.length || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        console.log('[dashboardSummary] fetching parallel data...');
        const [activeDatasets, chreosiAccounts, kanaliAccounts, recentSubmissions, smsLogs] = await Promise.all([
            base44.asServiceRole.entities.Dataset.filter({ status: 'active' }),
            base44.asServiceRole.entities.ChreosiAccount.filter({ is_active: true }),
            base44.asServiceRole.entities.KanaliAccount.filter({ is_active: true }),
            base44.asServiceRole.entities.KanaliSubmission.list('-created_date', 5, 0),
            base44.asServiceRole.entities.SmsLog.list('-created_date', 50, 0)
        ]);
        console.log('[dashboardSummary] parallel fetch done. datasets:', activeDatasets.length, 'chreosi:', chreosiAccounts.length, 'kanali:', kanaliAccounts.length);

        // NotFoundVoter total count
        console.log('[dashboardSummary] counting NotFoundVoters...');
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
        console.log('[dashboardSummary] not_found_count:', notFoundCount);

        // Aggregate person stats from active dataset
        let total_people = 0;
        let voted_count = 0;
        const deptMap = {};

        if (activeDatasets.length > 0) {
            const datasetId = activeDatasets[0].id;
            console.log('[dashboardSummary] fetching persons for dataset:', datasetId);
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
            console.log('[dashboardSummary] persons fetched:', total_people, 'voted:', voted_count);
        } else {
            console.log('[dashboardSummary] no active dataset found');
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

        const payload = {
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
        };

        console.log('[dashboardSummary] returning payload. keys:', Object.keys(payload).join(', '), '| total_people:', total_people, '| voted_count:', voted_count);

        return Response.json(payload);

    } catch (error) {
        console.error('[dashboardSummary] FATAL ERROR:', error.message, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
    }
});