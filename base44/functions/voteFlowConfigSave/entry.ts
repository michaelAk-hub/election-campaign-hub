import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BLANK_SYMBOL = '(Κενό)';

function normalizeSymbol(s) {
    const trimmed = (s ?? '').trim();
    return trimmed !== '' ? trimmed : BLANK_SYMBOL;
}

// Normalize all symbol arrays within a mapping before saving — prevents stale "" from being stored
function normalizeMappingSymbols(mapping) {
    if (!Array.isArray(mapping)) return mapping;
    return mapping.map(entry => ({
        ...entry,
        symbols: Array.isArray(entry.symbols) ? entry.symbols.map(normalizeSymbol) : [],
    }));
}

async function strictAuth(base44, session_token) {
    if (!session_token) return { error: 'Unauthorized: No session token', status: 401 };
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
    if (!sessions?.length) return { error: 'Invalid session', status: 401 };
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) return { error: 'Session expired', status: 401 };
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
    if (!users?.length) return { error: 'User not found', status: 401 };
    const user = users[0];
    if (!user.is_active && user.role !== 'ADMIN') return { error: 'Account inactive', status: 401 };
    if (session.session_version_at_login !== undefined && user.session_version !== undefined &&
        session.session_version_at_login !== user.session_version) return { error: 'Session invalidated', status: 401 };
    if (!['ADMIN', 'ORGANOTIKI'].includes(user.role)) return { error: 'Forbidden', status: 403 };
    return { user, session };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const auth = await strictAuth(base44, body.session_token);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        const { is_enabled, mapping, bucket_minutes } = body;

        if (is_enabled && (!Array.isArray(mapping) || mapping.length === 0)) {
            return Response.json({ error: 'mapping must be a non-empty array when is_enabled=true' }, { status: 400 });
        }

        const activeDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
        if (!activeDatasets?.length) {
            return Response.json({ error: 'No active dataset found' }, { status: 400 });
        }

        const datasetId = activeDatasets[0].id;
        const user = auth.user;
        const updatedByName = [user.name, user.surname].filter(Boolean).join(' ').trim() || user.email || '';
        const now = new Date().toISOString();

        // Normalize mapping symbols before saving — prevents "" blanks from being stored
        const normalizedMapping = normalizeMappingSymbols(mapping || []);

        const payload = {
            dataset_id: datasetId,
            is_enabled: !!is_enabled,
            bucket_minutes: Number(bucket_minutes) || 5,
            mapping_json: { data: normalizedMapping },
            updated_by_user_id: user.id,
            updated_by_name: updatedByName,
            updated_at: now,
        };

        const existing = await base44.asServiceRole.entities.PredictionVoteFlowConfig.filter({ dataset_id: datasetId });

        let saved;
        if (existing?.length) {
            saved = await base44.asServiceRole.entities.PredictionVoteFlowConfig.update(existing[0].id, payload);
        } else {
            saved = await base44.asServiceRole.entities.PredictionVoteFlowConfig.create(payload);
        }

        return Response.json({
            config: {
                id: saved.id,
                dataset_id: saved.dataset_id,
                is_enabled: saved.is_enabled,
                bucket_minutes: saved.bucket_minutes,
                mapping: saved.mapping_json?.data || [],
                updated_by_name: saved.updated_by_name,
                updated_at: saved.updated_at,
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});