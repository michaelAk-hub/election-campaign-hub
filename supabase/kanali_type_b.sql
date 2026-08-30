-- Kanali Τύπος B: shared form definition + operator submissions.
-- Run once in Supabase. Safe to re-run (idempotent).

create table if not exists public."KanaliBFormField" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "field_key" text,
  "label" text,
  "input_type" text default 'text',   -- text | number | date | dropdown | yesno
  "required" boolean default false,
  "weight" integer default 1,
  "match_role" text default 'fuzzy',   -- hard | fuzzy
  "options" jsonb default '[]'::jsonb,
  "sort_order" integer default 0
);

create table if not exists public."KanaliBSubmission" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "kanali_username" text,
  "values" jsonb default '{}'::jsonb,
  "status" text default 'pending',     -- pending | done
  "matched_person_id" text,
  "resolved_by" text,
  "resolved_at" timestamptz
);
create index if not exists "ix_KanaliBSubmission_status" on public."KanaliBSubmission" ("status");

-- updated_date trigger (mirrors the other tables). The function set_updated_date
-- is created in schema.sql.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_date') then
    execute 'drop trigger if exists "trg_updated_KanaliBFormField" on public."KanaliBFormField"';
    execute 'create trigger "trg_updated_KanaliBFormField" before update on public."KanaliBFormField" for each row execute function public.set_updated_date()';
    execute 'drop trigger if exists "trg_updated_KanaliBSubmission" on public."KanaliBSubmission"';
    execute 'create trigger "trg_updated_KanaliBSubmission" before update on public."KanaliBSubmission" for each row execute function public.set_updated_date()';
  end if;
end $$;
