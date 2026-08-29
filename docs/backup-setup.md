# Backups to Google Drive — setup

The `backupToDrive` Edge Function exports the live roll and the scratch tables
as Greek-safe **CSV** files (one per table) and uploads them to your Google Drive
under:

```
backup / <YYYY-MM> / <YYYY-MM-DD> / Person.csv
                                    Dataset.csv
                                    PersonScratch.csv
                                    ScratchDataset.csv
                                    ColumnDef.csv
```

CSV (not .xlsx) is used because the backup runs on the server — including the
headless daily job — and building a large .xlsx server-side exceeds the Edge
Function's limits. CSV is built with plain string concatenation, so it stays
within limits at any table size. A UTF-8 BOM keeps Greek intact and the files
open directly in Excel (double-click).

- **Manual:** UserManagement → **Backup** button (ADMIN only).
- **Automatic:** the `Daily Backup to Google Drive` GitHub Action runs once a day.

Backs up only the live roll and the scratch tables, per request (this also keeps
the job well within the Edge Function limits). Nested values like `custom_data`
are stored as JSON text in a single cell, so nothing is lost.

---

## One-time setup (~10 minutes)

### 1. Google Cloud project + Drive API
1. Go to <https://console.cloud.google.com/> → create a project (any name).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → choose **External** →
   fill the required name/email → **Add users** → add your own Gmail as a
   **test user** → Save. (No verification needed for personal use.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application** → under **Authorized redirect URIs** add
   `https://developers.google.com/oauthplayground` → Create.
   Copy the **Client ID** and **Client secret**.

### 2. Get a refresh token (OAuth Playground)
1. Open <https://developers.google.com/oauthplayground/>.
2. Click the **⚙ gear** (top right) → tick **Use your own OAuth credentials** →
   paste your Client ID and Client secret.
3. In the left **“Input your own scopes”** box, enter:
   `https://www.googleapis.com/auth/drive.file`
   → click **Authorize APIs** → sign in with your Gmail → allow.
   (`drive.file` = the app can only touch files it creates — least privilege.)
4. Click **Exchange authorization code for tokens**.
5. Copy the **Refresh token** value.

### 3. Add Supabase secrets
Supabase dashboard → your project → **Edge Functions → Secrets** → add:

| Secret | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `GOOGLE_REFRESH_TOKEN` | from step 2 |
| `BACKUP_CRON_SECRET` | any long random string you invent |
| `GOOGLE_DRIVE_ROOT` | *(optional)* a Drive folder ID to put `backup/` inside; omit for “My Drive” root |

### 4. Add the GitHub secret (for the daily run)
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `BACKUP_CRON_SECRET` | **the same** random string as in Supabase |

That’s it. The anon key and project URL are already in the workflow (both are public).

---

## Test it
1. After deploying, open **UserManagement** → click **Backup**.
2. You should get a toast like *“Αντίγραφο ασφαλείας ολοκληρώθηκε: N πίνακες → backup/2026-08/2026-08-27”*.
3. Check your Google Drive → `backup/2026-08/2026-08-27/` → the `.csv` files.
4. To test the schedule immediately: GitHub → **Actions → Daily Backup → Run workflow**.

## Notes
- Running a backup twice on the same day overwrites nothing new is added beyond
  fresh copies; Drive keeps duplicate-named files if any — harmless.
- To restore a table: the per-table `.csv` opens directly in Excel and can be
  re-imported (scratch import for a working copy, then merge to live; JSON-text
  cells like `custom_data` can be re-expanded if needed).
- The daily time is 01:00 UTC; change the `cron:` line in
  `.github/workflows/daily-backup.yml` to adjust.
