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

    // Update Person entity schema with custom fields
    if (custom_fields.length > 0) {
      const currentSchema = await base44.asServiceRole.entities.Person.schema();
      const updatedProperties = { ...currentSchema.properties };

      // Add custom fields to schema
      for (const field of custom_fields) {
        if (!updatedProperties[field.name]) {
          let fieldSchema = { description: `Custom field: ${field.name}` };
          
          switch (field.type) {
            case 'number':
              fieldSchema.type = 'number';
              break;
            case 'boolean':
              fieldSchema.type = 'boolean';
              fieldSchema.default = false;
              break;
            case 'date':
              fieldSchema.type = 'string';
              fieldSchema.format = 'date';
              break;
            default:
              fieldSchema.type = 'string';
          }

          updatedProperties[field.name] = fieldSchema;
        }
      }

      // Update schema via entity file write
      const updatedSchema = {
        name: 'Person',
        type: 'object',
        properties: updatedProperties,
        required: currentSchema.required || ['person_id']
      };

      // Write updated schema (using Base44 SDK to update entity definition)
      await base44.asServiceRole.functions.invoke('updatePersonEntitySchema', {
        schema: updatedSchema
      });
    }

    // Create new dataset
    const dataset = await base44.asServiceRole.entities.Dataset.create({
      name: dataset_name,
      status: 'pending',
      source_file_url: file_url,
      total_records: rows.length - 1
    });

    // Prepare person records
    const dataRows = rows.slice(1);
    const personRecords = [];

    for (const row of dataRows) {
      const record = { dataset_id: dataset.id };
      
      headers.forEach((header, index) => {
        const value = row[index];
        
        // Handle empty values
        if (value === '' || value === null || value === undefined) {
          return;
        }

        // Find custom field type
        const customField = custom_fields.find(f => f.name === header);
        
        if (customField) {
          // Convert based on type
          if (customField.type === 'number') {
            record[header] = Number(value) || 0;
          } else if (customField.type === 'boolean') {
            record[header] = ['true', '1', 'yes', 'ναι', 'TRUE', 'YES'].includes(String(value).toLowerCase());
          } else {
            record[header] = String(value);
          }
        } else {
          // Standard field
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
    console.error('Import error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Import failed' 
    }, { status: 500 });
  }
});