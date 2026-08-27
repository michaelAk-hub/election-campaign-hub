# Design: Scratch Tables + Shared Schema / Design View

**Status:** In progress.
**Recommended timing:** Build **after Oct 1** (post-election). Purely additive — nothing
here changes the running system, so it can wait until there is breathing room.

**Build progress:**
- [x] **Step 1 (foundation):** `ColumnDef` / `ScratchDataset` / `PersonScratch` tables +
  seeded shared schema — `supabase/scratch_schema.sql` (run once) and mirrored into
  `schema.sql`. Added to `entityGateway` allowlist. _Additive; live path untouched._
- [x] **Step 2+3 (usable slice) — tested & confirmed working end-to-end
  (create→import→edit→export→delete):** tab strip in Records (live ★ + scratch tabs + New);
  self-contained `ScratchTableView` (columns from the `ColumnDef` registry, inline edit,
  total footer); Edge Functions `scratchGridFetch`, `scratchGridUpdateCell`,
  `importScratchJob`, `exportScratchJob` (inline .xlsx, matches live format),
  `scratchDatasetDelete`. Live grid only renders on the ★ tab. _Basic import (auto
  header-map, unknown cols → custom_data); the map-on-import UI and typed editing come
  with Step 4._
- [~] **Step 4 (in progress):**
  - [x] `schemaAdmin` Edge Function (list/addField/updateField/validateType/
    countFieldData/deleteField/reorder) — mandatory fields protected, type-change
    validated (blocks + reports offending rows), delete clears custom_data across
    Person + PersonScratch.
  - [x] Design View dialog (`SchemaDesignDialog`) — reachable from Records ("Σχεδίαση"):
    add/edit-label/retype/delete/reorder fields; locked mandatory rows; destructive-delete
    confirm ("erases N rows"); type-change block dialog with offending rows + force.
  - [x] Typed cell editors in the scratch grid (number/date/select/boolean checkbox).
  - [x] **Per-table schemas** (`table_key` on `ColumnDef`; `scratch_schema_v2.sql`):
    scratch tables have no mandatory fields; import defines a table's columns from its
    headers; the Design View opens for the currently-selected tab; delete-scratch-table
    removes its column defs.
  - [x] Map-on-import step — two-phase scratch import (`importScratchJob` `preview`
    returns headers + auto-map suggestions; `ImportMappingDialog` maps each file column
    to an existing column / new field / skip; import applies the mapping and appends new
    columns after existing ones).
  - [ ] Wire the LIVE grid to render registry-defined custom fields (currently the
    Design View governs scratch tables fully; the live grid still uses its fixed columns).
- [ ] Step 5 (later): `mergeScratchToLive`

This document captures a design agreed in discussion. It is the reference to pick up
from when implementation starts. No code has been written for it yet.

---

## 1. Goal

Let the Records page hold **multiple voter tables** you can switch between and edit like
MS Access:

- **One live table** (`Person`) — the roll every other part of the system reads
  (predictions, χρεωστικά, saved queries, portal, SMS).
- **One or more scratch tables** — independent staging tables you edit freely. Nothing
  in the system reads them. The live roll is eventually **built by merging** some or all
  scratch tables.

Plus a **Design View** (MS-Access-style) to define the columns and their types once, for
all tables, so column changes never break the system again.

---

## 2. Why this is safe to build (isolation)

Audited on 2026-08-26:

| System function | Scoped to active roll? | Notes |
|---|---|---|
| Predictions (all) | ✅ Yes | `getActiveDatasetId` + `getActivePersons` |
| Χρεωστικά (analyze, lists, print, portal, merge) | ❌ No | `fetchAll("Person")` unscoped |
| Saved Queries (Εκτέλεση) | ❌ No | frontend `base44.entities.Person.list(...)` — all rows |

Because χρεωστικά and queries scan **all** `Person` rows, scratch data must **not** live in
`Person`. Putting scratch rows in a **separate physical table** makes isolation structural:
no existing or future function can accidentally read scratch data, with no per-feature
auditing required.

---

## 3. Data model

### 3.1 Live table
- `Person` — unchanged. Real Postgres columns for mandatory fields; `custom_data` (JSONB)
  for non-mandatory fields (this pattern already exists in the code today).

### 3.2 Scratch store
- `PersonScratch` — mirrors `Person`'s shape (same mandatory columns + `custom_data`),
  plus `scratch_dataset_id`. Holds the rows of **all** scratch tables, partitioned by
  `scratch_dataset_id`.
