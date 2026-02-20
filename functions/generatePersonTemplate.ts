import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

const MANDATORY_FIELDS = [
  { name: 'person_id', label: 'ΑΤ (ID)' },
  { name: 'department', label: 'ΤΜΗΜΑ' },
  { name: 'admission_year', label: 'ΕΙΣΔΟΧΗ' },
  { name: 'academic_level', label: 'ΕΠΙΠΕΔΟ' },
  { name: 'ucid', label: 'UCID' },
  { name: 'mobile_phone', label: 'ΚΙΝΗΤΟ' },
  { name: 'first_name', label: 'ΟΝΟΜΑ' },
  { name: 'last_name', label: 'ΕΠΙΘΕΤΟ' },
  { name: 'contact_person_1', label: 'ATOMO_1' },
  { name: 'contact_person_2', label: 'ATOMO_2' },
  { name: 'member', label: 'ΜΕΛΟΣ' },
  { name: 'prediction_symbol', label: 'Σύμβολο πρόβλεψης' }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { session_token, custom_fields = [] } = await req.json();

    // Validate session
    const { data: sessionData } = await base44.functions.invoke('validateAppSession', {
      session_token
    });

    if (!sessionData.valid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create header row with mandatory fields + custom fields
    const headers = [
      ...MANDATORY_FIELDS.map(f => f.name),
      ...custom_fields.map(f => f.name)
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Person Data');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Upload to Base44 storage
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const file = new File([blob], 'person_import_template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ 
      file 
    });

    return Response.json({
      success: true,
      template_url: file_url
    });

  } catch (error) {
    console.error('Template generation error:', error);
    return Response.json({ 
      error: error.message || 'Template generation failed' 
    }, { status: 500 });
  }
});