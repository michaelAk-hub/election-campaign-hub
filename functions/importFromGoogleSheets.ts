import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { spreadsheetId, sheetName } = await req.json();

    if (!spreadsheetId) {
      return Response.json({ error: 'Spreadsheet ID required' }, { status: 400 });
    }

    // Get Google Sheets access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');

    // Fetch data from Google Sheets
    const range = `${sheetName || 'Voters'}!A1:O10000`;
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const sheetsData = await sheetsResponse.json();
    const rows = sheetsData.values || [];

    if (rows.length < 2) {
      return Response.json({ error: 'No data found in sheet' }, { status: 400 });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Find column indices
    const getColIndex = (name) => headers.findIndex(h => h?.includes(name));
    
    const colMap = {
      person_id: getColIndex('ΑΤ'),
      ucid: getColIndex('UCID'),
      last_name: getColIndex('Επίθετο'),
      first_name: getColIndex('Όνομα'),
      department: getColIndex('Τμήμα'),
      admission_year: getColIndex('Εισδοχή'),
      academic_level: getColIndex('Επίπεδο'),
      mobile_phone: getColIndex('Κινητό'),
      contact_person_1: getColIndex('Άτομο 1'),
      contact_person_2: getColIndex('Άτομο 2'),
      member: getColIndex('Μέλος'),
      election_cycle: getColIndex('Σύμβολο'),
      voted: getColIndex('Ψήφισε'),
      notes: getColIndex('Σημειώσεις'),
      id: getColIndex('ID (Internal)')
    };

    let created = 0;
    let updated = 0;
    let errors = [];

    for (const row of dataRows) {
      try {
        const personData = {};
        
        for (const [field, colIdx] of Object.entries(colMap)) {
          if (colIdx >= 0 && row[colIdx]) {
            if (field === 'voted') {
              personData[field] = row[colIdx] === 'ΝΑΙ';
            } else if (field !== 'id') {
              personData[field] = row[colIdx];
            }
          }
        }

        if (!personData.person_id) {
          continue; // Skip rows without person_id
        }

        // Check if record exists by internal ID or person_id
        const existingId = colMap.id >= 0 ? row[colMap.id] : null;
        
        if (existingId) {
          // Update existing record
          await base44.asServiceRole.entities.Person.update(existingId, personData);
          updated++;
        } else {
          // Try to find by person_id
          const existing = await base44.asServiceRole.entities.Person.filter({ person_id: personData.person_id });
          
          if (existing.length > 0) {
            await base44.asServiceRole.entities.Person.update(existing[0].id, personData);
            updated++;
          } else {
            // Create new record
            await base44.asServiceRole.entities.Person.create(personData);
            created++;
          }
        }
      } catch (error) {
        errors.push({ row: dataRows.indexOf(row) + 2, error: error.message });
      }
    }

    return Response.json({
      success: true,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: created + updated
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});