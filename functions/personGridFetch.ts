import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];

function buildPartitionCondition(partition) {
  if (partition === "postgrad") return { academic_level: { $in: POSTGRAD } };
  if (partition === "undergrad") return { academic_level: { $in: UNDERGRAD } };
  return { $or: [{ academic_level: null }, { academic_level: "" }, { academic_level: { $exists: false } }] };
}

function normalizeText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return String(v);
  const t = v.trim().replace(/\s+/g, " ");
  return t === "" ? null : t;
}

function parseMaybeJson(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    const t = input.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }
  return null;
}

function toDbField(field) {
  if (field?.startsWith("custom:")) return `custom_data.${field.slice(7)}`;
  return field;
}

// In-memory cache for partition counts (10 min TTL)
const COUNTS_TTL_MS = 10 * 60 * 1000;
const countsCache = new Map();

async function computeCountsForDataset(base44, datasetId) {
  const cached = countsCache.get(datasetId);
  if (cached && Date.now() - cached.ts < COUNTS_TTL_MS) return cached.counts;

  const counts = { postgrad: 0, undergrad: 0, unknown: 0 };
  const batchSize = 1000;
  let skip = 0;

  while (true) {
    const batch = await base44.asServiceRole.entities.Person.filter(
      { dataset_id: datasetId }, null, batchSize, skip
    );
    if (!batch.length) break;

    for (const p of batch) {
      const lvl = normalizeText(p.academic_level);
      if (!lvl) {
        counts.unknown += 1;
      } else if (POSTGRAD.includes(lvl)) {
        counts.postgrad += 1;
      } else if (UNDERGRAD.includes(lvl)) {
        counts.undergrad += 1;
      } else {
        counts.unknown += 1;
      }
    }

    if (batch.length < batchSize) break;
    skip += batchSize;
  }

  countsCache.set(datasetId, { ts: Date.now(), counts });
  return counts;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body = null;
    try { body = await req.json(); } catch {}

    const { searchParams } = new URL(req.url);
    const getAny = (k, fb) => body?.[k] ?? searchParams.get(k) ?? fb;

    const startRow = Number(getAny("startRow", 0));
    const endRow   = Number(getAny("endRow", 100));
    const limit = Math.max(1, Math.min((endRow - startRow) || 100, 200));

    const sortField = String(getAny("sortField", "created_date"));
    const sortDirection = String(getAny("sortDirection", "desc"));
    const sort = sortDirection === "asc" ? sortField : `-${sortField}`;

    const search = String(getAny("search", "")).trim();
    const partition = String(getAny("partition", "postgrad"));
    const filters = parseMaybeJson(getAny("filters", null));

    // Active dataset
    const active = await base44.asServiceRole.entities.Dataset.filter({ status: "active" });
    if (!active.length) return Response.json({ rows: [], lastRow: 0, partition_total: 0 });
    const dataset = active[0];

    // Cached partition counts → fast partition_total
    const counts = await computeCountsForDataset(base44, dataset.id);
    const partition_total = counts[partition] ?? 0;

    const and = [
      { dataset_id: dataset.id },
      buildPartitionCondition(partition),
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
          { academic_level: { $regex: search, $options: "i" } },
        ],
      });
    }

    // Column filters (raw AG Grid filterModel)
    if (filters && typeof filters === "object") {
      for (const [rawField, model] of Object.entries(filters)) {
        if (!model) continue;
        const field = toDbField(rawField);

        if (typeof model === "object" && model.filterType === "set") {
          const values = model.values || [];
          const includeBlanks = !!model.includeBlanks;
          if (values.length || includeBlanks) {
            const orParts = [];
            if (values.length) orParts.push({ [field]: { $in: values } });
            if (includeBlanks) {
              orParts.push({ [field]: null }, { [field]: "" }, { [field]: { $exists: false } });
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
        }
      }
    }

    const query = { $and: and };
    const rows = await base44.asServiceRole.entities.Person.filter(query, sort, limit, startRow);

    const hasFilters = !!search || (filters && Object.keys(filters).length > 0);
    let lastRow = -1;
    if (!hasFilters) {
      lastRow = partition_total;
    } else if (rows.length < limit) {
      lastRow = startRow + rows.length;
    }

    console.log(`[personGridFetch] partition=${partition} startRow=${startRow} rows=${rows.length} lastRow=${lastRow} partition_total=${partition_total}`);

    return Response.json({ rows, lastRow, partition_total });
  } catch (err) {
    console.error("❌ [personGridFetch] Error:", err?.message || err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
});