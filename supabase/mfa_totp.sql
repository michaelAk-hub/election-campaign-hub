-- ===========================================================================
-- Per-user MFA method for admin/organotikos accounts.
-- 'sms'  → Twilio Verify SMS (default, unchanged)
-- 'totp' → authenticator app (verified locally, no Twilio, no SMS cost)
-- Additive/safe: run once against the live DB. Existing users default to 'sms'.
-- ===========================================================================
alter table public."AppUser" add column if not exists "mfa_method"    text not null default 'sms';
alter table public."AppUser" add column if not exists "totp_secret"    text;
alter table public."AppUser" add column if not exists "totp_enrolled"  boolean not null default false;
