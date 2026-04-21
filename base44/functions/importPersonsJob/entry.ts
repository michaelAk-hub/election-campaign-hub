import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Greek/alias → canonical field name
const GREEK_TO_FIELD = {
  'ατ': 'person_id',
  'α.τ.': 'person_id',
  'ατ (id)': 'person_id',
  'at': 'person_id',
  'person_id': 'person_id',
  'ονομα': 'first_name',
  'όνομα': 'first_name',
  'first_name': 'first_name',
  'επιθετο': 'last_name',
  'επίθετο': 'last_name',
  'last_name': 'last_name',
  'κινητο': 'mobile_phone',
  'κινητό': 'mobile_phone',
  'mobile_phone': 'mobile_phone',
  'eisdoxi': 'admission_year',
  'εισδοχη': 'admission_year',
  'εισδοχή': 'admission_year',
  'admission_year': 'admission_year',
  'επιπεδο': 'academic_level',
  'επίπεδο': 'academic_level',
  'academic_level': 'academic_level',
  'τμημα': 'department',
  'τμήμα': 'department',
  'department': 'department',
  'atomo_1': 'contact_person_1',
  'ατομο_1': 'contact_person_1',
  'άτομο 1': 'contact_person_1',
  'ατομο 1': 'contact_person_1',
  'contact_person_1': 'contact_person_1',
  'atomo_2': 'contact_person_2',
  'ατομο_2': 'contact_person_2',
  'άτομο 2': 'contact_person_2',
  'ατομο 2': 'contact_person_2',
  'contact_person_2': 'contact_person_2',
  'μελος': 'member',
  'μέλος': 'member',
  'member': 'member',
  'psifise': 'voted',
  'ψηφισε': 'voted',
  'ψήφισε': 'voted',
  'voted': 'voted',
  'συμβολο προβλεψης': 'prediction_symbol',
  'σύμβολο πρόβλεψης': 'prediction_symbol',
  'prediction_symbol': 'prediction_symbol',
  'σημειωσεις': 'notes',
  'σημειώσεις': 'notes',
  'notes': 'notes',
  'παρατηρησεις': 'details',
  'παρατηρήσεις': 'details',
  'details': 'details',
  'ονομα πατερα': 'father_name',
  'όνομα πατέρα': 'father_name',
  'father_name': 'father_name',
  'ον_πατρος': 'father_n',
  'ον_πατρός': 'father_n',
  'father_n': 'father_n',
  'κατ': 'direction',
  'direction': 'direction',
  'electoraldistrict': 'ElectoralDistrict',
  'ElectoralDistrict': 'ElectoralDistrict',
  'electoraltown': 'ElectoralTown',
  'ElectoralTown': 'ElectoralTown',
  'relatedmember': 'RelatedMember',
  'RelatedMember': 'RelatedMember',
  'μοναδικο καναλι': 'monadikos_kanali',
  'μοναδικό κανάλι': 'monadikos_kanali',
  'monadikos_kanali': 'monadikos_kanali',
  'ucid': 'ucid',
  'x': 'X',
  'X': 'X',
  'f26_1': 'F26_1',
  'F26_1': 'F26_1',
  'f25': 'F25',
  'F25': 'F25',
  'phone': 'phone',
  't24': 'T24',
  'T24': 'T24',
  'f24': 'F24',
  'F24': 'F24',
  'f23': 'F23',
  'F23': 'F23',
  't22': 'T22',
  'T22': 'T22',
};

const KNOWN_FIELDS = new Set([
  'dataset_id', 'department', 'admission_year', 'academic_level', 'person_id',
  'ucid', 'mobile_phone', 'first_name', 'last_name', 'contact_person_1',
  'contact_person_2', 'member', 'prediction_symbol', 'voted', 'voted_at',
  'notes', 'monadikos_kanali', 'direction', 'X', 'F26_1', 'F25', 'phone',
  'T24', 'F24', 'F23', 'T22', 'details', 'father_n', 'father_name',
  'ElectoralDistrict', 'ElectoralTown', 'RelatedMember', 'custom_data', 'row_version',
]);

