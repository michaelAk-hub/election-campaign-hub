// Shared helpers for the admin/organotiki (AppSession) auth model.

// Unsalted SHA-256 hex — matches Base44 appLogin/createOrganotiki hashing (kept so
// the imported AppUser password hashes keep working).
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Normalize a phone to E.164 (default +357 Cyprus).
export function normalizePhone(phone: string): string {
  const raw = (phone || "").replace(/\s+/g, "");
  return raw.startsWith("+") ? raw : `+357${raw}`;
}

// Validate an admin/organotiki session for data functions (grid, predictions, etc.).
export async function strictAuth(supabase: any, sessionToken: string) {
  if (!sessionToken) return { error: "Unauthorized: No session token", status: 401 };
  const { data: sessions } = await supabase.from("AppSession").select("*")
    .eq("session_token", sessionToken).eq("is_active", true);
  if (!sessions?.length) return { error: "Invalid session", status: 401 };
  const session = sessions[0];
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return { error: "Session expired", status: 401 };
  }
  const { data: users } = await supabase.from("AppUser").select("*").eq("id", session.app_user_id);
  if (!users?.length) return { error: "User not found", status: 401 };
  const user = users[0];
  if (!user.is_active && user.role !== "ADMIN") return { error: "Account inactive", status: 401 };
  if (session.session_version_at_login !== undefined && user.session_version !== undefined
    && session.session_version_at_login !== user.session_version) {
    return { error: "Session invalidated", status: 401, force_logout: true };
  }
  if (!["ADMIN", "ORGANOTIKI"].includes(user.role)) return { error: "Forbidden", status: 403 };
  return { user, session };
}
