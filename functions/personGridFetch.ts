import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];
const IDLE_TIMEOUT_SECONDS = 15 * 60;

function buildPartitionCondition(partition) {
  if (partition === "postgrad") return { academic_level: { $in: POSTGRAD } };
  if (partition === "undergrad") return { academic_level: { $in: UNDERGRAD } };
  if (partition === "unknown") return { $or: [{ academic_level: null }, { academic_level: "" }, { academic_level: { $exists: false } }] };
  return null;
}

function normalizeFilters(filtersRaw) {
  if (!filtersRaw) return null;
  if (typeof filtersRaw === "string") {
    const t = filtersRaw.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }
  if (typeof filtersRaw === "object") return filtersRaw;
  return null;
}

function toDbField(field) {
  if (field?.startsWith("custom:")) return `custom_data.${field.slice(7)}`;
  return field;
}

async function validateSession(base44, session_token) {
  if (!session_token) {
    return { error: "Απαιτείται session token", status: 401 };
  }

  const sessions = await base44.asServiceRole.entities.AppSession.filter({
    session_token,
    is_active: true
  });

  if (sessions.length === 0) {
    return { error: "Μη έγκυρη συνεδρία", status: 401 };
  }

  const session = sessions[0];

  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία έληξε", status: 401 };
  }

  const user = await base44.asServiceRole.entities.AppUser.get(session.app_user_id);
  if (!user) {
    return { error: "Χρήστης δεν βρέθηκε", status: 401 };
  }

  if (session.session_version_at_login !== user.session_version) {
    await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
    return { error: "Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.", status: 401, force_logout: true };
  }

  if (user.role === "ORGANOTIKI" && !user.is_active) {
    return { error: "Ο λογαριασμός σας έχει απενεργοποιηθεί", status: 403 };
  }

  if (session.last_seen_at) {
    const idleSeconds = (new Date() - new Date(session.last_seen_at)) / 1000;
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
      await base44.asServiceRole.entities.AppSession.update(session.id, { is_active: false });
      return { error: "Η συνεδρία σας έληξε λόγω αδράνειας", status: 401, reason: "idle_timeout" };
    }
  }

  // Update last_seen_at
  await base44.asServiceRole.entities.AppSession.update(session.id, { last_seen_at: new Date().toISOString() });

  return { user, session };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = null;
    try { body = await req.json(); } catch {}

    const { searchParams } = new URL(req.url);
    const getAny = (k, fb) => body?.[k] ?? searchParams.get(k) ?? fb;

    const session_token = getAny("session_token", null);
    const auth = await validateSession(base44, session_token);
    if (auth.error) {
      return Response.json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}), ...(auth.reason ? { reason: auth.reason } : {}) }, { status: auth.status });
    }

    const startRow = Number(getAny("startRow", 0));
    const endRow   = Number(getAny("endRow", 100));
    const sortField = String(getAny("sortField", "created_date"));
    const sortDirection = String(getAny("sortDirection", "desc"));
    const search = String(getAny("search", "")).trim();
    const partition = String(getAny("partition", "postgrad"));
    const filters = normalizeFilters(getAny("filters", null));
    const datasetId = getAny("datasetId", null);

    const limit = Math.max(1, Math.min((endRow - startRow) || 100, 1000));
    const sort = sortDirection === "asc" ? sortField : `-${sortField}`;

    let resolvedDatasetId = datasetId;
    if (!resolvedDatasetId) {
      const active = await base44.asServiceRole.entities.Dataset.filter({ status: "active" });
      if (!active.length) return Response.json({ rows: [], lastRow: 0 });
      resolvedDatasetId = active[0].id;
    }

    const partitionCond = buildPartitionCondition(partition);
    const and = [
      { dataset_id: resolvedDatasetId },
      ...(partitionCond ? [partitionCond] : []),
    ];

    if (search) {
      and.push({
        $or: [
          { person_id:    { $regex: search, $options: "i" } },
          { first_name:   { $regex: search, $options: "i" } },
          { last_name:    { $regex: search, $options: "i" } },
          { mobile_phone: { $regex: search, $options: "i" } },
          { department:   { $regex: search, $options: "i" } },
          { ucid:         { $regex: search, $options: "i" } },
        ],
      });
    }

    if (filters && typeof filters === "object") {
      for (const [rawField, model] of Object.entries(filters)) {
        if (!model) continue;
        const field = toDbField(rawField);

        if (typeof model === "object" && model.filterType === "set") {
          const { values = [], includeBlanks = false } = model;
          if (values.length || includeBlanks) {
            const orParts = [];
            if (values.length) orParts.push({ [field]: { $in: values } });
            if (includeBlanks) {
              orParts.push(
                { [field]: null },
                { [field]: "" },
                { [field]: { $exists: false } }
              );
            }
            and.push({ $or: orParts });
          }
          continue;
        }

        if (typeof model === "object" && model.filterType === "text") {
          const type = String(model.type ?? "contains");
          const val = String(model.filter ?? "");
          if (!val) continue;
          if (type === "contains") and.push({ [field]: { $regex: val, $options: "i" } });
          else if (type === "startsWith") and.push({ [field]: { $regex: `^${val}`, $options: "i" } });
          else if (type === "equals") and.push({ [field]: val });
          continue;
        }

        if (typeof model === "boolean") {
          and.push({ [field]: model });
          continue;
        }
      }
    }

    const query = { $and: and };

    const rows = await base44.asServiceRole.entities.Person.filter(query, sort, limit, startRow);

    let lastRow = -1;
    if (rows.length < limit) lastRow = startRow + rows.length;

    console.log(`[personGridFetch] partition=${partition} startRow=${startRow} rows=${rows.length} lastRow=${lastRow} sort=${sort}`);

    return Response.json({ rows, lastRow });
  } catch (err) {
    console.error("❌ [personGridFetch] Error:", err?.message || err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
});