- `ScratchDataset` — registry driving the tabs: `id`, `name`, `row_count`, `created_by`,
  `created_at`, `updated_at`. Server-side, so **all admins see the same tabs and they
  survive logout**.

### 3.3 Per-table schema registry
> **REVISION (2026-08-27):** schemas are now **per-table**, not one shared schema.
> `ColumnDef` has a `table_key`: `'live'` for the live roll, or a scratch dataset id for a
> scratch table. **Scratch tables have NO mandatory fields** — they're free-form: their
> columns are created from the import (in file order), and the per-table Design View can
> add/rename/retype/delete any of them. Mandatory fields exist only on `'live'`. Uniqueness
> is per `(table_key, key)`. Schema reconciliation between a scratch table and the live roll
> is deferred to a **mapping popup at merge time** (§8).

- `ColumnDef` — one row per field **per table** (`table_key` + `key`):
  - `key` (stable internal name), `label` (display), `type`
    (`text | number | date | boolean | select`), `mandatory` (bool),
    `physical` (bool — true = backed by a real column, i.e. the seeded fields;
    false = stored in `custom_data`), `sort_order` (int), `options` (array, for
    `select`).
  - Mandatory rows are **code-owned** — the authoritative list is a constant in the code
    (the fields functions depend on). The Design View shows them **locked** (no delete,
    no rename, no retype). Adding a new function that depends on a field ⇒ add that field
    to the mandatory constant.
  - Non-mandatory rows are user-managed and stored in each row's `custom_data`.

**One shared schema** (not per-table) was chosen so scratch→live merge is trivial: all
tables already have identical columns.

---

## 4. Design View (the schema editor)

MS-Access-style list of fields: name, type dropdown, mandatory flag, options, order.

- **Mandatory fields**: shown locked/greyed — cannot delete, rename, or retype.
- **Non-mandatory fields**: add / edit / remove / reorder.
- **Adding a field**: new key in `ColumnDef`; no `ALTER TABLE` (it lives in `custom_data`).
  Never risks the live system.
- **Deleting a non-mandatory field** *(destructive)*: requires an explicit confirm that
  states the impact — **"this will erase «Field» in N rows"** — then removes that key from
  every affected row's `custom_data`.
- **Changing a field's type** *(guarded)*: **validate before applying.** If any existing
  value does not convert to the new type, **block the change** and **show the offending
  rows** so the user can fix them first. Never silently coerce/mangle data.

---

## 5. Scratch table operations

Scratch tables have the **same** import / export / delete functionality as the live table,
and **the same permissions** — any admin who can edit the live table can do all of this to
scratch tables.

- **Import** → new `importScratchJob` (≈90% reuse of `importPersonsJob`), writing into a
  new `ScratchDataset` + its `PersonScratch` rows.
  - **Map-on-import step**: user maps the file's columns onto `ColumnDef` fields, with a
    one-click **"create this as a new field"** for unmatched columns (adds a non-mandatory
    field to the shared schema, then maps to it). Chosen over auto-creating stray columns.
- **Export** → scratch variant of `exportPersonsJob`. **Matches the live export exactly**:
  same `.xlsx` output via `buildXlsx` / `EXPORT_COLUMNS` in
  `supabase/functions/_shared/personIO.ts` (Greek labels, `voted` rendered ΝΑΙ/ΟΧΙ).
  Non-mandatory user fields append after the standard columns.
- **Delete** → scratch variant of `deleteDataset` (drops one `ScratchDataset` + its rows).

---

## 6. Grid / UI changes

- **Tab strip** above the grid: `[ Live roll ★ ] [ Import A ] [ Import B ] …`
  (star/badge marks the live/active roll).
- Selecting a tab points the same grid at either the live functions (`personGrid*`) or new
  scratch functions (`scratchGridFetch` / `scratchGridUpdateCell`, scoped by
  `scratch_dataset_id`). Columns, inline editing, total-count footer, search all reused.
- Remember the selected tab in component state.

---

## 7. Concurrency

Multiple admins can edit the same scratch table simultaneously. Consistency model is the
same as the live grid today:

- Edits go through Edge Functions → Postgres.
- **Row-version optimistic locking** prevents two admins silently clobbering the **same**
  cell.
- Edits are **eventually consistent, not live-collaborative** — others' changes appear on
  the next refresh/refetch (polling), not in real time. True live cursors are out of scope.

---

