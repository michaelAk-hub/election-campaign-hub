-- Per-account control of which live Person fields a Chreosi operator sees in
-- their portal. Empty array => fall back to the historical fixed layout, so
-- existing accounts are unaffected until an admin customizes them.
alter table public."ChreosiAccount"
  add column if not exists "visible_fields" jsonb default '[]'::jsonb;
