import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { spreadsheetId, sheetName } = await req.json();

    // Get Google Sheets access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');

    // Fetch all Person records
    const people = await base44.asServiceRole.entities.Person.list('-updated_date', 10000);

    // Prepare headers and data
    const headers = [
      'ΑΤ (ID)', 'UCID', 'Επίθετο', 'Όνομα', 'Τμήμα', 'Εισδοχή', 
      'Επίπεδο', 'Κινητό', 'Άτομο 1', 'Άτομο 2', 'Μέλος', 
      'Σύμβολο Πρόβλεψης', 'Ψήφισε', 'Σημειώσεις', 'ID (Internal)'
    ];

    const rows = people.map(p => [
      p.person_id || '',
      p.ucid || '',
      p.last_name || '',
      p.first_name || '',
      p.department || '',
      p.admission_year || '',
      p.academic_level || '',
      p.mobile_phone || '',
      p.contact_person_1 || '',
      p.contact_person_2 || '',
      p.member || '',
      p.election_cycle || '',
      p.voted ? 'ΝΑΙ' : 'ΟΧΙ',
      p.notes || '',
      p.id
    ]);

    const values = [headers, ...rows];

    // Create or update sheet
    const sheetsApiUrl = spreadsheetId 
      ? `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName || 'Voters'}!A1:clear`
      : 'https://sheets.googleapis.com/v4/spreadsheets';

    if (!spreadsheetId) {
      // Create new spreadsheet
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Εκλογική Βάση - ${new Date().toISOString().split('T')[0]}`
          },
          sheets: [{
            properties: {
              title: 'Voters'
            }
          }]
        })
      });

      const spreadsheet = await createResponse.json();
      const newSpreadsheetId = spreadsheet.spreadsheetId;

      // Add data
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values/Voters!A1:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });

      return Response.json({
        success: true,
        spreadsheetId: newSpreadsheetId,
        url: spreadsheet.spreadsheetUrl,
        recordsExported: people.length
      });
    } else {
      // Clear existing data
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName || 'Voters'}!A1:Z10000:clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Add new data
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName || 'Voters'}!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });

      return Response.json({
        success: true,
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        recordsExported: people.length
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});