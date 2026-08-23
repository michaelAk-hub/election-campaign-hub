// portalLogin — Supabase Edge Function (ported from Base44)
// Verifies a Chreosi/Kanali operator's credentials and creates a PortalSession.
// Self-contained (no shared imports) so it can be pasted into the dashboard editor.
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeUsername(str: string): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify password; migrate legacy plaintext -> bcrypt, and backfill plain_password once.
async function verifyAndMigratePassword(
  supabase: any, table: string, id: string,
  storedHash: string, plainPassword: string, existingPlain: string | null,
): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith("$2")) {
    const match = await bcrypt.compare(plainPassword, storedHash);
    if (match && !existingPlain) {
      await supabase.from(table).update({ plain_password: plainPassword }).eq("id", id);
    }
    return match;
  }
  // Legacy plaintext stored in password_hash — allow once, then migrate.
  if (storedHash === plainPassword) {
    const hash = await bcrypt.hash(plainPassword, 10);
    await supabase.from(table).update({ password_hash: hash, plain_password: plainPassword }).eq("id", id);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { username, password } = await req.json();
    if (!username || !password) {
      return json({ success: false, error: "Λάθος στοιχεία σύνδεσης" });
    }
    const normalizedUsername = normalizeUsername(username);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ── Chreosi ──
    const { data: chreosiAll, error: cErr } = await supabase.from("ChreosiAccount").select("*");
    if (cErr) return json({ success: false, error: cErr.message }, 500);
    const chreosi = (chreosiAll ?? []).find((a: any) => normalizeUsername(a.username) === normalizedUsername);
    if (chreosi) {
      if (!chreosi.is_active) return json({ success: false, error: "Ο λογαριασμός είναι απενεργοποιημένος" });
      const ok = await verifyAndMigratePassword(
        supabase, "ChreosiAccount", chreosi.id, chreosi.password_hash, password, chreosi.plain_password,
      );
      if (!ok) return json({ success: false, error: "Λάθος στοιχεία σύνδεσης" });
      const token = generateToken();
      await supabase.from("PortalSession").insert({
        session_token: token, username: normalizedUsername, portal_type: "chreosi",
        is_active: true, expires_at: expiresAt,
      });
      return json({ success: true, token, portalType: "chreosi", username: normalizedUsername });
    }

    // ── Kanali ──
    const { data: kanaliAll, error: kErr } = await supabase.from("KanaliAccount").select("*");
    if (kErr) return json({ success: false, error: kErr.message }, 500);
    const kanali = (kanaliAll ?? []).find((a: any) => normalizeUsername(a.username) === normalizedUsername);
    if (kanali) {
      if (!kanali.is_active) return json({ success: false, error: "Ο λογαριασμός είναι απενεργοποιημένος" });
      const ok = await verifyAndMigratePassword(
        supabase, "KanaliAccount", kanali.id, kanali.password_hash, password, kanali.plain_password,
      );
      if (!ok) return json({ success: false, error: "Λάθος στοιχεία σύνδεσης" });
      const token = generateToken();
      await supabase.from("PortalSession").insert({
        session_token: token, username: normalizedUsername, portal_type: "kanali",
        kanali_type: kanali.user_type, is_active: true, expires_at: expiresAt,
      });
      return json({ success: true, token, portalType: "kanali", username: normalizedUsername, kanaliType: kanali.user_type });
    }

    return json({ success: false, error: "Λάθος στοιχεία σύνδεσης" });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, 500);
  }
});
