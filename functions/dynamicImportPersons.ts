import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

const MANDATORY_FIELDS = [
  'person_id', 'department', 'admission_year', 'academic_level', 
  'ucid', 'mobile_phone', 'first_name', 'last_name', 
  'contact_person_1', 'contact_person_2', 'member', 'prediction_symbol'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { session_token, file_url, dataset_name, custom_fields = [] } = await req.json();

    // Validate session
    const { data: sessionData } = await base44.functions.invoke('validateAppSession', {
      session_token
    });

    if (!sessionData.valid || !['ADMIN', 'ORGANOTIKI'].includes(sessionData.user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the Excel file
    const fileResponse = await fetch(file_url);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

    if (rows.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Το αρχείο είναι κενό' 
      });
    }

    // Get headers from first row
    const headers = rows[0].map(h => String(h).trim());
    
    // Validate mandatory fields
    const missingFields = MANDATORY_FIELDS.filter(f => !headers.includes(f));
    if (missingFields.length > 0) {
      return Response.json({
        success: false,
        error: `Λείπουν υποχρεωτικές στήλες: ${missingFields.join(', ')}`
      });
    }

    // Store custom field definitions in the dataset for later retrieval
    // (Entity schemas cannot be modified dynamically)

    // Create new dataset with custom field definitions
    const dataset = await base44.asServiceRole.entities.Dataset.create({
      name: dataset_name,
      status: 'pending',
      source_file_url: file_url,
      total_records: rows.length - 1,
      custom_fields: custom_fields // Store custom field metadata
    });

    // Prepare person records
    const dataRows = rows.slice(1);
    const personRecords = [];

    for (const row of dataRows) {
      const record = { 
        dataset_id: dataset.id,
        custom_data: {} // Initialize custom_data object
      };
      
      headers.forEach((header, index) => {
        const value = row[index];
        
        // Handle empty values
        if (value === '' || value === null || value === undefined) {
          return;
        }

        // Find if this is a custom field
        const customField = custom_fields.find(f => f.name === header);
        
        if (customField) {
          // Store custom fields in custom_data object
          if (customField.type === 'number') {
            record.custom_data[header] = Number(value) || 0;
          } else if (customField.type === 'boolean') {
            record.custom_data[header] = ['true', '1', 'yes', 'ναι', 'TRUE', 'YES'].includes(String(value).toLowerCase());
          } else {
            record.custom_data[header] = String(value);
          }
        } else {
          // Standard field - store at top level
          if (header === 'voted') {
            record[header] = ['true', '1', 'yes', 'ναι', 'TRUE', 'YES'].includes(String(value).toLowerCase());
          } else {
            record[header] = String(value);
          }
        }
      });

      personRecords.push(record);
    }

    // Bulk insert with pagination for large datasets
    const BATCH_SIZE = 1000;
    let totalImported = 0;

    for (let i = 0; i < personRecords.length; i += BATCH_SIZE) {
      const batch = personRecords.slice(i, i + BATCH_SIZE);
      await base44.asServiceRole.entities.Person.bulkCreate(batch);
      totalImported += batch.length;
    }

    // Update dataset status to active and deactivate others
    // First, deactivate all other datasets
    const allDatasets = await base44.asServiceRole.entities.Dataset.list();
    for (const ds of allDatasets) {
      if (ds.id !== dataset.id && ds.status === 'active') {
        await base44.asServiceRole.entities.Dataset.update(ds.id, {
          status: 'archived'
        });
      }
    }

    // Activate the new dataset
    await base44.asServiceRole.entities.Dataset.update(dataset.id, {
      status: 'active',
      activated_at: new Date().toISOString(),
      total_records: totalImported
    });

    return Response.json({
      success: true,
      dataset_id: dataset.id,
      total_imported: totalImported
    });

  } catch (error) {
    console.error('Import error:', error.message, error.stack);
    return Response.json({ 
      success: false,
      error: error.message || 'Import failed',
      details: error.stack
    }, { status: 500 });
  }
});