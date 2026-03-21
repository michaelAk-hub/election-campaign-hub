/**
 * Non-SDK backend function caller.
 *
 * URL derivation (per Base44 docs):
 *   https://<your-app-domain>/functions/<function-name>
 *
 * The "app domain" is appParams.appBaseUrl — the exact same value the SDK
 * receives as its `appBaseUrl` option (sourced from VITE_BASE44_APP_BASE_URL
 * env var, or overridden via ?app_base_url= query param / localStorage).
 * Falls back to window.location.origin when appBaseUrl is not set (local dev).
 *
 * Path: /functions/{name}  — no version prefix, no /api/ prefix.
 */
import { appParams } from '@/lib/app-params';

const isDev = import.meta.env.DEV;

export async function callBackendFunction(functionName, payload = {}) {
  const base = (appParams.appBaseUrl || window.location.origin).replace(/\/$/, '');
  const url = `${base}/functions/${functionName}`;

  if (isDev) {
    console.log(`[backendCall] → POST ${url}`, payload);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (isDev) {
    console.log(`[backendCall] ← ${res.status} ${url}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Function "${functionName}" returned non-JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    if (isDev) {
      console.error(`[backendCall] error body:`, body);
    }
    throw new Error(body?.error || `Function "${functionName}" failed: HTTP ${res.status}`);
  }

  return body;
}