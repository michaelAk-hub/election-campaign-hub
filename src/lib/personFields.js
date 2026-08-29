// Live Person fields that can be shown in the Chreosi operator portal.
// Mirrors the Records grid COLUMNS (keys + Greek labels) without pulling in the
// grid's React render deps, so both the admin picker (ChreosiAccounts) and the
// portal (Portal) share one source of truth.
export const PERSON_FIELDS = [
  { key: 'person_id', label: 'ΑΤ (ID)' },
  { key: 'ucid', label: 'UCID' },
  { key: 'last_name', label: 'Επίθετο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'department', label: 'Τμήμα' },
  { key: 'admission_year', label: 'Εισδοχή' },
  { key: 'academic_level', label: 'Επίπεδο' },
  { key: 'mobile_phone', label: 'Κινητό', kind: 'phone' },
  { key: 'contact_person_1', label: 'Άτομο 1' },
  { key: 'contact_person_2', label: 'Άτομο 2' },
  { key: 'member', label: 'Μέλος' },
  { key: 'prediction_symbol', label: 'Σύμβολο Πρόβλεψης' },
  { key: 'voted', label: 'Ψήφισε', type: 'boolean' },
  { key: 'monadikos_kanali', label: 'Μοναδικό Κανάλι' },
  { key: 'notes', label: 'Σημειώσεις' },
  { key: 'direction', label: 'ΚΑΤ' },
  { key: 'X', label: 'X' },
  { key: 'F26_1', label: 'Φ26_1' },
  { key: 'F25', label: 'Φ25' },
  { key: 'phone', label: 'phone', kind: 'phone' },
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

export const PERSON_FIELD_BY_KEY = Object.fromEntries(PERSON_FIELDS.map(f => [f.key, f]));

// The historical fixed portal layout. Used when an account has no explicit
// visible_fields yet, so existing accounts keep exactly the same view.
export const DEFAULT_PORTAL_FIELDS = [
  'last_name', 'first_name', 'department', 'admission_year',
  'ElectoralTown', 'ElectoralDistrict', 'voted', 'mobile_phone', 'notes',
];
