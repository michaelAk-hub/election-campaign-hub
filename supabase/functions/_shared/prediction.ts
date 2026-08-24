// Shared helpers for the (live-computed) prediction stats.
import { fetchAll } from "./db.ts";

export const BLANK_SYMBOL = "(Κενό)";
export const UNKNOWN_YEAR = "(Άγνωστο)";

// Empty/whitespace symbol → BLANK_SYMBOL; otherwise trimmed + collapsed spaces.
export function normalizeSymbol(raw: any): string {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  return s !== "" ? s : BLANK_SYMBOL;
}

export function normalizeYear(year: any): string {
  return year ? String(year) : UNKNOWN_YEAR;
}

// Resolve the active dataset id (or null).
export async function getActiveDatasetId(supabase: any): Promise<string | null> {
  const { data } = await supabase.from("Dataset").select("id").eq("status", "active");
  return data?.[0]?.id ?? null;
}

// All Person rows of the active dataset.
export async function getActivePersons(supabase: any, datasetId: string): Promise<any[]> {
  const all = await fetchAll(supabase, "Person");
  return all.filter((p) => p.dataset_id === datasetId);
}
