-- ===========================================================================
-- security.sql — lock the public Data API shut (defense-in-depth).
--
-- The app never queries tables from the browser; every read/write goes through
-- Edge Functions using the service_role key (which has BYPASSRLS). So we can
-- safely enable Row Level Security with NO policies on every table: anon and
-- authenticated (the roles the public Data API / anon key run as) get zero
-- access, while the Edge Functions keep working unchanged.
--
-- This closes any exposure of voter PII, password_hash and the intentionally
-- plaintext plain_password via the REST Data API. plain_password stays in the
-- table as-is (admins read it through admin-authed Edge Functions to distribute
-- credentials) — this is access-restriction, not encryption.
--
-- Idempotent: safe to run multiple times. Run it in the Supabase SQL editor.
-- ===========================================================================

-- 1. Enable RLS on every table in the public schema (no policies = deny-all
--    for anon/authenticated; service_role bypasses RLS entirely).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- 2. Belt-and-suspenders: make sure the public roles hold no table/sequence
--    privileges, now or on future tables. (RLS already denies them, but a
--    missing grant means they never even reach the policy check.)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 3. Re-assert the service_role grants the Edge Functions depend on (in case a
--    later "expose tables" toggle changed things).
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Done. Verify from a machine that can reach the project (see instructions):
--   curl "$URL/rest/v1/ChreosiAccount?select=id&limit=1" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
-- Expect an empty array [] or a permission error — never real rows.
