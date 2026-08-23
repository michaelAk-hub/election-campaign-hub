// Shared Person-editing helpers.
export const NON_EDITABLE = new Set([
  "id", "created_date", "updated_date", "created_by", "created_by_id", "is_sample",
  "dataset_id", "row_version",
]);

export function normalizeText(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  const t = v.trim().replace(/\s+/g, " ");
  return t === "" ? null : t;
}
