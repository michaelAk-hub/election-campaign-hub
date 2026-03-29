// Shared normalization for Chreosi usernames.
// IMPORTANT: This file is imported inline (copy-pasted) by other functions
// because Deno functions cannot import local files.
// DO NOT call this file directly — copy the normalizeUsername function below
// into any backend function that needs it.

export function normalizeUsername(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accent diacritics
    .normalize('NFC');
}