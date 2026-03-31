import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import bcrypt from 'npm:bcryptjs@2.4.3';

function normalizeUsername(str) {
    if (!str) return '';
    return str.trim().replace(/\s+/g, ' ').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function generateToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyAndMigratePassword(entityClient, entityId, storedHash, plainPassword, existingPlain) {
    if (!storedHash) return false;
    // Already a bcrypt hash
    if (storedHash.startsWith('$2')) {
        const match = await bcrypt.compare(plainPassword, storedHash);
        // If plain_password not yet saved, save it now
        if (match && !existingPlain) {
            await entityClient.update(entityId, { plain_password: plainPassword });
        }
        return match;
    }
    // Plain text (legacy) — allow once, then migrate to hash and save plain_password
    if (storedHash === plainPassword) {
        const hash = await bcrypt.hash(plainPassword, 10);
        await entityClient.update(entityId, { password_hash: hash, plain_password: plainPassword });
        return true;
    }
    return false;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { username, password } = await req.json();

        if (!username || !password) {
            return Response.json({ success: false, error: 'Λάθος στοιχεία σύνδεσης' });
        }

        const normalizedUsername = normalizeUsername(username);

        // Try Chreosi accounts — fetch all and match by normalized username
        // (exact filter won't work for normalized keys since DB stores original casing)
        let chreosiAccountsAll = [];
        let cSkip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.ChreosiAccount.list(null, 500, cSkip);
            if (!batch || batch.length === 0) break;
            chreosiAccountsAll = chreosiAccountsAll.concat(batch);
            cSkip += 500;
            if (batch.length < 500) break;
        }
        const chreosiAccounts = chreosiAccountsAll.filter(a => normalizeUsername(a.username) === normalizedUsername);
        if (chreosiAccounts.length > 0) {
            const account = chreosiAccounts[0];
            if (!account.is_active) {
                return Response.json({ success: false, error: 'Ο λογαριασμός είναι απενεργοποιημένος' });
            }
            const valid = await verifyAndMigratePassword(
                base44.asServiceRole.entities.ChreosiAccount,
                account.id,
                account.password_hash,
                password,
                account.plain_password
            );
            if (!valid) {
                return Response.json({ success: false, error: 'Λάθος στοιχεία σύνδεσης' });
            }
            const token = generateToken();
            await base44.asServiceRole.entities.PortalSession.create({
                session_token: token,
                username: normalizedUsername,
                portal_type: 'chreosi',
                is_active: true,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
            return Response.json({ success: true, token, portalType: 'chreosi', username: normalizedUsername });
        }

        // Try Kanali accounts — same normalized lookup
        let kanaliAccountsAll = [];
        let kSkip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.KanaliAccount.list(null, 500, kSkip);
            if (!batch || batch.length === 0) break;
            kanaliAccountsAll = kanaliAccountsAll.concat(batch);
            kSkip += 500;
            if (batch.length < 500) break;
        }
        const kanaliAccounts = kanaliAccountsAll.filter(a => normalizeUsername(a.username) === normalizedUsername);
        if (kanaliAccounts.length > 0) {
            const account = kanaliAccounts[0];
            if (!account.is_active) {
                return Response.json({ success: false, error: 'Ο λογαριασμός είναι απενεργοποιημένος' });
            }
            const valid = await verifyAndMigratePassword(
                base44.asServiceRole.entities.KanaliAccount,
                account.id,
                account.password_hash,
                password,
                account.plain_password
            );
            if (!valid) {
                return Response.json({ success: false, error: 'Λάθος στοιχεία σύνδεσης' });
            }
            const token = generateToken();
            await base44.asServiceRole.entities.PortalSession.create({
                session_token: token,
                username: normalizedUsername,
                portal_type: 'kanali',
                kanali_type: account.user_type,
                is_active: true,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
            return Response.json({
                success: true,
                token,
                portalType: 'kanali',
                username: normalizedUsername,
                kanaliType: account.user_type
            });
        }

        return Response.json({ success: false, error: 'Λάθος στοιχεία σύνδεσης' });

    } catch (error) {
        console.error('portalLogin error:', error);
        return Response.json({ success: false, error: 'Σφάλμα σύνδεσης' }, { status: 500 });
    }
});