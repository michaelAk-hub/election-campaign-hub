import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx';

// System field definitions with Greek/English synonyms for auto-matching
const SYSTEM_FIELDS = {
  person_id: {
    label: 'ΑΤ / ID',
    required: true,
    synonyms: ['ατ', 'id', 'at', 'person_id', 'id_number']
  },
  department: {
    label: 'ΤΜΗΜΑ',
    required: true,
    synonyms: ['τμημα', 'tmhma', 'department', 'tmima']
  },
  admission_year: {
    label: 'ΕΙΣΔΟΧΗ / Έτος Εισδοχής',
    required: true,
    synonyms: ['εισδοχη', 'eisdoxi', 'admission_year', 'etos', 'έτος']
  },
  first_name: {
    label: 'ΟΝΟΜΑ',
    required: true,
    synonyms: ['ονομα', 'onoma', 'first_name', 'firstname']
  },
  last_name: {
    label: 'ΕΠΙΘΕΤΟ',
    required: true,
    synonyms: ['επιθετο', 'epitheto', 'last_name', 'lastname', 'επώνυμο']
  },
  academic_level: {
    label: 'ΕΠΙΠΕΔΟ',
    required: false,
    synonyms: ['επιπεδο', 'epipedo', 'academic_level', 'level']
  },
  mobile_phone: {
    label: 'ΚΙΝΗΤΟ',
    required: false,
    synonyms: ['κινητο', 'kinito', 'mobile_phone', 'mobile', 'phone', 'τηλ']
  },
  contact_person_1: {
    label: 'ΑΤΟΜΟ_1',
    required: false,
    synonyms: ['ατομο_1', 'atomo_1', 'contact_person_1', 'atomo1']
  },
  contact_person_2: {
    label: 'ΑΤΟΜΟ_2',
    required: false,
    synonyms: ['ατομο_2', 'atomo_2', 'contact_person_2', 'atomo2']
  },
  member: {
    label: 'ΜΕΛΟΣ',
    required: false,
    synonyms: ['μελος', 'melos', 'member']
  },
  prediction_symbol: {
    label: 'ΣΥΜΒΟΛΟ ΠΡΟΒΛΕΨΗΣ',
    required: false,
    synonyms: ['συμβολο', 'symbolo', 'prediction_symbol', 'symbol']
  },
  ucid: {
    label: 'UCID',
    required: false,
    synonyms: ['ucid']
  }
};

// Normalize string for matching
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[άα]/g, 'α')
    .replace(/[έε]/g, 'ε')
    .replace(/[ήη]/g, 'η')
    .replace(/[ίι]/g, 'ι')
    .replace(/[όο]/g, 'ο')
    .replace(/[ύυ]/g, 'υ')
    .replace(/[ώω]/g, 'ω')
    .replace(/[^a-z0-9_]/g, '');
}

// Auto-suggest mapping based on synonyms
function autoSuggestMapping(headers) {
  const suggestions = {};
  
  for (const header of headers) {
    const normalized = normalize(header);
    
    for (const [fieldKey, fieldDef] of Object.entries(SYSTEM_FIELDS)) {
      for (const synonym of fieldDef.synonyms) {
        if (normalize(synonym) === normalized) {
          suggestions[fieldKey] = header;
          break;
        }
      }
    }
  }
  
  return suggestions;
}

// Sanitize field key for JSON storage
function sanitizeFieldKey(header, existingKeys = []) {
  let key = normalize(header);
  
  if (!key) {
    let counter = 1;
    do {
      key = `custom_${counter}`;
      counter++;
    } while (existingKeys.includes(key));
  } else {
    let originalKey = key;
    let counter = 1;
    while (existingKeys.includes(key)) {
      key = `${originalKey}_${counter}`;
      counter++;
    }
  }
  
  return key;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    
    if (data.length === 0) {
      return Response.json({ error: 'File is empty' }, { status: 400 });
    }

    const headers = data[0].map(h => String(h).trim());
    
    // Check for duplicate headers
    const headerCounts = {};
    for (const header of headers) {
      headerCounts[header] = (headerCounts[header] || 0) + 1;
    }
    const duplicates = Object.entries(headerCounts)
      .filter(([_, count]) => count > 1)
      .map(([header]) => header);
    
    if (duplicates.length > 0) {
      return Response.json({
        error: 'Duplicate headers found',
        duplicates
      }, { status: 400 });
    }

    // Generate preview rows (first 20)
    const previewRows = data.slice(1, 21).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] || '';
      });
      return obj;
    });

    // Auto-suggest mappings
    const suggestedMappings = autoSuggestMapping(headers);

    // Generate sanitized keys for all headers
    const usedKeys = Object.keys(SYSTEM_FIELDS);
    const headerMetadata = headers.map(header => {
      const fieldKey = sanitizeFieldKey(header, usedKeys);
      usedKeys.push(fieldKey);
      return {
        original: header,
        field_key: fieldKey,
        display_label: header || `(Blank #${usedKeys.length})`
      };
    });

    return Response.json({
      headers,
      headerMetadata,
      previewRows,
      suggestedMappings,
      systemFields: SYSTEM_FIELDS,
      totalRows: data.length - 1
    });

  } catch (error) {
    console.error('Parse error:', error);
    return Response.json({ 
      error: error.message || 'Failed to parse file'
    }, { status: 500 });
  }
});