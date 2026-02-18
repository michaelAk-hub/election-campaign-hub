import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx';

// System field definitions
const REQUIRED_FIELDS = ['person_id', 'department', 'admission_year', 'first_name', 'last_name'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { file_url, mapping, dataset_name, mode = 'create' } = body;
    
    if (!file_url || !mapping || !dataset_name) {
      return Response.json({ 
        error: 'Missing required fields: file_url, mapping, dataset_name' 
      }, { status: 400 });
    }

    // Validate all required fields are mapped
    const missingFields = REQUIRED_FIELDS.filter(field => !mapping[field]);
    if (missingFields.length > 0) {
      return Response.json({
        error: 'Missing required field mappings',
        missingFields
      }, { status: 400 });
    }

    // Check for duplicate mappings
    const mappedHeaders = Object.values(mapping);
    const duplicateMappings = mappedHeaders.filter((h, i) => mappedHeaders.indexOf(h) !== i);
    if (duplicateMappings.length > 0) {
      return Response.json({
        error: 'Duplicate field mappings detected',
        duplicates: duplicateMappings
      }, { status: 400 });
    }

    // Fetch and parse file
    const fileResponse = await fetch(file_url);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    
    if (data.length < 2) {
      return Response.json({ error: 'File must have at least header + 1 data row' }, { status: 400 });
    }

    const headers = data[0].map(h => String(h).trim());
    const dataRows = data.slice(1);

    // Identify custom fields (unmapped headers)
    const mappedHeadersSet = new Set(Object.values(mapping));
    const customHeaders = headers.filter(h => !mappedHeadersSet.has(h));

    // Build custom_fields schema
    const customFields = customHeaders.map(header => {
      const fieldKey = header
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      return {
        field_key: fieldKey || `custom_${Math.random().toString(36).substr(2, 9)}`,
        display_label: header || '(Blank)',
        type: 'string'
      };
    });

    // Create or replace dataset
    let dataset;
    if (mode === 'replace') {
      const existingDatasets = await base44.asServiceRole.entities.Dataset.filter({ status: 'active' });
      if (existingDatasets.length > 0) {
        // Delete old persons from active dataset
        const oldPersons = await base44.asServiceRole.entities.Person.filter({ 
          dataset_id: existingDatasets[0].id 
        });
        
        for (const person of oldPersons) {
          await base44.asServiceRole.entities.Person.delete(person.id);
        }
        
        // Update dataset
        dataset = await base44.asServiceRole.entities.Dataset.update(existingDatasets[0].id, {
          name: dataset_name,
          source_file_url: file_url,
          field_mappings: mapping,
          custom_fields: customFields,
          total_records: 0,
          status: 'active',
          activated_at: new Date().toISOString()
        });
      } else {
        // No active dataset, create new
        dataset = await base44.asServiceRole.entities.Dataset.create({
          name: dataset_name,
          source_file_url: file_url,
          field_mappings: mapping,
          custom_fields: customFields,
          total_records: 0,
          status: 'active',
          activated_at: new Date().toISOString()
        });
      }
    } else {
      dataset = await base44.asServiceRole.entities.Dataset.create({
        name: dataset_name,
        source_file_url: file_url,
        field_mappings: mapping,
        custom_fields: customFields,
        total_records: 0,
        status: 'pending'
      });
    }

    // Import persons
    const warnings = [];
    let importedCount = 0;
    const personIds = new Set();

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const rowData = {};
      
      headers.forEach((header, idx) => {
        rowData[header] = row[idx] || '';
      });

      // Map system fields
      const personData = {
        dataset_id: dataset.id
      };

      for (const [systemField, sourceHeader] of Object.entries(mapping)) {
        personData[systemField] = String(rowData[sourceHeader] || '').trim();
      }

      // Check for duplicate person_id
      if (personIds.has(personData.person_id)) {
        warnings.push({
          row: rowIdx + 2,
          message: `Duplicate ID: ${personData.person_id}`
        });
        continue;
      }

      if (!personData.person_id) {
        warnings.push({
          row: rowIdx + 2,
          message: 'Missing required field: person_id'
        });
        continue;
      }

      personIds.add(personData.person_id);

      // Map custom fields
      const customData = {};
      customFields.forEach((fieldDef, idx) => {
        const sourceHeader = customHeaders[idx];
        customData[fieldDef.field_key] = String(rowData[sourceHeader] || '').trim();
      });

      personData.custom_data = customData;
      personData.voted = false;

      try {
        await base44.asServiceRole.entities.Person.create(personData);
        importedCount++;
      } catch (error) {
        warnings.push({
          row: rowIdx + 2,
          message: `Import error: ${error.message}`
        });
      }
    }

    // Update dataset record count
    await base44.asServiceRole.entities.Dataset.update(dataset.id, {
      total_records: importedCount
    });

    return Response.json({
      success: true,
      dataset_id: dataset.id,
      imported_count: importedCount,
      warnings,
      custom_fields_count: customFields.length
    });

  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ 
      error: error.message || 'Failed to import dataset'
    }, { status: 500 });
  }
});