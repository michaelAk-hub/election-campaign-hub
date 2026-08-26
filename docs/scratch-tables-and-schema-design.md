# Design: Scratch Tables + Shared Schema / Design View

**Status:** Approved design, not yet built.
**Recommended timing:** Build **after Oct 1** (post-election). Purely additive — nothing
here changes the running system, so it can wait until there is breathing room.

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

### 3.3 Shared schema registry
- `ColumnDef` — **one shared schema for every table (live + all scratch).** One row per
  field:
  - `key` (stable internal name), `label` (display), `type`
    (`text | number | date | boolean | select`), `mandatory` (bool),
    `order` (int), `options` (array, for `select`).
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
- **Export** → scratch variant of `exportPersonsJob`, respecting the shared schema columns.
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
new `Dataset` → dedupe → activate. Trivial because the shared schema means all tables have
identical columns. **Deferred** — the import/edit half stands alone; build merge when the
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

## 11. Open items / to confirm at build time

- Exact initial contents of the **mandatory-fields constant** (enumerate every field the
  current functions reference).
- Which field types the Design View exposes first (`text/number/date/boolean/select` is the
  proposed set).
- Export format(s) for scratch (match the live export).
