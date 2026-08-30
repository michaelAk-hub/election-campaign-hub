// greek.ts — Greek-aware text matching for Kanali Τύπος B identification.
// Handles the spelling/grammar variation the operators produce (accents,
// case, and sound-alike letters like ο/ω, η/ι/υ, ει/οι, αι/ε).

// Strip diacritics + uppercase. Used as the base for both hard and fuzzy keys.
export function stripAccentsUpper(s: unknown): string {
  return String(s ?? "").trim().toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

// Exact-normalized key for HARD filters (accent/case-insensitive, collapsed spaces).
export function hardKey(s: unknown): string {
  return stripAccentsUpper(s).replace(/\s+/g, " ").trim();
}

const TRUTHY = new Set(["TRUE", "ΝΑΙ", "NAI", "YES", "1", "Y", "ΝΑΙ."]);
export function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  return TRUTHY.has(hardKey(v));
}
// Whether a submitted/stored value is a yes/no answer (so we compare by truthiness).
export function isBoolLike(v: unknown): boolean {
  if (typeof v === "boolean") return true;
  const k = hardKey(v);
  return k === "ΝΑΙ" || k === "ΟΧΙ" || k === "TRUE" || k === "FALSE" || k === "YES" || k === "NO";
}

// Equality for a hard-filter field: boolean-aware, else exact-normalized.
export function hardEquals(personVal: unknown, submittedVal: unknown): boolean {
  if (isBoolLike(personVal) || isBoolLike(submittedVal)) return truthy(personVal) === truthy(submittedVal);
  return hardKey(personVal) === hardKey(submittedVal);
}

// Phonetic fold: collapse Greek sound-alikes so spelling variants converge.
// Γιώργος / Γιοργος / Γεοργιος → the same key.
export function phonetic(s: unknown): string {
  let x = stripAccentsUpper(s).replace(/[^Α-ΩA-Z0-9]/g, "");
  // digraphs first
  x = x.replace(/ΑΙ/g, "Ε")
       .replace(/ΟΥ/g, "Υ")   // ου
       .replace(/ΕΙ/g, "Ι").replace(/ΟΙ/g, "Ι").replace(/ΥΙ/g, "Ι");
  // single vowels
  x = x.replace(/Ω/g, "Ο").replace(/Η/g, "Ι").replace(/Υ/g, "Ι");
  // collapse repeated letters (λλ→λ, σσ→σ …)
  x = x.replace(/(.)\1+/g, "$1");
  return x;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// Similarity in [0,1] after phonetic folding. 1 = identical, 0 = nothing in common.
export function similarity(a: unknown, b: unknown): number {
  const pa = phonetic(a), pb = phonetic(b);
  if (!pa && !pb) return 1;
  if (!pa || !pb) return 0;
  if (pa === pb) return 1;
  const d = levenshtein(pa, pb);
  const maxLen = Math.max(pa.length, pb.length);
  return maxLen ? Math.max(0, 1 - d / maxLen) : 0;
}
