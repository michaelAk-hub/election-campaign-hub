// Shared helpers for importing/exporting Person rows (header mapping, file
// parsing, export column set). Mirrors the original Base44 import/export logic.
import * as XLSX from "npm:xlsx@0.18.5";

// Greek/alias header → canonical Person field.
export const GREEK_TO_FIELD: Record<string, string> = {
  "ατ": "person_id", "α.τ.": "person_id", "ατ (id)": "person_id", "at": "person_id", "person_id": "person_id",
  "ονομα": "first_name", "όνομα": "first_name", "first_name": "first_name",
  "επιθετο": "last_name", "επίθετο": "last_name", "last_name": "last_name",
  "κινητο": "mobile_phone", "κινητό": "mobile_phone", "mobile_phone": "mobile_phone",
  "eisdoxi": "admission_year", "εισδοχη": "admission_year", "εισδοχή": "admission_year", "admission_year": "admission_year",
  "επιπεδο": "academic_level", "επίπεδο": "academic_level", "academic_level": "academic_level",
  "τμημα": "department", "τμήμα": "department", "department": "department",
  "atomo_1": "contact_person_1", "ατομο_1": "contact_person_1", "άτομο 1": "contact_person_1", "ατομο 1": "contact_person_1", "contact_person_1": "contact_person_1",
  "atomo_2": "contact_person_2", "ατομο_2": "contact_person_2", "άτομο 2": "contact_person_2", "ατομο 2": "contact_person_2", "contact_person_2": "contact_person_2",
  "μελος": "member", "μέλος": "member", "member": "member",
  "psifise": "voted", "ψηφισε": "voted", "ψήφισε": "voted", "voted": "voted",
  "συμβολο προβλεψης": "prediction_symbol", "σύμβολο πρόβλεψης": "prediction_symbol", "prediction_symbol": "prediction_symbol",
  "σημειωσεις": "notes", "σημειώσεις": "notes", "notes": "notes",
  "παρατηρησεις": "details", "παρατηρήσεις": "details", "details": "details",
  "ονομα πατερα": "father_name", "όνομα πατέρα": "father_name", "father_name": "father_name",
  "ον_πατρος": "father_n", "ον_πατρός": "father_n", "father_n": "father_n",
  "κατ": "direction", "direction": "direction",
  "electoraldistrict": "ElectoralDistrict", "ElectoralDistrict": "ElectoralDistrict",
  "electoraltown": "ElectoralTown", "ElectoralTown": "ElectoralTown",
  "relatedmember": "RelatedMember", "RelatedMember": "RelatedMember",
  "μοναδικο καναλι": "monadikos_kanali", "μοναδικό κανάλι": "monadikos_kanali", "monadikos_kanali": "monadikos_kanali",
  "ucid": "ucid", "x": "X", "X": "X", "f26_1": "F26_1", "F26_1": "F26_1", "f25": "F25", "F25": "F25",
  "phone": "phone", "t24": "T24", "T24": "T24", "f24": "F24", "F24": "F24",
  "f23": "F23", "F23": "F23", "t22": "T22", "T22": "T22",
};

export const KNOWN_FIELDS = new Set([
  "dataset_id", "department", "admission_year", "academic_level", "person_id",
  "ucid", "mobile_phone", "first_name", "last_name", "contact_person_1",
  "contact_person_2", "member", "prediction_symbol", "voted", "voted_at",
  "notes", "monadikos_kanali", "direction", "X", "F26_1", "F25", "phone",
  "T24", "F24", "F23", "T22", "details", "father_n", "father_name",
  "ElectoralDistrict", "ElectoralTown", "RelatedMember", "custom_data", "row_version",
]);

const normalizeKey = (k: unknown) => String(k).trim().toLowerCase();

export function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const n = normalizeKey(h);
    if (GREEK_TO_FIELD[n]) map[n] = GREEK_TO_FIELD[n];
    else if (GREEK_TO_FIELD[h]) map[h] = GREEK_TO_FIELD[h];
    else if (KNOWN_FIELDS.has(h)) { map[n] = h; map[h] = h; }
  }
  return map;
}

