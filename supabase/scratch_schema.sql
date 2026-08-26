-- ===========================================================================
-- Scratch tables + shared-schema (ColumnDef) foundation.
-- See docs/scratch-tables-and-schema-design.md.
--
-- Purely additive: creates three NEW tables and seeds the shared schema from
-- the current Person columns. Nothing here touches Person or any existing
-- function. Safe to run against the live database at any time.
--
-- Run once against the existing DB (Supabase SQL editor). The same table defs
-- are also mirrored into schema.sql for fresh installs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ColumnDef — one shared schema governing the live table and every scratch
-- table. Mandatory rows are locked in the Design View. `physical` = backed by
-- a real Person/PersonScratch column (the seeded fields); future non-mandatory
-- fields are physical=false and live in each row's custom_data.
-- ---------------------------------------------------------------------------
create table if not exists public."ColumnDef" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "key" text not null unique,
  "label" text,
  "type" text not null default 'text',        -- text | number | date | boolean | select
  "mandatory" boolean not null default false, -- code depends on it → cannot delete/rename/retype
  "physical" boolean not null default false,  -- true = real column; false = stored in custom_data
  "sort_order" integer not null default 0,
  "options" jsonb                             -- allowed values, for type = 'select'
);
create index if not exists "ix_ColumnDef_order" on public."ColumnDef" ("sort_order");

-- ---------------------------------------------------------------------------
-- ScratchDataset — registry of scratch imports; drives the grid tab strip.
-- Server-side, so all admins see the same tabs and they survive logout.
-- ---------------------------------------------------------------------------
create table if not exists public."ScratchDataset" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "status" text default 'active',
  "total_records" integer default 0
);

-- ---------------------------------------------------------------------------
-- PersonScratch — mirror of Person (same columns) + scratch_dataset_id.
-- Holds the rows of ALL scratch tables, partitioned by scratch_dataset_id.
-- Deliberately separate from Person so no system function can read it.
-- ---------------------------------------------------------------------------
create table if not exists public."PersonScratch" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "scratch_dataset_id" text,
  "dataset_id" text,
  "department" text,
  "admission_year" text,
  "academic_level" text,
  "person_id" text,
  "ucid" text,
  "mobile_phone" text,
  "first_name" text,
  "last_name" text,
  "contact_person_1" text,
  "contact_person_2" text,
  "member" text,
  "prediction_symbol" text,
  "voted" boolean default false,
  "voted_at" timestamptz,
  "notes" text,
  "monadikos_kanali" text,
  "direction" text,
  "X" text,
  "F26_1" text,
  "F25" text,
  "phone" text,
  "T24" text,
  "F24" text,
  "F23" text,
  "T22" text,
  "details" text,
  "father_n" text,
  "father_name" text,
  "ElectoralDistrict" text,
  "ElectoralTown" text,
  "RelatedMember" text,
  "custom_data" jsonb,
  "row_version" integer default 1
);
create index if not exists "ix_PersonScratch_dataset" on public."PersonScratch" ("scratch_dataset_id");
create index if not exists "ix_PersonScratch_person_id" on public."PersonScratch" ("person_id");

-- ---------------------------------------------------------------------------
-- Seed ColumnDef from the current Person columns (audited 2026-08-26).
-- All seeded fields are physical=true. `mandatory` follows the audit: fields
-- referenced by code logic are locked; the rest are user-editable/removable.
-- Idempotent: re-running leaves existing rows untouched.
-- ---------------------------------------------------------------------------
insert into public."ColumnDef" ("key", "label", "type", "mandatory", "physical", "sort_order") values
  ('person_id',         'ΑΤ (ID)',            'text',    true,  true,  10),
  ('ucid',              'UCID',               'text',    true,  true,  20),
  ('last_name',         'Επίθετο',            'text',    true,  true,  30),
  ('first_name',        'Όνομα',              'text',    true,  true,  40),
  ('department',        'Τμήμα',              'text',    true,  true,  50),
  ('admission_year',    'Εισδοχή',            'text',    true,  true,  60),
  ('academic_level',    'Επίπεδο',            'text',    true,  true,  70),
  ('mobile_phone',      'Κινητό',             'text',    true,  true,  80),
  ('contact_person_1',  'Άτομο 1',            'text',    true,  true,  90),
  ('contact_person_2',  'Άτομο 2',            'text',    true,  true, 100),
  ('member',            'Μέλος',              'text',    true,  true, 110),
  ('prediction_symbol', 'Σύμβολο Πρόβλεψης',  'text',    true,  true, 120),
  ('voted',             'Ψήφισε',             'boolean', true,  true, 130),
  ('voted_at',          'Ώρα Ψήφου',          'date',    true,  true, 140),
  ('monadikos_kanali',  'Μοναδικό Κανάλι',    'text',    true,  true, 150),
  ('notes',             'Σημειώσεις',         'text',    true,  true, 160),
  ('direction',         'ΚΑΤ',                'text',    false, true, 170),
  ('X',                 'X',                  'text',    false, true, 180),
  ('F26_1',             'Φ26_1',              'text',    false, true, 190),
  ('F25',               'Φ25',                'text',    false, true, 200),
  ('phone',             'phone',              'text',    false, true, 210),
  ('T24',               'T24',                'text',    false, true, 220),
  ('F24',               'Φ24',                'text',    false, true, 230),
  ('F23',               'Φ23',                'text',    false, true, 240),
  ('T22',               'T22',                'text',    false, true, 250),
  ('details',           'ΠΑΡΑΤΗΡΗΣΕΙΣ',       'text',    false, true, 260),
  ('father_n',          'ΟΝ_ΠΑΤΡΟΣ',          'text',    false, true, 270),
  ('father_name',       'ΟΝΟΜΑ ΠΑΤΕΡΑ',       'text',    false, true, 280),
  ('ElectoralDistrict', 'ElectoralDistrict',  'text',    false, true, 290),
  ('ElectoralTown',     'ElectoralTown',      'text',    false, true, 300),
  ('RelatedMember',     'RelatedMember',      'text',    false, true, 310)
on conflict ("key") do nothing;

-- ---------------------------------------------------------------------------
-- RLS: deny-all for anon/authenticated on the three new tables (service_role
-- bypasses). Mirrors the model in schema.sql / security.sql.
-- ---------------------------------------------------------------------------
alter table public."ColumnDef"      enable row level security;
alter table public."ScratchDataset" enable row level security;
alter table public."PersonScratch"  enable row level security;
revoke all on public."ColumnDef"      from anon, authenticated;
revoke all on public."ScratchDataset" from anon, authenticated;
revoke all on public."PersonScratch"  from anon, authenticated;
grant all privileges on public."ColumnDef"      to service_role;
grant all privileges on public."ScratchDataset" to service_role;
grant all privileges on public."PersonScratch"  to service_role;
