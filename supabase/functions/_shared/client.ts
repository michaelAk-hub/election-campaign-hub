import { createClient } from "npm:@supabase/supabase-js@2";

// Service-role client — bypasses RLS; used by all Edge Functions.
// Mirrors Base44's `base44.asServiceRole`.
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
