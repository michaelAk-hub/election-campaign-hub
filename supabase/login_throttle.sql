-- ===========================================================================
-- login_throttle.sql — table backing login rate-limiting (brute-force defense).
-- Run once in the Supabase SQL editor. Idempotent.
-- The appLogin / portalLogin Edge Functions read and write this table via the
-- service_role key; it is never exposed to the public API (RLS deny-all).
-- ===========================================================================
create table if not exists public."LoginThrottle" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "throttle_key" text unique,
  "fail_count" integer default 0,
  "lock_level" integer default 0,
  "first_failed_at" timestamptz,
  "last_failed_at" timestamptz,
  "locked_until" timestamptz
);
create index if not exists "ix_LoginThrottle_key" on public."LoginThrottle" ("throttle_key");
-- Add the escalation column if the table predates it.
alter table public."LoginThrottle" add column if not exists "lock_level" integer default 0;

-- Lock it down like every other table (service_role bypasses RLS).
alter table public."LoginThrottle" enable row level security;
grant all privileges on public."LoginThrottle" to service_role;