export function mapRow(rawRow: Record<string, any>, headerMap: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  const custom: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const canonical = headerMap[normalizeKey(rawKey)] || headerMap[rawKey] || null;
    if (!canonical) {
      custom[rawKey] = value === null || value === undefined ? "" : String(value);
      continue;
    }
    if (canonical === "voted") {
      const s = String(value ?? "").trim().toLowerCase();
      out[canonical] = ["ναι", "nai", "yes", "true", "1", "y"].includes(s);
    } else {
      out[canonical] = value === null || value === undefined ? "" : String(value).trim();
    }
  }
  if (Object.keys(custom).length > 0) out.custom_data = custom;
  return out;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else current += ch;
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

// Parse a CSV/XLSX file at a URL (http(s) or a data: URL) into raw row objects.
export async function parseFile(fileUrl: string): Promise<Record<string, any>[]> {
  const res = await fetch(fileUrl);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4B; // ZIP magic "PK"
  if (isXlsx) {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  return parseCSV(text);
}

// Export column order + Greek labels (matches the original export).
export const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "person_id", label: "ΑΤ (ID)" }, { key: "ucid", label: "UCID" },
  { key: "last_name", label: "Επίθετο" }, { key: "first_name", label: "Όνομα" },
  { key: "department", label: "Τμήμα" }, { key: "admission_year", label: "Εισδοχή" },
  { key: "academic_level", label: "Επίπεδο" }, { key: "mobile_phone", label: "Κινητό" },
  { key: "contact_person_1", label: "Άτομο 1" }, { key: "contact_person_2", label: "Άτομο 2" },
  { key: "member", label: "Μέλος" }, { key: "prediction_symbol", label: "Σύμβολο Πρόβλεψης" },
  { key: "voted", label: "Ψήφισε" }, { key: "monadikos_kanali", label: "Μοναδικό Κανάλι" },
  { key: "notes", label: "Σημειώσεις" }, { key: "direction", label: "ΚΑΤ" },
  { key: "X", label: "X" }, { key: "F26_1", label: "Φ26_1" }, { key: "F25", label: "Φ25" },
  { key: "phone", label: "phone" }, { key: "T24", label: "T24" }, { key: "F24", label: "Φ24" },
  { key: "F23", label: "Φ23" }, { key: "T22", label: "T22" }, { key: "details", label: "ΠΑΡΑΤΗΡΗΣΕΙΣ" },
  { key: "father_n", label: "ΟΝ_ΠΑΤΡΟΣ" }, { key: "father_name", label: "ΟΝΟΜΑ ΠΑΤΕΡΑ" },
  { key: "ElectoralDistrict", label: "ElectoralDistrict" }, { key: "ElectoralTown", label: "ElectoralTown" },
  { key: "RelatedMember", label: "RelatedMember" },
];

export function rowToExportRow(p: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of EXPORT_COLUMNS) {
    let val = p[col.key];
    if (col.key === "voted") val = val ? "ΝΑΙ" : "ΟΧΙ";
    out[col.label] = val === null || val === undefined ? "" : String(val);
  }
  return out;
}

export function buildXlsx(rows: Record<string, any>[]): Uint8Array {
  const exported = rows.map(rowToExportRow);
  const ws = XLSX.utils.json_to_sheet(exported, { header: EXPORT_COLUMNS.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Εγγραφές");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

// Export rows using an arbitrary column set (label + key + physical), reading
// physical columns directly and non-physical ones from custom_data. Used for
// free-form scratch tables whose columns come from the ColumnDef registry.
export function buildXlsxDynamic(
  columns: { key: string; label: string; physical: boolean; type?: string }[],
  rows: Record<string, any>[],
): Uint8Array {
  const data = rows.map((r) => {
    const o: Record<string, string> = {};
    for (const c of columns) {
      let v = c.physical ? r[c.key] : r?.custom_data?.[c.key];
      if (c.key === "voted") v = v ? "ΝΑΙ" : "ΟΧΙ";
      o[c.label] = v === null || v === undefined ? "" : String(v);
    }
    return o;
  });
  const header = columns.map((c) => c.label);
  const ws = XLSX.utils.json_to_sheet(data, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Εγγραφές");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
