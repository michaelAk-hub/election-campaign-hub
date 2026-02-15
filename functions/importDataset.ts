import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
                                notes: { type: "string" }
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
        
        // Import records
        const personsToCreate = records.map(record => ({
            ...record,
            dataset_id,
            voted: false
        }));

        if (personsToCreate.length > 0) {
            await base44.asServiceRole.entities.Person.bulkCreate(personsToCreate);
        }

        // Update dataset and set to active
        await base44.asServiceRole.entities.Dataset.update(dataset_id, {
            total_records: personsToCreate.length,
            status: 'active',
            activated_at: new Date().toISOString()
        });

        return Response.json({ 
            success: true, 
            imported_count: personsToCreate.length 
        });
    } catch (error) {
        console.error('Import error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});