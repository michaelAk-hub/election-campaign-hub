/**
 * Raw fetch helper for Base44 backend functions.
 * Mirrors exactly what base44.functions.invoke does internally:
 *   POST ${appBaseUrl}/api/functions/${name}
 * with a JSON body — no SDK dependency.
 */
import { appParams } from '@/lib/app-params';

export async function callBackendFunction(functionName, payload = {}) {
  const base = (appParams.appBaseUrl || window.location.origin).replace(/\/$/, '');
  const url = `${base}/api/functions/${functionName}`;

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