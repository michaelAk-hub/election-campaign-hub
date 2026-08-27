-- ============================================================================
-- Election Campaign Hub — Postgres schema (Supabase)
-- Generated from base44/entities/*.jsonc for the Base44 -> Supabase migration.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).
--
-- CONVENTIONS:
--   * Table and column names match Base44 EXACTLY and are quoted, so the data
--     export imports 1:1 and the ported functions need minimal edits.
--   * "id" is TEXT so existing Base44 IDs (and all cross-references that point
--     at them) are preserved on import. New rows get a uuid.
--   * Every table has the Base44 standard columns: id, created_date,
--     updated_date, created_by.
--   * Columns are nullable (defaults only) so the bulk import never fails on an
--     empty value. "required" is still enforced by the application layer.
--
-- DROPPED (dead — no code references them): MonitorSource, MonitorSetting,
--   MonitorLog, User.
--
-- CREATED but you do NOT need to import old rows (transient / derived):
--   AppSession, PortalSession, MfaChallenge, ImportJob, ExportJob, DeleteJob,
--   ChreosiCreateJob, PredictionStatsOverall, PredictionStatsBySymbol,
--   PredictionStatsByYearSymbol, PredictionFilterCache, PredictionRebuildLock.
-- ============================================================================

create extension if not exists pgcrypto;

-- Auto-update "updated_date" on every UPDATE (attached to all tables at the end).
create or replace function public.set_updated_date()
returns trigger as $$
begin
  new."updated_date" = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Auth / session
-- ---------------------------------------------------------------------------
create table if not exists public."AppUser" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "role" text,
  "email" text,
  "password_hash" text,
  "name" text,
  "surname" text,
  "phone" text,
  "is_active" boolean default false,
  "password_changed_at" timestamptz,
  "session_version" integer default 1,
  "created_by_admin_id" text,
  "mfa_method" text not null default 'sms',
  "totp_secret" text,
  "totp_enrolled" boolean not null default false
);
create unique index if not exists "ux_AppUser_email_lower" on public."AppUser" (lower("email"));

create table if not exists public."AppSession" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "session_token" text,
  "app_user_id" text,
  "session_version_at_login" integer,
  "expires_at" timestamptz,
  "is_active" boolean default true,
  "last_seen_at" timestamptz
);
create index if not exists "ix_AppSession_token" on public."AppSession" ("session_token");
create index if not exists "ix_AppSession_user_active" on public."AppSession" ("app_user_id", "is_active");

create table if not exists public."PortalSession" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "session_token" text,
  "username" text,
  "portal_type" text,
  "kanali_type" text,
  "expires_at" timestamptz,
  "is_active" boolean default true
);
create index if not exists "ix_PortalSession_token" on public."PortalSession" ("session_token");
create index if not exists "ix_PortalSession_lookup" on public."PortalSession" ("username", "portal_type", "is_active");

create table if not exists public."MfaChallenge" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "user_id" text,
  "preauth_token" text,
  "expires_at" timestamptz,
  "is_used" boolean default false,
  "send_count" integer default 0,
  "last_send_at" timestamptz,
  "attempts" integer default 0
);
create index if not exists "ix_MfaChallenge_token" on public."MfaChallenge" ("preauth_token");

-- ---------------------------------------------------------------------------
-- Field-operator accounts (Chreosi / Kanali)
-- ---------------------------------------------------------------------------
create table if not exists public."ChreosiAccount" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "username" text,
  "password_hash" text,
  "plain_password" text,
  "display_name" text,
  "phone" text,
  "is_active" boolean default true,
  "allowed_prediction_symbols" jsonb default '[]'::jsonb,
  "allowed_voted_statuses" jsonb default '[]'::jsonb,
  "personal_note" text default ''
);
create index if not exists "ix_ChreosiAccount_username_lower" on public."ChreosiAccount" (lower("username"));
create index if not exists "ix_ChreosiAccount_active" on public."ChreosiAccount" ("is_active");

create table if not exists public."KanaliAccount" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "username" text,
  "password_hash" text,
  "plain_password" text,
  "user_type" text default 'A',
  "is_active" boolean default true
);
create index if not exists "ix_KanaliAccount_username_lower" on public."KanaliAccount" (lower("username"));

create table if not exists public."ChreosiCheckmark" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "chreosi_username" text,
  "person_record_id" text,
  "checked" boolean default false
);
create index if not exists "ix_ChreosiCheckmark_user" on public."ChreosiCheckmark" ("chreosi_username");
create index if not exists "ix_ChreosiCheckmark_person" on public."ChreosiCheckmark" ("person_record_id");

create table if not exists public."ChreosiCreateJob" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "status" text default 'pending',
  "total" integer default 0,
  "processed" integer default 0,
  "created_count" integer default 0,
  "updated_count" integer default 0,
  "skipped_count" integer default 0,
  "failed_count" integer default 0,
  "contacts_json" text,
  "results_json" text,
  "settings_json" text,
  "error" text,
  "started_by" text
);

-- ---------------------------------------------------------------------------
-- Electoral roll
-- ---------------------------------------------------------------------------
create table if not exists public."Dataset" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "status" text default 'pending',
  "source_file_url" text,
  "field_mappings" jsonb,
  "custom_fields" jsonb,
  "total_records" integer default 0,
  "activated_at" timestamptz
);
create index if not exists "ix_Dataset_status" on public."Dataset" ("status");

create table if not exists public."Person" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
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
create index if not exists "ix_Person_dataset" on public."Person" ("dataset_id");
create index if not exists "ix_Person_dataset_voted" on public."Person" ("dataset_id", "voted");
create index if not exists "ix_Person_dataset_level" on public."Person" ("dataset_id", "academic_level");
create index if not exists "ix_Person_voted_at" on public."Person" ("voted_at");
create index if not exists "ix_Person_symbol" on public."Person" ("prediction_symbol");
create index if not exists "ix_Person_year" on public."Person" ("admission_year");
create index if not exists "ix_Person_department" on public."Person" ("department");
create index if not exists "ix_Person_cp1" on public."Person" ("contact_person_1");
create index if not exists "ix_Person_cp2" on public."Person" ("contact_person_2");
create index if not exists "ix_Person_monadikos" on public."Person" ("monadikos_kanali");
create index if not exists "ix_Person_person_id" on public."Person" ("person_id");

-- ---------------------------------------------------------------------------
-- Import / export / delete jobs
-- ---------------------------------------------------------------------------
create table if not exists public."ImportJob" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "status" text default 'pending',
  "total" integer default 0,
  "processed" integer default 0,
  "message" text,
  "error" text,
  "dataset_id" text,
  "dataset_name" text,
  "file_url" text,
  "last_heartbeat_at" timestamptz,
  "failed_rows" jsonb
);

create table if not exists public."ExportJob" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "status" text default 'pending',
  "total" integer default 0,
  "processed" integer default 0,
  "message" text,
  "error" text,
  "dataset_id" text,
  "dataset_name" text,
  "file_url" text,
  "last_heartbeat_at" timestamptz,
  "partition" text,
  "filters" jsonb,
  "sort_field" text,
  "sort_direction" text,
  "search" text,
  "chunk_urls" jsonb
);

create table if not exists public."DeleteJob" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "job_type" text,
  "status" text default 'pending',
  "total" integer default 0,
  "deleted" integer default 0,
  "message" text,
  "error" text,
  "dataset_id" text,
  "last_heartbeat_at" timestamptz
);

-- ---------------------------------------------------------------------------
-- Kanali channel voting audit
-- ---------------------------------------------------------------------------
create table if not exists public."KanaliSubmission" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "kanali_username" text,
  "submitted_id" text,
  "status" text,
  "reason_text" text,
  "person_record_id" text
);
create index if not exists "ix_KanaliSubmission_submitted" on public."KanaliSubmission" ("submitted_id");
create index if not exists "ix_KanaliSubmission_user" on public."KanaliSubmission" ("kanali_username");

create table if not exists public."NotFoundVoter" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "submitted_id" text,
  "reason_text" text,
  "kanali_username" text
);
create index if not exists "ix_NotFoundVoter_submitted" on public."NotFoundVoter" ("submitted_id");

-- ---------------------------------------------------------------------------
-- Notifications / push messages
-- ---------------------------------------------------------------------------
create table if not exists public."Notification" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "recipient_type" text,
  "recipient_username" text,
  "type" text default 'info',
  "category" text default 'general',
  "title" text,
  "message" text,
  "read" boolean default false,
  "read_at" timestamptz,
  "sender_email" text,
  "is_active" boolean default true,
  "expires_at" timestamptz,
  "disabled_at" timestamptz,
  "disabled_by" text,
  "send_batch_id" text
);
create index if not exists "ix_Notification_recipient_type" on public."Notification" ("recipient_type");
create index if not exists "ix_Notification_recipient_user" on public."Notification" ("recipient_username");

create table if not exists public."NotificationPreference" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "user_email" text,
  "portal_username" text,
  "password_changes" boolean default true,
  "account_updates" boolean default true,
  "system_messages" boolean default true,
  "data_changes" boolean default false
);

create table if not exists public."PushMessage" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "title" text,
  "body" text,
  "target_group" text,
  "delivery_mode" text default 'group',
  "target_user_keys" jsonb default '[]'::jsonb,
  "sender_email" text,
  "is_active" boolean default true,
  "total_recipients" integer default 0,
  "acknowledged_count" integer default 0,
  "expires_at" timestamptz,
  "disabled_at" timestamptz,
  "disabled_by" text,
  "send_batch_id" text
);
create index if not exists "ix_PushMessage_active" on public."PushMessage" ("is_active");

create table if not exists public."PushMessageAck" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "message_id" text,
  "recipient_type" text,
  "username" text,
  "acknowledged_at" timestamptz
);
create index if not exists "ix_PushMessageAck_lookup" on public."PushMessageAck" ("message_id", "username", "recipient_type");

-- ---------------------------------------------------------------------------
-- SMS
-- ---------------------------------------------------------------------------
create table if not exists public."SmsLog" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "category" text,
  "title" text,
  "to_phone" text,
  "to_username" text,
  "message_preview" text,
  "provider" text default 'vonage',
  "provider_message_id" text,
  "status" text,
  "error" text,
  "sent_by_user_id" text
);

create table if not exists public."SmsPhoneGroup" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "description" text,
  "is_active" boolean default true,
  "member_count" integer default 0
);

create table if not exists public."SmsPhoneGroupMember" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "group_id" text,
  "raw_phone" text,
  "normalized_phone" text,
  "display_name" text,
  "is_active" boolean default true
);
create index if not exists "ix_SmsPhoneGroupMember_group" on public."SmsPhoneGroupMember" ("group_id");

-- ---------------------------------------------------------------------------
-- Saved queries / grid prefs / audit
-- ---------------------------------------------------------------------------
create table if not exists public."SavedQuery" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "description" text,
  "filters" jsonb,
  "columns" jsonb,
  "sort_field" text,
  "sort_direction" text,
  "logicalExpression" text,
  "conditions" jsonb,
  "rule_tree" jsonb,
  "print_settings" jsonb
);

create table if not exists public."GridPreference" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "user_email" text,
  "grid_key" text,
  "state_json" jsonb
);
create index if not exists "ix_GridPreference_lookup" on public."GridPreference" ("user_email", "grid_key");

create table if not exists public."UserActivationLog" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "actor_user_id" text,
  "actor_role" text,
  "target_user_id" text,
  "target_role" text,
  "old_status" boolean,
  "new_status" boolean,
  "action_type" text,
  "timestamp" timestamptz
);

-- ---------------------------------------------------------------------------
-- Predictions (config + derived caches)
-- ---------------------------------------------------------------------------
create table if not exists public."PredictionScenario" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "total_seats" numeric,
  "display_order" integer default 1,
  "is_active" boolean default true,
  "config_json" jsonb
);
create index if not exists "ix_PredictionScenario_order" on public."PredictionScenario" ("display_order");

create table if not exists public."PredictionVoteFlowConfig" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "dataset_id" text,
  "is_enabled" boolean default false,
  "bucket_minutes" integer default 5,
  "mapping_json" jsonb,
  "updated_by_user_id" text,
  "updated_by_name" text,
  "updated_at" timestamptz
);
create index if not exists "ix_VoteFlowConfig_dataset" on public."PredictionVoteFlowConfig" ("dataset_id");

create table if not exists public."PredictionFilterCache" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "dataset_id" text,
  "years_json" jsonb,
  "symbols_json" jsonb,
  "departments_json" jsonb,
  "updated_at" timestamptz
);
create index if not exists "ix_FilterCache_dataset" on public."PredictionFilterCache" ("dataset_id");

create table if not exists public."PredictionRebuildLock" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "lock_key" text,
  "locked_at" timestamptz,
  "lock_version" integer default 1
);
create index if not exists "ix_RebuildLock_key" on public."PredictionRebuildLock" ("lock_key");

create table if not exists public."PredictionStatsOverall" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "dataset_id" text,
  "total" integer default 0,
  "voted_yes" integer default 0,
  "voted_no" integer default 0,
  "updated_at" timestamptz
);
create index if not exists "ix_StatsOverall_dataset" on public."PredictionStatsOverall" ("dataset_id");

create table if not exists public."PredictionStatsBySymbol" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "dataset_id" text,
  "symbol" text,
  "total" integer default 0,
  "voted_yes" integer default 0,
  "voted_no" integer default 0,
  "updated_at" timestamptz
);
create index if not exists "ix_StatsBySymbol_dataset" on public."PredictionStatsBySymbol" ("dataset_id");

create table if not exists public."PredictionStatsByYearSymbol" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "dataset_id" text,
  "admission_year" text,
  "symbol" text,
  "total" integer default 0,
  "voted_yes" integer default 0,
  "voted_no" integer default 0,
  "updated_at" timestamptz
);
create index if not exists "ix_StatsByYearSymbol_dataset" on public."PredictionStatsByYearSymbol" ("dataset_id");

-- ---------------------------------------------------------------------------
-- Login rate-limiting (brute-force defense) — see login_throttle.sql.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Scratch tables + shared-schema registry (see docs/scratch-tables-and-
-- schema-design.md and scratch_schema.sql, which also seeds ColumnDef).
-- ---------------------------------------------------------------------------
create table if not exists public."ColumnDef" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "table_key" text not null default 'live',  -- 'live' or a scratch dataset id
  "key" text not null,
  "label" text,
  "type" text not null default 'text',
  "mandatory" boolean not null default false,
  "physical" boolean not null default false,
  "sort_order" integer not null default 0,
  "options" jsonb
);
create unique index if not exists "ux_ColumnDef_table_key" on public."ColumnDef" ("table_key", "key");
create index if not exists "ix_ColumnDef_table" on public."ColumnDef" ("table_key");
create index if not exists "ix_ColumnDef_order" on public."ColumnDef" ("sort_order");

create table if not exists public."ScratchDataset" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "created_by" text,
  "name" text,
  "status" text default 'active',
  "total_records" integer default 0
);

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
-- Attach updated_date trigger to every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'AppUser','AppSession','PortalSession','MfaChallenge','LoginThrottle',
    'ChreosiAccount','KanaliAccount','ChreosiCheckmark','ChreosiCreateJob',
    'Dataset','Person','ImportJob','ExportJob','DeleteJob',
    'KanaliSubmission','NotFoundVoter',
    'Notification','NotificationPreference','PushMessage','PushMessageAck',
    'SmsLog','SmsPhoneGroup','SmsPhoneGroupMember',
    'SavedQuery','GridPreference','UserActivationLog',
    'PredictionScenario','PredictionVoteFlowConfig','PredictionFilterCache',
    'PredictionRebuildLock','PredictionStatsOverall','PredictionStatsBySymbol',
    'PredictionStatsByYearSymbol',
    'ColumnDef','ScratchDataset','PersonScratch'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists "trg_updated_%1$s" on public.%2$I;', t, t);
    execute format('create trigger "trg_updated_%1$s" before update on public.%2$I for each row execute function public.set_updated_date();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: the Edge Functions connect with the service_role key, which needs
-- table privileges (RLS is separately bypassed by service_role). anon and
-- authenticated are intentionally NOT granted — the browser never queries
-- tables directly; everything goes through Edge Functions.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security: enable on every table with NO policies (deny-all for
-- anon/authenticated; service_role bypasses RLS). This closes the public Data
-- API against voter PII, password_hash and plain_password. See security.sql,
-- which carries the same statements for running against an existing database.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Done. 32 tables created.
