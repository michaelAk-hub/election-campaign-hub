import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const EXPORT_COLUMNS = [
  { key: 'person_id', label: 'ΑΤ (ID)' },
  { key: 'ucid', label: 'UCID' },
  { key: 'last_name', label: 'Επίθετο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'department', label: 'Τμήμα' },
  { key: 'admission_year', label: 'Εισδοχή' },
  { key: 'academic_level', label: 'Επίπεδο' },
  { key: 'mobile_phone', label: 'Κινητό' },
  { key: 'contact_person_1', label: 'Άτομο 1' },
  { key: 'contact_person_2', label: 'Άτομο 2' },
  { key: 'member', label: 'Μέλος' },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης' },
  { key: 'voted', label: 'Ψήφισε' },
  { key: 'monadikos_kanali', label: 'Μοναδικό Κανάλι' },
  { key: 'notes', label: 'Σημειώσεις' },
  { key: 'direction', label: 'ΚΑΤ' },
  { key: 'X', label: 'X' },
  { key: 'F26_1', label: 'Φ26_1' },
  { key: 'F25', label: 'Φ25' },
  { key: 'phone', label: 'phone' },
  { key: 'T24', label: 'T24' },
  { key: 'F24', label: 'Φ24' },
  { key: 'F23', label: 'Φ23' },
  { key: 'T22', label: 'T22' },
  { key: 'details', label: 'ΠΑΡΑΤΗΡΗΣΕΙΣ' },
  { key: 'father_n', label: 'ΟΝ_ΠΑΤΡΟΣ' },
  { key: 'father_name', label: 'ΟΝΟΜΑ ΠΑΤΕΡΑ' },
  { key: 'ElectoralDistrict', label: 'ElectoralDistrict' },
  { key: 'ElectoralTown', label: 'ElectoralTown' },
  { key: 'RelatedMember', label: 'RelatedMember' },
];

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];
const CHUNK_SIZE = 2000;

function buildPartitionCondition(partition) {
  if (partition === "postgrad") return { academic_level: { $in: POSTGRAD } };
  if (partition === "undergrad") return { academic_level: { $in: UNDERGRAD } };
  if (partition === "unknown") return { $or: [{ academic_level: null }, { academic_level: "" }, { academic_level: { $exists: false } }] };
  return null;
}

function buildQuery(datasetId, partition, filters, search) {
  const and = [{ dataset_id: datasetId }];

  const partCond = buildPartitionCondition(partition);
  if (partCond) and.push(partCond);

  if (search && search.length >= 2) {
    and.push({
      $or: [
        { person_id:         { $regex: search, $options: "i" } },
        { first_name:        { $regex: search, $options: "i" } },
        { last_name:         { $regex: search, $options: "i" } },
        { mobile_phone:      { $regex: search, $options: "i" } },
        { department:        { $regex: search, $options: "i" } },
        { ucid:              { $regex: search, $options: "i" } },
        { direction:         { $regex: search, $options: "i" } },
        { X:                 { $regex: search, $options: "i" } },
        { F26_1:             { $regex: search, $options: "i" } },
        { F25:               { $regex: search, $options: "i" } },
        { phone:             { $regex: search, $options: "i" } },
        { T24:               { $regex: search, $options: "i" } },
        { F24:               { $regex: search, $options: "i" } },
        { F23:               { $regex: search, $options: "i" } },
        { T22:               { $regex: search, $options: "i" } },
        { details:           { $regex: search, $options: "i" } },
        { father_n:          { $regex: search, $options: "i" } },
        { father_name:       { $regex: search, $options: "i" } },
        { ElectoralDistrict: { $regex: search, $options: "i" } },
        { ElectoralTown:     { $regex: search, $options: "i" } },
        { RelatedMember:     { $regex: search, $options: "i" } },
      ],
    });
  }

  if (filters && typeof filters === 'object') {
    for (const [rawField, model] of Object.entries(filters)) {
      if (!model) continue;
      const field = rawField.startsWith('custom:') ? `custom_data.${rawField.slice(7)}` : rawField;

      if (model.filterType === 'set') {
        const { values = [], includeBlanks = false } = model;
        if (values.length || includeBlanks) {
          const orParts = [];
          if (values.length) orParts.push({ [field]: { $in: values } });
          if (includeBlanks) orParts.push({ [field]: null }, { [field]: "" }, { [field]: { $exists: false } });
          and.push({ $or: orParts });
        }
      } else if (model.filterType === 'text') {
        const val = String(model.filter ?? '');
        if (!val) continue;
        const type = String(model.type ?? 'contains');
        if (type === 'contains') and.push({ [field]: { $regex: val, $options: 'i' } });
        else if (type === 'startsWith') and.push({ [field]: { $regex: `^${val}`, $options: 'i' } });
        else if (type === 'equals') and.push({ [field]: val });
      } else if (typeof model === 'boolean') {
        and.push({ [field]: model });
      }
    }
  }

  return { $and: and };
}

