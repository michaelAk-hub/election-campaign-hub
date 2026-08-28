-- Which table a saved query runs against: 'live' or a scratch dataset id.
-- Additive/safe: existing queries default to 'live' (current behavior). Run once.
alter table public."SavedQuery" add column if not exists "table_key" text not null default 'live';
