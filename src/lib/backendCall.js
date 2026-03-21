/**
 * Raw fetch helper for Base44 backend functions.
 * Zero SDK dependency — constructs the correct versioned URL from appParams
 * and uses the native browser fetch API directly.
 */
import { appParams } from '@/lib/app-params';

/**
 * Call a Base44 backend function by name with a plain JSON payload.
 * Throws on HTTP errors so callers can handle them uniformly.
 *
 * @param {string} functionName  - The deployed Deno function name
 * @param {object} payload       - JSON-serialisable request body
 * @returns {Promise<object>}    - Parsed JSON response body
 */
export async function callBackendFunction(functionName, payload = {}) {
  const version = appParams.functionsVersion || '3';
  const base = appParams.appBaseUrl || window.location.origin;
  const url = `${base}/api/v${version}/functions/${functionName}`;

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