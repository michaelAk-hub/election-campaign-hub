-- ===========================================================================
-- Per-table schemas (revision of the shared-schema model).
-- See docs/scratch-tables-and-schema-design.md.
--
-- ColumnDef now belongs to ONE table via `table_key`:
--   'live'            → the live roll (keeps the mandatory + optional fields)
--   <scratch id>      → a specific scratch table (free-form, no mandatory fields)
--
-- Additive/safe: adds a column (existing rows backfill to 'live') and swaps the
-- global unique(key) for unique(table_key, key). Run once against the live DB.
-- ===========================================================================

alter table public."ColumnDef" add column if not exists "table_key" text not null default 'live';

-- The original table created "key" as globally unique; per-table schemas need
-- the key to be unique only within a table. Drop the old unique, add the new one.
alter table public."ColumnDef" drop constraint if exists "ColumnDef_key_key";
create unique index if not exists "ux_ColumnDef_table_key" on public."ColumnDef" ("table_key", "key");
create index if not exists "ix_ColumnDef_table" on public."ColumnDef" ("table_key");

-- Existing seeded rows describe the live roll.
update public."ColumnDef" set "table_key" = 'live' where "table_key" is null;