function normalizeKey(k) {
  return String(k).trim().toLowerCase();
}

function mapRow(rawRow, headerMap) {
  const out = {};
  const custom = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const canonical = headerMap[normalizeKey(rawKey)] || headerMap[rawKey] || null;
    if (!canonical) {
      // Store unmapped fields as custom_data
      custom[rawKey] = value === null || value === undefined ? '' : String(value);
      continue;
    }
    if (canonical === 'voted') {
      const s = String(value ?? '').trim().toLowerCase();
      out[canonical] = ['ναι', 'nai', 'yes', 'true', '1', 'y'].includes(s);
    } else {
      const str = value === null || value === undefined ? '' : String(value).trim();
      out[canonical] = str;
    }
  }
  if (Object.keys(custom).length > 0) out.custom_data = custom;
  return out;
}

function buildHeaderMap(headers) {
  const map = {};
  for (const h of headers) {
    const normalized = normalizeKey(h);
    if (GREEK_TO_FIELD[normalized]) {
      map[normalized] = GREEK_TO_FIELD[normalized];
    } else if (GREEK_TO_FIELD[h]) {
      map[h] = GREEK_TO_FIELD[h];
    } else if (KNOWN_FIELDS.has(h)) {
      map[normalizeKey(h)] = h;
      map[h] = h;
    }
  }
  return map;
}

// Minimal CSV parser (no external deps)
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function isXlsx(bytes) {
  // ZIP magic bytes: PK (0x50 0x4B)
  return bytes[0] === 0x50 && bytes[1] === 0x4B;
}

async function parseFile(fileUrl) {
  const res = await fetch(fileUrl);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);

  if (isXlsx(bytes)) {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // Assume CSV
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  return parseCSV(text);
}

async function validateAdminSession(base44, session_token) {
  if (!session_token) return null;
  const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token, is_active: true });
  if (!sessions.length) return null;
  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) return null;
  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user || user.role !== 'ADMIN') return null;
  return user;
}

