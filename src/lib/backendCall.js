/**
 * Raw fetch helper for Base44 backend functions.
 * Zero SDK dependency — constructs the URL from Vite env vars and uses
 * the native browser fetch API directly.
 */

const APP_BASE_URL =
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Call a Base44 backend function by name with a plain JSON payload.
 * Throws on HTTP errors so callers can handle them uniformly.
 *
 * @param {string} functionName  - The deployed Deno function name
 * @param {object} payload       - JSON-serialisable request body
 * @returns {Promise<object>}    - Parsed JSON response body
 */
export async function callBackendFunction(functionName, payload = {}) {
  const url = `${APP_BASE_URL}/api/functions/${functionName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Function "${functionName}" returned non-JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(body?.error || `Function "${functionName}" failed: HTTP ${res.status}`);
  }

  return body;
}