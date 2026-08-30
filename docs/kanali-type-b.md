# Kanali Τύπος B — fuzzy voter identification

Type A is a check-in station: an operator types a voter's unique number
(`monadikos_kanali`) and the system marks that person `voted = true`.

Type B is for when the operator does **not** have the unique number. They fill in
a configurable form of Person fields (name, father's name, town, …). Those
submissions are collected and later an admin/organotikos matches each one against
the live table — hard filters narrow the candidates, fuzzy matching ranks the
survivors with a confidence percentage — and marks the chosen person voted.

## Data model

- **`KanaliBFormField`** — the one shared form (global, not per-account). One row
  per field: `field_key` (Person column), `label`, `input_type`
  (text/number/date/dropdown/yesno), `required`, `weight` (priority, shareable),
  `match_role` (`hard` | `fuzzy`), `options` (dropdown snapshot), `sort_order`.
- **`KanaliBSubmission`** — one row per portal submission: `kanali_username`,
  `values` (jsonb `{field_key: value}`), `status` (`pending` | `done`),
  `matched_person_id`, `resolved_by`, `resolved_at`.

Migration: `supabase/kanali_type_b.sql` (also folded into `schema.sql`).

## Matching (planned, phase 4)

1. **Hard filters first** — exact match after Greek normalization (accents off,
   uppercased, ς→σ) on every filled `hard` field → narrows candidates.
2. **Fuzzy on the survivors** — for each filled `fuzzy` field: Greek phonetic fold
   (ω→ο, η/υ/ει/οι→ι, αι→ε …) then a typo-tolerant similarity in [0,1].
3. **Percentage** = Σ(weight × similarity) ÷ Σ(weight) over the filled fuzzy
   fields (hard filters don't add to the %, they gate).
4. Show all ≥ 50%, sorted high→low; if none clear the bar, show the closest few.
5. Each candidate shows match %, key fields, and current `voted` status; a
   "Καταχώρηση Ψήφου" button marks it voted with the same atomic guard as Type A,
   then flips the submission to `done`.

## Edge Functions

- `kanaliBFormGet` — return the shared form (admin **or** Type B portal session).
- `kanaliBFormSave` — replace the form (admin/organotiki).
- `submitKanaliBForm` — portal operator submits the filled form (phase 2).
- `kanaliBListSubmissions` — list submissions for the NotFoundVoters page (phase 3).
- `kanaliBFindMatches` — ranked candidates for one submission (phase 4).
- `kanaliBResolve` — mark a candidate voted + submission done (phase 4).

## UI

- **KanaliAccounts → "Φόρμα Τύπου B"** opens the shared form builder
  (`KanaliBFormDialog`). Editable anytime.
- **Portal** renders the form for Type B operators (phase 2).
- **NotFoundVoters page** gets a second, collapsible section for Type B
  submissions, separate from the Type A "not found" list (phase 3–4).

## Build phases

1. **DB + form builder** ✅
2. Portal form + submissions storage
3. NotFoundVoters two-section UI + listing
4. Matcher + candidate dialog + mark-voted