function rowToExportRow(p) {
  const out = {};
  for (const col of EXPORT_COLUMNS) {
    let val = p[col.key];
    if (col.key === 'voted') val = val ? 'ΝΑΙ' : 'ΟΧΙ';
    out[col.label] = val === null || val === undefined ? '' : String(val);
  }
  return out;
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { session_token, job_id, resume_key } = body;

    // ── PHASE B / C: resume ────────────────────────────────────────────────
    if (job_id && resume_key === 'internal_resume') {
      const jobs = await base44.asServiceRole.entities.ExportJob.filter({ id: job_id });
      if (!jobs.length) return Response.json({ error: 'Job not found' }, { status: 404 });
      const job = jobs[0];

      if (job.status === 'done' || job.status === 'error') {
        return Response.json({ success: true, status: job.status });
      }

      const settings = job.settings_json ? JSON.parse(job.settings_json) : {};
      const { datasetId, partition, filters, sortField, sortDirection, search } = settings;

      const sort = sortDirection === 'asc' ? (sortField || 'created_date') : `-${sortField || 'created_date'}`;
      const query = buildQuery(datasetId, partition, filters, search);

      const chunkUrls = JSON.parse(job.chunk_urls_json || '[]');
      let processed = job.processed || 0;

      // Fetch one CHUNK_SIZE batch and upload as JSON
      const batch = await base44.asServiceRole.entities.Person.filter(query, sort, CHUNK_SIZE, processed);

      if (batch.length > 0) {
        const exported = batch.map(rowToExportRow);
        const jsonBlob = new Blob([JSON.stringify(exported)], { type: 'application/json' });

        // Upload chunk
        const { file_url: chunkUrl } = await base44.asServiceRole.integrations.Core.UploadFile({ file: jsonBlob });
        chunkUrls.push(chunkUrl);
        processed += batch.length;

        await base44.asServiceRole.entities.ExportJob.update(job.id, {
          processed,
          message: `Εξαγωγή εγγραφών ${processed}/${job.total}...`,
          chunk_urls: chunkUrls,
          chunk_urls_json: JSON.stringify(chunkUrls),
          last_heartbeat_at: new Date().toISOString(),
        });
      }

      const hasMore = batch.length === CHUNK_SIZE;

      if (hasMore) {
        // More to fetch — self-invoke
        const appId = Deno.env.get('BASE44_APP_ID');
        fetch(`https://api.base44.com/api/apps/${appId}/functions/exportPersonsJob`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, resume_key: 'internal_resume' }),
        }).catch(() => {});
        return Response.json({ success: true, job_id: job.id, processed });
      }

      // ── PHASE C: merge chunks → XLSX ──────────────────────────────────────
      await base44.asServiceRole.entities.ExportJob.update(job.id, {
        message: 'Συγχώνευση δεδομένων και δημιουργία XLSX...',
        last_heartbeat_at: new Date().toISOString(),
      });

      let allRows = [];
      for (const url of chunkUrls) {
        const res = await fetch(url);
        const data = await res.json();
        allRows = allRows.concat(data);
        await sleep(50);
      }

      const ws = XLSX.utils.json_to_sheet(allRows, { header: EXPORT_COLUMNS.map(c => c.label) });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Εγγραφές');
      const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const xlsxBlob = new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const { file_url: finalUrl } = await base44.asServiceRole.integrations.Core.UploadFile({ file: xlsxBlob });

      await base44.asServiceRole.entities.ExportJob.update(job.id, {
        status: 'done',
        processed: allRows.length,
        file_url: finalUrl,
        message: `Ολοκληρώθηκε! ${allRows.length} εγγραφές εξήχθησαν.`,
        last_heartbeat_at: new Date().toISOString(),
      });

      return Response.json({ success: true, job_id: job.id, done: true, file_url: finalUrl });
    }

    // ── PHASE A: new job ───────────────────────────────────────────────────
    const user = await validateAdminSession(base44, session_token);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { datasetId, datasetName, partition = 'all', filters, sortField = 'created_date', sortDirection = 'desc', search } = body;

    if (!datasetId) return Response.json({ error: 'datasetId is required' }, { status: 400 });

    // Count total matching rows
    const query = buildQuery(datasetId, partition, filters, search);
    const sort = sortDirection === 'asc' ? sortField : `-${sortField}`;
    const countBatch = await base44.asServiceRole.entities.Person.filter(query, sort, 1, 0);
    // We can't do a true COUNT so we'll estimate from dataset
    const dataset = await base44.asServiceRole.entities.Dataset.get(datasetId);
    const total = dataset?.total_records || 0;

    const job = await base44.asServiceRole.entities.ExportJob.create({
      status: 'running',
      total,
      processed: 0,
      message: 'Έναρξη εξαγωγής...',
      dataset_id: datasetId,
      dataset_name: datasetName || dataset?.name || 'Export',
      partition,
      filters,
      sort_field: sortField,
      sort_direction: sortDirection,
      search,
      chunk_urls: [],
      chunk_urls_json: '[]',
      settings_json: JSON.stringify({ datasetId, partition, filters, sortField, sortDirection, search }),
      last_heartbeat_at: new Date().toISOString(),
    });

    // Self-invoke Phase B
    const appId = Deno.env.get('BASE44_APP_ID');
    fetch(`https://api.base44.com/api/apps/${appId}/functions/exportPersonsJob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.id, resume_key: 'internal_resume' }),
    }).catch(() => {});

    return Response.json({ success: true, job_id: job.id, total });

  } catch (err) {
    console.error('❌ [exportPersonsJob]', err?.message || err);
    return Response.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
});