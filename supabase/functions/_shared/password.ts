// password.ts — AppUser (admin/organotikos) password hashing.
// New passwords use bcrypt. Legacy accounts hashed with unsalted SHA-256 still
// verify, and callers transparently re-hash them to bcrypt on next login.
// Kept out of appSession.ts so bcrypt isn't pulled into every function.
import bcrypt from "npm:bcryptjs@2.4.3";
import { sha256Hex } from "./appSession.ts";

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 10);
}

// Returns { ok, legacy }. legacy=true means the stored hash was the old
// unsalted SHA-256 and the caller should re-hash to bcrypt.
export async function verifyPassword(plain: string, storedHash: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (!storedHash) return { ok: false, legacy: false };
  if (storedHash.startsWith("$2")) {
    return { ok: await bcrypt.compare(plain, storedHash), legacy: false };
  }
  const legacyOk = (await sha256Hex(plain)) === storedHash;
  return { ok: legacyOk, legacy: legacyOk };
}