## 8. Merge scratch → live (later phase)

`mergeScratchToLive`: pick some/all scratch datasets → copy their rows into `Person` as a
new `Dataset` → dedupe → activate. **First step is a mapping popup** where the user matches
each scratch table's columns to the live roll's fields (since schemas are now per-table and
need not line up). **Scratch tables are NOT consumed** by the merge — they continue to exist
as their own copies. **Deferred** — the import/edit half stands alone; build merge when the
roll is actually being assembled.

---

## 9. Permissions

Any admin who can edit the live table can create / import / export / delete / edit scratch
tables and edit the shared schema. (No separate restricted role, per decision.)

---

## 10. Suggested build sequence

1. `ColumnDef` registry + mandatory-fields constant; make the **live grid** read its
   columns from the registry (no behavior change — just sources columns from data).
2. `PersonScratch` + `ScratchDataset` tables (RLS deny-all like everything else).
3. `scratchGridFetch` / `scratchGridUpdateCell`; **tab strip** in Records.
4. `importScratchJob` + **map-on-import** UI; scratch export + delete.
5. **Design View** UI (add/edit/remove non-mandatory fields; destructive-delete confirm;
   type-change validation with offending-row report).
6. *(Later)* `mergeScratchToLive`.

Each step is additive and independently shippable.

---

## 11. Field types (confirmed)

The Design View exposes this set first: **`text` / `number` / `date` / `boolean` / `select`**.
(`boolean` renders as a checkbox like `voted`; `select` carries an `options` array.)

---

## 12. Mandatory-fields constant (authoritative, audited 2026-08-26)

These fields are referenced **by name in code logic** (Edge Functions and/or frontend
pages), or are structural. They are the **locked** rows in the Design View — cannot be
deleted, renamed, or retyped. Source of truth is `KNOWN_FIELDS` /
`EXPORT_COLUMNS` in `_shared/personIO.ts` plus the usages audited below.

**Structural (never removable):**
| Field | Type | Why |
|---|---|---|
| `id` | (pk) | primary key |
| `dataset_id` | text | dataset scoping / partitioning |
| `row_version` | number | optimistic-locking on concurrent edits |
| `custom_data` | (jsonb) | storage for all non-mandatory fields |
| `created_date` | date | default grid sort |

**Referenced in logic (mandatory):**
| Field | Type | Used by |
|---|---|---|
| `person_id` | text | identity (ΑΤ) — grid, export, lookups |
| `first_name` | text | display, χρεωστικά, κανάλι, portal |
| `last_name` | text | display, χρεωστικά, κανάλι, portal |
| `voted` | boolean | predictions, KPIs, vote-flow, κανάλι |
| `voted_at` | date | prediction vote-flow timing |
| `prediction_symbol` | text/select | predictions by symbol |
| `monadikos_kanali` | text | κανάλι vote lookup (`submitKanaliVote`) |
| `academic_level` | select | partition (postgrad/undergrad/unknown) |
| `admission_year` | number | predictions by year (heaviest-referenced field) |
| `department` | text | χρεωστικά / prediction grouping |
| `ucid` | text | identity / lookup |
| `member` | text/boolean | χρεωστικά / κανάλι |
| `notes` | text | portal actions write here |
| `contact_person_1` | text | χρεωστικά contact |
| `contact_person_2` | text | χρεωστικά contact |
| `mobile_phone` | text | SMS / contact |

**Seeded NON-mandatory fields** (exist today as physical columns + export mappings, but no
code logic references them — so they are user-editable/removable):
`direction` (ΚΑΤ), `X`, `F26_1`, `F25`, `phone`, `T24`, `F24`, `F23`, `T22`, `details`
(ΠΑΡΑΤΗΡΗΣΕΙΣ), `father_n`, `father_name`, `ElectoralDistrict`, `ElectoralTown`,
`RelatedMember`.

> **Build-time note:** these seeded non-mandatory fields are currently *physical* columns.
> When one is deleted via the Design View, either drop the physical column or stop
> surfacing it (and remove its `EXPORT_COLUMNS` entry). New non-mandatory fields added later
> live in `custom_data`, never as physical columns.
>
> **Maintenance rule:** whenever a new function starts depending on a field, add that field
> to this constant (promote it from non-mandatory to mandatory) so the Design View locks it.

---

## 13. Open items

_All prior open items resolved (§11, §12, and §5 export format). Nothing outstanding —
ready to implement when scheduled (post-Oct 1)._
