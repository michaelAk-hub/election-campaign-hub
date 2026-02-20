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

    // Create header row with mandatory fields + custom fields (using Greek labels)
    const headerLabels = [
      ...MANDATORY_FIELDS.map(f => f.label),
      ...custom_fields.map(f => f.label || f.name)
    ];

    // Create sample row with field names for reference
    const fieldNames = [
      ...MANDATORY_FIELDS.map(f => f.name),
      ...custom_fields.map(f => f.name)
    ];

    // Create workbook with proper encoding for Greek characters
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headerLabels, fieldNames]);

    // Set column widths
    ws['!cols'] = headerLabels.map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Person Data');

    // Write as buffer for proper XLSX format
    const buffer = XLSX.write(wb, { 
      type: 'buffer', 
      bookType: 'xlsx',
      bookSST: false,
      type: 'array'
    });

    // Convert to Uint8Array and create blob
    const uint8Array = new Uint8Array(buffer);
    const blob = new Blob([uint8Array], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const file = new File([blob], 'person_template.xlsx', {
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