async function retryBulkCreate(base44, rows, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await base44.asServiceRole.entities.Person.bulkCreate(rows);
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(300 * (i + 1));
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { session_token, job_id, resume_key, file_url, dataset_name, person_id_col } = body;

    // ── PHASE B / C: resume ────────────────────────────────────────────────
    if (job_id && resume_key === 'internal_resume') {
      const jobs = await base44.asServiceRole.entities.ImportJob.filter({ id: job_id });
      if (!jobs.length) return Response.json({ error: 'Job not found' }, { status: 404 });
      const job = jobs[0];

      if (job.status === 'done' || job.status === 'error') {
        return Response.json({ success: true, status: job.status });
      }

      // Parse file again to get rows
      let rawRows;
      try {
        rawRows = await parseFile(job.file_url);
      } catch (e) {
        await base44.asServiceRole.entities.ImportJob.update(job.id, {
          status: 'error', error: `File parse error: ${e.message}`
        });
        return Response.json({ error: e.message }, { status: 500 });
      }

      const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
      const headerMap = buildHeaderMap(headers);

      // Map and filter rows
      const mapped = rawRows.map(r => mapRow(r, headerMap));

      // Auto-assign person_id if needed
      const settings = job.settings_json ? JSON.parse(job.settings_json) : {};
      const pidCol = settings.person_id_col || null;
      const withIds = mapped.map((r, i) => {
        if (!r.person_id || r.person_id === '') {
          if (pidCol && rawRows[i]?.[pidCol]) {
            r.person_id = String(rawRows[i][pidCol]).trim();
          } else {
            r.person_id = String(i + 1);
          }
        }
        return r;
      });

      const valid = withIds.filter(r => r.person_id && String(r.person_id).trim() !== '');
      const BATCH_SIZE = 50;
      const ROWS_PER_INVOCATION = 400;
      const startIdx = job.processed || 0;
      const endIdx = Math.min(startIdx + ROWS_PER_INVOCATION, valid.length);
      const failedRows = JSON.parse(job.failed_rows_json || '[]');

      for (let i = startIdx; i < endIdx; i += BATCH_SIZE) {
        const chunk = valid.slice(i, i + BATCH_SIZE).map(r => ({ ...r, dataset_id: job.dataset_id }));
        try {
          await retryBulkCreate(base44, chunk);
        } catch (e) {
          // Track failed rows
          chunk.forEach(r => failedRows.push(r.person_id || String(i)));
        }
        await sleep(80);
        await base44.asServiceRole.entities.ImportJob.update(job.id, {
          processed: i + chunk.length,
          message: `Αποθήκευση εγγραφών ${i + chunk.length}/${valid.length}...`,
          failed_rows: failedRows,
          last_heartbeat_at: new Date().toISOString(),
        });
      }

      if (endIdx < valid.length) {
        // More rows — self-invoke
        const appId = Deno.env.get('BASE44_APP_ID');
        fetch(`https://api.base44.com/api/apps/${appId}/functions/importPersonsJob`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, resume_key: 'internal_resume' }),
        }).catch(() => {});
        return Response.json({ success: true, job_id: job.id, processed: endIdx, total: valid.length });
      }

      // ── PHASE C: activate + done ─────────────────────────────────────────
      try {
        await base44.asServiceRole.functions.invoke('activateDataset', {
          dataset_id: job.dataset_id,
          session_token: null,
          internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET'),
        });
      } catch (_) {}

      await base44.asServiceRole.entities.ImportJob.update(job.id, {
        status: 'done',
        processed: valid.length,
        message: `Ολοκληρώθηκε! Εισήχθησαν ${valid.length - failedRows.length} εγγραφές.`,
        failed_rows: failedRows,
        last_heartbeat_at: new Date().toISOString(),
      });

      base44.asServiceRole.functions.invoke('triggerPredictionRebuild', {
        internal_key: Deno.env.get('INTERNAL_REBUILD_SECRET'),
        dataset_id: job.dataset_id,
      }).catch(() => {});

      return Response.json({ success: true, job_id: job.id, done: true });
    }

    // ── PHASE A: new job ───────────────────────────────────────────────────
    const user = await validateAdminSession(base44, session_token);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    // Parse to count rows
    let rawRows;
    try {
      rawRows = await parseFile(file_url);
    } catch (e) {
      return Response.json({ error: `File parse error: ${e.message}` }, { status: 400 });
    }

    const total = rawRows.length;
    const name = dataset_name || `Import ${new Date().toISOString().split('T')[0]}`;

    const dataset = await base44.asServiceRole.entities.Dataset.create({
      name,
      status: 'pending',
      source_file_url: file_url,
      total_records: total,
    });

    const job = await base44.asServiceRole.entities.ImportJob.create({
      status: 'running',
      total,
      processed: 0,
      message: `Έναρξη εισαγωγής ${total} εγγραφών...`,
      dataset_id: dataset.id,
      dataset_name: name,
      file_url,
      last_heartbeat_at: new Date().toISOString(),
      settings_json: JSON.stringify({ person_id_col: person_id_col || null }),
      failed_rows: [],
    });

    // Self-invoke Phase B
    const appId = Deno.env.get('BASE44_APP_ID');
    fetch(`https://api.base44.com/api/apps/${appId}/functions/importPersonsJob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.id, resume_key: 'internal_resume' }),
    }).catch(() => {});

    return Response.json({ success: true, job_id: job.id, dataset_id: dataset.id, total });

  } catch (err) {
    console.error('❌ [importPersonsJob]', err?.message || err);
    return Response.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
});