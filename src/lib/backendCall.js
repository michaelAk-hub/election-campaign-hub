/**
 * Raw fetch helper for Base44 backend functions.
 * Endpoint format per Base44 docs: https://<app-domain>/functions/<name>
 * Plain browser fetch — zero SDK dependency.
 */

export async function callBackendFunction(functionName, payload = {}) {
  const url = `${window.location.origin}/functions/${functionName}`;

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