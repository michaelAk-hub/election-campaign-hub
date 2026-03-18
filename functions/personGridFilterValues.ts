import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];

function buildPartitionCondition(partition) {
  if (partition === "postgrad") return { academic_level: { $in: POSTGRAD } };
  if (partition === "undergrad") return { academic_level: { $in: UNDERGRAD } };
  if (partition === "unknown") return { $or: [{ academic_level: null }, { academic_level: "" }, { academic_level: { $exists: false } }] };
  return null; // "all" = no condition
}

function isBlank(v) {
  return v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
}

function isHighCardinality(columnKey) {
  if (columnKey.startsWith("custom:")) return true;
  return ["person_id", "ucid", "mobile_phone", "first_name", "last_name", "monadikos_kanali"].includes(columnKey);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const sessionToken = String(body?.session_token ?? "").trim();

    if (!sessionToken) return Response.json({ error: "Απαιτείται session token" }, { status: 401 });
    const sessions = await base44.asServiceRole.entities.AppSession.filter({ session_token: sessionToken, is_active: true });
    if (sessions.length === 0) return Response.json({ error: "Μη έγκυρη συνεδρία" }, { status: 401 });
    const users = await base44.asServiceRole.entities.AppUser.filter({ id: sessions[0].app_user_id });
    if (users.length === 0 || !["ADMIN", "ORGANOTIKI"].includes(users[0].role)) {
      return Response.json({ error: "Δεν επιτρέπεται η πρόσβαση" }, { status: 403 });
    }
    if (users[0].role === "ORGANOTIKI" && !users[0].is_active) {
      return Response.json({ error: "Ο λογαριασμός σας έχει απενεργοποιηθεί" }, { status: 403 });
    }

    const { columnKey, searchText = "", partition = "postgrad" } = body;

    // Fast path for academic_level column — values are known statically per partition
    if (columnKey === "academic_level") {
      if (partition === "postgrad") return Response.json({ values: POSTGRAD, hasBlanks: false, totalCount: POSTGRAD.length });
      if (partition === "undergrad") return Response.json({ values: UNDERGRAD, hasBlanks: false, totalCount: UNDERGRAD.length });
      return Response.json({ values: [], hasBlanks: true, totalCount: 1 });
    }
    if (!columnKey) return Response.json({ error: "columnKey is required" }, { status: 400 });

    const active = await base44.asServiceRole.entities.Dataset.filter({ status: "active" });
    if (!active.length) return Response.json({ values: [], hasBlanks: false, totalCount: 0 });

    const datasetId = active[0].id;
    const high = isHighCardinality(String(columnKey));
    const MIN_SEARCH = 2;

    const st = String(searchText).trim();

    // High-cardinality: require min search chars
    if (high && st.length < MIN_SEARCH) {
      return Response.json({
        values: [],
        hasBlanks: false,
        totalCount: 0,
        requiresSearch: true,
        minSearchChars: MIN_SEARCH,
        message: `Πληκτρολόγησε ${MIN_SEARCH}+ χαρακτήρες για να εμφανιστούν τιμές.`,
      });
    }

    // Boolean columns
    if (columnKey === "voted") {
      return Response.json({ values: [false, true], hasBlanks: false, totalCount: 2, requiresSearch: false });
    }

    const isCustom = String(columnKey).startsWith("custom:");
    const customKey = isCustom ? String(columnKey).slice(7) : null;

    const partitionCond = buildPartitionCondition(partition);
    const and = [
      { dataset_id: datasetId },
      ...(partitionCond ? [partitionCond] : []),
    ];

    // For non-custom fields with search: push regex to reduce scan
    if (!isCustom && st) {
      and.push({ [columnKey]: { $regex: st, $options: "i" } });
    }

    const query = { $and: and };

    const batchSize = 1000;
    const maxUnique = high ? 200 : 500;
    const maxScanRows = high ? 2000 : 8000;

    const valuesSet = new Set();
    let hasBlanks = false;
    let scanned = 0;
    let skip = 0;
    let capped = false;

    while (true) {
      const batch = await base44.asServiceRole.entities.Person.filter(query, "-created_date", batchSize, skip);
      if (!batch.length) break;

      for (const p of batch) {
        scanned++;

        let v;
        if (isCustom) v = p.custom_data?.[customKey];
        else v = p[columnKey];

        if (isBlank(v)) { hasBlanks = true; continue; }

        // Custom fields: client-side text filter
        if (isCustom && st) {
          if (!String(v).toLowerCase().includes(st.toLowerCase())) continue;
        }

        valuesSet.add(typeof v === "boolean" ? v : String(v));

        if (valuesSet.size >= maxUnique || scanned >= maxScanRows) { capped = true; break; }
      }

      if (capped) break;
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    const values = Array.from(valuesSet).sort((a, b) => {
      if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
      const aNum = Number(a);
      const bNum = Number(b);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a).localeCompare(String(b), "el");
    });

    return Response.json({
      values,
      hasBlanks,
      totalCount: values.length + (hasBlanks ? 1 : 0),
      requiresSearch: false,
      minSearchChars: high ? MIN_SEARCH : 0,
      message: capped ? `Εμφανίζονται οι πρώτες ${values.length} τιμές.` : "",
    });
  } catch (err) {
    console.error("❌ [personGridFilterValues] Error:", err?.message || err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
});