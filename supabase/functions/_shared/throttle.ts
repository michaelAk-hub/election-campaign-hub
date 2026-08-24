// Login rate-limiting: lock a key after too many failed attempts in a window.
// Backed by the LoginThrottle table (see supabase/login_throttle.sql).
const MAX_FAILS = 5;          // failures allowed before lock
const WINDOW_MS = 15 * 60 * 1000;  // counting window
const LOCK_MS = 15 * 60 * 1000;    // lock duration once tripped

// If the key is currently locked, returns how long to wait; else null.
export async function throttleRetryAfter(supabase: any, key: string): Promise<number | null> {
  const { data } = await supabase.from("LoginThrottle").select("locked_until").eq("throttle_key", key).maybeSingle();
  if (data?.locked_until && new Date(data.locked_until) > new Date()) {
    return Math.ceil((new Date(data.locked_until).getTime() - Date.now()) / 1000);
  }
  return null;
}

// Record a failed attempt; trips a lock at MAX_FAILS within WINDOW_MS.
export async function recordLoginFailure(supabase: any, key: string): Promise<void> {
  const now = new Date();
  const { data } = await supabase.from("LoginThrottle").select("*").eq("throttle_key", key).maybeSingle();
  if (!data) {
    await supabase.from("LoginThrottle").insert({
      throttle_key: key, fail_count: 1, first_failed_at: now.toISOString(), last_failed_at: now.toISOString(),
    });
    return;
  }
  const firstFailed = data.first_failed_at ? new Date(data.first_failed_at) : now;
  const windowExpired = now.getTime() - firstFailed.getTime() > WINDOW_MS;
  const failCount = (windowExpired ? 0 : (data.fail_count || 0)) + 1;
  const patch: any = { fail_count: failCount, last_failed_at: now.toISOString() };
  if (windowExpired || !data.first_failed_at) patch.first_failed_at = now.toISOString();
  if (failCount >= MAX_FAILS) patch.locked_until = new Date(now.getTime() + LOCK_MS).toISOString();
  await supabase.from("LoginThrottle").update(patch).eq("throttle_key", key);
}

// Clear the counter on a successful login.
export async function clearLoginThrottle(supabase: any, key: string): Promise<void> {
  await supabase.from("LoginThrottle").delete().eq("throttle_key", key);
}

// Greek "try again in N minutes" message.
export function lockedMessage(retryAfterSec: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Πάρα πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε ${mins} λεπτά.`;
}
