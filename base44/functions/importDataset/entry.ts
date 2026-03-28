import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeText(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    const t = v.trim().replace(/\s+/g, " ");
    return t === "" ? null : t;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        
        // Validate session
        const sessionToken = body.session_token;
        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await base44.asServiceRole.entities.AppSession.filter({ 
            session_token: sessionToken,
            is_active: true 
        });
        
        if (sessions.length === 0) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const session = sessions[0];
        const users = await base44.asServiceRole.entities.AppUser.filter({ id: session.app_user_id });
        
        if (users.length === 0 || !['ADMIN', 'ORGANOTIKI'].includes(users[0].role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { dataset_id, file_url } = body;

        // Extract data from file
        const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: {
                type: "object",
                properties: {
                    records: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                person_id: { type: "string" },
                                ucid: { type: "string" },
                                department: { type: "string" },
                                admission_year: { type: "string" },
                                academic_level: { type: "string" },
                                mobile_phone: { type: "string" },
                                first_name: { type: "string" },
                                last_name: { type: "string" },
                                contact_person_1: { type: "string" },
                                contact_person_2: { type: "string" },
                                member: { type: "string" },
                                prediction_symbol: { type: "string" },
                                notes: { type: "string" },
                                monadikos_kanali: { type: "string" }
                            }
                        }
                    }
                }
            }
        });

        if (extractResult.status === 'error') {
            return Response.json({ 
                success: false, 
                error: 'Σφάλμα κατά την ανάγνωση του αρχείου' 
            });
        }

        const records = extractResult.output?.records || [];

        // Normalize all string fields before import
        const normalizedPersons = records.map((r) => ({
            dataset_id,
            person_id: normalizeText(r.person_id),
            ucid: normalizeText(r.ucid),
            department: normalizeText(r.department),
            admission_year: normalizeText(r.admission_year),
            academic_level: normalizeText(r.academic_level),
            mobile_phone: normalizeText(r.mobile_phone),
            first_name: normalizeText(r.first_name),
            last_name: normalizeText(r.last_name),
            contact_person_1: normalizeText(r.contact_person_1),
            contact_person_2: normalizeText(r.contact_person_2),
            member: normalizeText(r.member),
            prediction_symbol: normalizeText(r.prediction_symbol),
            notes: normalizeText(r.notes),
            monadikos_kanali: normalizeText(r.monadikos_kanali),
            voted: false,
            voted_at: null,
            row_version: 1,
        }));

        if (normalizedPersons.length > 0) {
            await base44.asServiceRole.entities.Person.bulkCreate(normalizedPersons);
        }

        // Update dataset and set to active
        await base44.asServiceRole.entities.Dataset.update(dataset_id, {
            total_records: normalizedPersons.length,
            status: 'active',
            activated_at: new Date().toISOString()
        });

        // Rebuild prediction stats cache after import
        base44.asServiceRole.functions.invoke('rebuildPredictionStats', {}).catch(() => {});

        return Response.json({ 
            success: true, 
            imported_count: normalizedPersons.length 
        });
    } catch (error) {
        console.error('Import error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});