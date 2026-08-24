// In-memory Person filtering shared by the grid and export (small dataset).
export const POSTGRAD = ["Δ", "Μ", "Μεταπτυχιακός Εράσμους"];
export const UNDERGRAD = ["Π", "Προπτυχιακός Εράσμους"];

const SEARCH_FIELDS = [
  "person_id", "first_name", "last_name", "mobile_phone", "department", "ucid",
  "direction", "X", "F26_1", "F25", "phone", "T24", "F24", "F23", "T22",
  "details", "father_n", "father_name", "ElectoralDistrict", "ElectoralTown", "RelatedMember",
];

export const isBlank = (v: any) =>
  v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");

const getField = (p: any, rawField: string) =>
  rawField.startsWith("custom:") ? p.custom_data?.[rawField.slice(7)] : p[rawField];

export function matchesPartition(p: any, partition: string): boolean {
  if (partition === "postgrad") return POSTGRAD.includes(p.academic_level);
  if (partition === "undergrad") return UNDERGRAD.includes(p.academic_level);
  if (partition === "unknown") return isBlank(p.academic_level);
  return true;
}

export function matchesSearch(p: any, s: string): boolean {
  const q = s.toLowerCase();
  return SEARCH_FIELDS.some((f) => String(p[f] ?? "").toLowerCase().includes(q));
}

export function matchesFilters(p: any, filters: any): boolean {
  for (const [rawField, model] of Object.entries(filters || {})) {
    if (!model) continue;
    const v = getField(p, rawField);
    if (typeof model === "object" && (model as any).filterType === "set") {
      const { values = [], includeBlanks = false } = model as any;
      const inValues = values.includes(v) || values.map(String).includes(String(v));
      if (!(inValues || (isBlank(v) && includeBlanks))) return false;
    } else if (typeof model === "object" && (model as any).filterType === "text") {
      const type = String((model as any).type ?? "contains");
      const val = String((model as any).filter ?? "");
      if (!val) continue;
      const sv = String(v ?? "").toLowerCase();
      const q = val.toLowerCase();
      if (type === "contains" && !sv.includes(q)) return false;
      else if (type === "startsWith" && !sv.startsWith(q)) return false;
      else if (type === "equals" && String(v ?? "") !== val) return false;
    } else if (typeof model === "boolean") {
      if (Boolean(v) !== model) return false;
    }
  }
  return true;
}

// Filter + sort a Person array the same way the grid does.
export function filterAndSort(
  all: any[], datasetId: string, partition: string,
  search: string, filters: any, sortField: string, sortDirection: string,
): any[] {
  const s = search && search.length >= 2 ? search : "";
  const rows = all.filter((p) =>
    p.dataset_id === datasetId
    && matchesPartition(p, partition)
    && (!s || matchesSearch(p, s))
    && matchesFilters(p, filters)
  );
  const dir = sortDirection === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const an = Number(av), bn = Number(bv);
    if (!isNaN(an) && !isNaN(bn) && String(av).trim() !== "" && String(bv).trim() !== "") return (an - bn) * dir;
    return String(av).localeCompare(String(bv), "el") * dir;
  });
  return rows;
}
