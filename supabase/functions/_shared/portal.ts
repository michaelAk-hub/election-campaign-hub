// Normalize a portal username: trim, collapse spaces, lowercase, strip accents.
export function normalizeUsername(str: string): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

// Validate a portal session token. Optionally constrain by username / portal type.
export async function validatePortalSession(
  supabase: any,
  sessionToken: string,
  opts: { username?: string; portalType?: string } = {},
): Promise<{ session?: any; error?: string; status?: number }> {
  if (!sessionToken) return { error: "Missing session token", status: 401 };
  let q = supabase.from("PortalSession").select("*")
    .eq("session_token", sessionToken).eq("is_active", true);
  if (opts.username) q = q.eq("username", opts.username);
  if (opts.portalType) q = q.eq("portal_type", opts.portalType);
  const { data, error } = await q;
  if (error) return { error: error.message, status: 500 };
  if (!data?.length) return { error: "Invalid session", status: 401 };
  const session = data[0];
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await supabase.from("PortalSession").update({ is_active: false }).eq("id", session.id);
    return { error: "Session expired", status: 401 };
  }
  return { session };
}
