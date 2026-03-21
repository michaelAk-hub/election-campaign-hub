/**
 * Raw fetch helper for Base44 backend functions.
 * Constructs the same URL the Base44 SDK uses internally:
 *   POST ${appBaseUrl}/api/v${functionsVersion}/functions/${name}
 * No SDK dependency — plain browser fetch.
 */
import { appParams } from '@/lib/app-params';

export async function callBackendFunction(functionName, payload = {}) {
  const base = (appParams.appBaseUrl || window.location.origin).replace(/\/$/, '');
  const version = appParams.functionsVersion || '3';
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