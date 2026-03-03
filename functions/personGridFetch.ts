import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];

function buildPartitionCondition(partition) {
  if (partition === "postgrad") return { academic_level: { $in: POSTGRAD } };
  if (partition === "undergrad") return { academic_level: { $in: UNDERGRAD } };
  return { $or: [{ academic_level: null }, { academic_level: "" }, { academic_level: { $exists: false } }] };
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

// Cache partition totals per dataset (5 min TTL)
const TTL_MS = 5 * 60 * 1000;
const totalsCache = new Map();

async function countPartition(base44, datasetId, partition) {
  const q = { $and: [{ dataset_id: datasetId }, buildPartitionCondition(partition)] };
  const batchSize = 1000;
  let skip = 0;
  let total = 0;

  while (true) {
    const batch = await base44.asServiceRole.entities.Person.filter(q, null, batchSize, skip);
    total += batch.length;
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return total;
}

async function getTotals(base44, datasetId) {
  const cached = totalsCache.get(datasetId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.totals;

  const totals = {
    postgrad: await countPartition(base44, datasetId, "postgrad"),
    undergrad: await countPartition(base44, datasetId, "undergrad"),
    unknown: await countPartition(base44, datasetId, "unknown"),
  };

  totalsCache.set(datasetId, { ts: Date.now(), totals });
  return totals;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // JSON first (Base44 invoke), query-param fallback
    let body = null;
    try { body = await req.json(); } catch {}

    const { searchParams } = new URL(req.url);
    const getAny = (k, fb) => body?.[k] ?? searchParams.get(k) ?? fb;

    const startRow = Number(getAny("startRow", 0));
    const endRow = Number(getAny("endRow", 100));
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

    // Cached partition totals → fast "Σύνολο"
    const totals = await getTotals(base44, dataset.id);
    const partition_total = totals[partition] ?? 0;

    // Build AND query
    const and = [
      { dataset_id: dataset.id },
      buildPartitionCondition(partition),
    ];

    if (search) {
      and.push({
        $or: [
          { person_id:      { $regex: search, $options: "i" } },
          { first_name:     { $regex: search, $options: "i" } },
          { last_name:      { $regex: search, $options: "i" } },
          { mobile_phone:   { $regex: search, $options: "i" } },
          { department:     { $regex: search, $options: "i" } },
          { ucid:           { $regex: search, $options: "i" } },
          { academic_level: { $regex: search, $options: "i" } },
        ],
      });
    }

    // Column filters — supports both legacy {operator, value} and AG Grid {filterType:'set'} models
    if (filters && typeof filters === "object") {
      for (const [field, model] of Object.entries(filters)) {
        if (!model) continue;

        // Legacy format: { operator: 'in', value: [...] }
        if (typeof model === "object" && model.operator) {
          const op = String(model.operator);
          const val = model.value;

          if (op === "in") and.push({ [field]: { $in: Array.isArray(val) ? val : [val] } });
          else if (op === "contains") and.push({ [field]: { $regex: String(val), $options: "i" } });
          else if (op === "startsWith") and.push({ [field]: { $regex: `^${String(val)}`, $options: "i" } });
          else if (op === "equals") and.push({ [field]: String(val) });
          continue;
        }

        // AG Grid set filter model: { filterType: 'set', values: [...], includeBlanks: bool }
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

        // AG Grid text filter
        if (typeof model === "object" && model.filterType === "text") {
          const type = String(model.type ?? "contains");
          const val = String(model.filter ?? "");
          if (!val) continue;
          if (type === "contains") and.push({ [field]: { $regex: val, $options: "i" } });
          else if (type === "startsWith") and.push({ [field]: { $regex: `^${val}`, $options: "i" } });
          else if (type === "equals") and.push({ [field]: val });
          continue;
        }

        // Boolean
        if (typeof model === "boolean") {
          and.push({ [field]: model });
        }
      }
    }

    const query = { $and: and };
    const rows = await base44.asServiceRole.entities.Person.filter(query, sort, limit, startRow);

    const hasAnyFilters = !!search || (filters && Object.keys(filters).length > 0);
    let lastRow = -1;
    if (!hasAnyFilters) lastRow = partition_total;
    else if (rows.length < limit) lastRow = startRow + rows.length;

    console.log(`[personGridFetch] partition=${partition} startRow=${startRow} rows=${rows.length} lastRow=${lastRow} partition_total=${partition_total}`);

    return Response.json({ rows, lastRow, partition_total });
  } catch (err) {
    console.error("❌ [personGridFetch] Error:", err?.message || err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
});