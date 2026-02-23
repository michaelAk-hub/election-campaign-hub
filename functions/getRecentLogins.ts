import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const recentLogins = [];

        // Get AppSessions (Admin and Organotiki)
        const appSessions = await base44.entities.AppSession.list('-last_seen_at', 50);
        
        for (const session of appSessions) {
            if (session.last_seen_at) {
                const appUser = await base44.entities.AppUser.filter({ id: session.app_user_id });
                if (appUser && appUser.length > 0) {
                    const userData = appUser[0];
                    recentLogins.push({
                        type: userData.role === 'ADMIN' ? 'Διαχειριστής' : 'Οργανωτικός',
                        name: `${userData.name} ${userData.surname}`,
                        username: userData.email,
                        last_seen: session.last_seen_at,
                        is_active: session.is_active
                    });
                }
            }
        }

        // Get PortalSessions (Kanali and Chreosi)
        const portalSessions = await base44.entities.PortalSession.list('-updated_date', 50);
        
        for (const session of portalSessions) {
            if (session.portal_type === 'kanali') {
                const kanaliAccount = await base44.entities.KanaliAccount.filter({ username: session.username });
                if (kanaliAccount && kanaliAccount.length > 0) {
                    recentLogins.push({
                        type: `Κανάλι ${session.kanali_type || ''}`,
                        name: session.username,
                        username: session.username,
                        last_seen: session.updated_date,
                        is_active: session.is_active
                    });
                }
            } else if (session.portal_type === 'chreosi') {
                const chreosiAccount = await base44.entities.ChreosiAccount.filter({ username: session.username });
                if (chreosiAccount && chreosiAccount.length > 0) {
                    const account = chreosiAccount[0];
                    recentLogins.push({
                        type: 'Χρεωστικός',
                        name: account.display_name || session.username,
                        username: session.username,
                        last_seen: session.updated_date,
                        is_active: session.is_active
                    });
                }
            }
        }

        // Sort by last_seen descending
        recentLogins.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));

        // Take top 20
        const top20 = recentLogins.slice(0, 20);

        return Response.json({ logins: top20 });

    } catch (error) {
        console.error('Error fetching recent logins:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});