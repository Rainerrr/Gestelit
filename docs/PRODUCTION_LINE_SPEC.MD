# Gestelit – Production Lines + Job Items + WIP (GOOD-only, BALANCE-based)
**Implementation Spec (for Claude Code / AI agent)**  
Version: **3.0 (Balance WIP model)**  
Date: **2026-01-08**  
Owner: Rene / Gestelit team

> This spec describes the full feature: **Production Lines**, **Job Items (no SKU)**, **WIP continuation**, **GOOD-only upstream consumption**, **scrap analytics**, **corrections that return input**, and **bottleneck detection**.  
> This version replaces *lot-based* WIP with a **balance-per-step** model while preserving core functionality.

---

## 0) Agent rules (read first)

### 0.1 Do not rebuild existing systems
Keep the project’s layering and patterns:
- **Client** `lib/api` → **API routes** `app/api` → **DB access** `lib/data` → **Postgres RPC for atomic logic**.
Keep existing session concepts:
- session lifecycle, heartbeat, takeover, forced close, recovery window, status events, checklists.
Keep existing **quantities update endpoint** concept (session totals). Extend it to call new atomic logic.

### 0.2 Authoritative worker flow
Worker flow is:
1) **Worker ID**
2) **Job**
3) **Station selection (only stations assigned to the chosen job)**
4) Start checklist (optional)
5) Work (active session: statuses, quantities)
6) End checklist (optional)
7) Complete

Important: station list is **filtered**, not “disabled”.

### 0.3 Atomicity requirement
All WIP movement and job completion math must be executed in **one atomic database function** (transaction + locks), because:
- sessions update in real time
- multiple sessions can run across different stations of the same line/job
- corrections must be safe and deterministic

---

## 1) Goals / Non-goals

### 1.1 Goals
- Define **production lines** as ordered station sequences.
- Allow admin to assign a **planned quantity** to a job item that is either:
  - a **single station** (station-defined “product”), or
  - a **production line** (line-defined “product”).
- Track live production from station sessions:
  - stations report `total_good` and `total_scrap` for their session
  - system updates job progress in real-time
- Persist **WIP (GOOD-only)** between stations and across sessions using **balances**.
- Support **corrections**:
  - decreasing reported GOOD reduces downstream WIP first (must be available)
  - decreasing GOOD reverses **originated** first (no upstream changes)
  - then reverses **pulled** by returning GOOD to upstream WIP (LIFO by consumption ledger)
  - reject reductions that would undo downstream reality
- Track scrap for analytics:
  - scrap percentage per session and per job/station can be computed later

### 1.2 Non-goals
- Scrap rework: **scrap is not usable input** and never becomes WIP.
- Per-unit serial tracking.
- Station belonging to multiple production lines (**not allowed**).
- Supervisor roles (admin only for line/job item management).

---

## 2) Definitions

- **Production line**: ordered list of stations (template).
- **Job item**: one requirement inside a job. Each job item is a distinct “product”.
  - `kind=station`: produced at a single station.
  - `kind=line`: produced across a line; **only terminal station GOOD** counts as completed.
- **WIP (Work in progress)**: GOOD inventory waiting between steps.
- **WIP balance**: the single number of GOOD units currently available after a given step.
- **Pulled GOOD**: amount of GOOD consumed from upstream WIP by a downstream station.
- **Originated GOOD**: GOOD that a station adds when upstream WIP is insufficient.
- **Terminal station**: last station in a line. Only its GOOD increments job item completion.

---

## 3) Locked business rules (must not change)

### 3.1 Scrap
- Scrap is tracked per session (`sessions.total_scrap`).
- Scrap is analytics-only:
  - never becomes input
  - never becomes WIP
  - never reduces remaining planned quantity

### 3.2 Consumption and origination
- For a station that has an upstream station (line step > 1):
  - it may consume upstream **GOOD-only** from the upstream step’s **WIP balance**.
  - if upstream GOOD is insufficient, it may still report GOOD (originated allowed).
- For step 1 (or a single-station item): no upstream consumption.

### 3.3 Job completion
- Only the terminal station’s GOOD counts toward job completion for a line job item.
- For a single-station job item, that station is terminal by definition.

### 3.4 Corrections (decrease GOOD)
When a worker reduces `total_good` for a session:
1) **First ensure the session’s step output WIP can be reduced**:
   - you cannot reduce output that has already been consumed by downstream steps.
2) reduce **originated_good** first (no upstream changes)
3) if still reducing, reverse **pulled_good** by returning GOOD to upstream WIP (LIFO by consumption ledger)
4) reject the reduction if it would reduce output below amounts already consumed downstream

---

## 4) Database changes (Postgres / Supabase)

### 4.1 Existing tables (additive changes only)

#### 4.1.1 `sessions` (add columns; keep existing totals)
Add:
- `job_item_id UUID NULL REFERENCES job_items(id)`
- `job_item_station_id UUID NULL REFERENCES job_item_stations(id)`

Keep existing:
- `total_good INTEGER DEFAULT 0`
- `total_scrap INTEGER DEFAULT 0`

Notes:
- These columns let each session be tied to a specific job item and step.
- For legacy sessions/jobs, these can remain NULL.

---

### 4.2 New tables (full column list)

#### 4.2.1 `production_lines`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| code | TEXT NULL | optional; unique if used |
| is_active | BOOLEAN NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

#### 4.2.2 `production_line_stations`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| production_line_id | UUID NOT NULL FK → production_lines.id | |
| station_id | UUID NOT NULL FK → stations.id | |
| position | INTEGER NOT NULL | 1..N |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Constraints:
- `UNIQUE(production_line_id, position)`
- `UNIQUE(production_line_id, station_id)`
- `UNIQUE(station_id)` (station belongs to only one line)

#### 4.2.3 `job_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_id | UUID NOT NULL FK → jobs.id | |
| kind | TEXT NOT NULL | 'station' or 'line' |
| station_id | UUID NULL FK → stations.id | kind='station' |
| production_line_id | UUID NULL FK → production_lines.id | kind='line' |
| planned_quantity | INTEGER NOT NULL | editable |
| is_active | BOOLEAN NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Checks:
- `CHECK (kind IN ('station','line'))`
- `CHECK ((kind='station') = (station_id IS NOT NULL))`
- `CHECK ((kind='line') = (production_line_id IS NOT NULL))`

#### 4.2.4 `job_item_stations`
Expanded steps for each job item (frozen snapshot of steps).
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_item_id | UUID NOT NULL FK → job_items.id | |
| station_id | UUID NOT NULL FK → stations.id | |
| position | INTEGER NOT NULL | 1..N |
| is_terminal | BOOLEAN NOT NULL | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Constraints:
- `UNIQUE(job_item_id, position)`
- `UNIQUE(job_item_id, station_id)`

#### 4.2.5 `job_item_progress`
| Column | Type | Notes |
|---|---|---|
| job_item_id | UUID PK FK → job_items.id | |
| completed_good | INTEGER NOT NULL DEFAULT 0 | terminal GOOD only |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

---

## 4.3 WIP tables (BALANCE model)

### 4.3.1 `wip_balances` (GOOD-only, per-step)
This replaces lot rows with one “bucket” per job_item + step.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_item_id | UUID NOT NULL FK → job_items.id | |
| job_item_station_id | UUID NOT NULL FK → job_item_stations.id | producing step |
| good_available | INTEGER NOT NULL DEFAULT 0 | GOOD only, must be >=0 |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Constraints:
- `UNIQUE(job_item_id, job_item_station_id)`
- `CHECK (good_available >= 0)`

Interpretation:
- The value represents “how many GOOD units are currently waiting after this step, available for the next step”.

### 4.3.2 `wip_consumptions` (ledger, per-session pulls)
Records how much a downstream session pulled from an upstream step balance.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_item_id | UUID NOT NULL FK → job_items.id | |
| consuming_session_id | UUID NOT NULL FK → sessions.id | downstream session |
| from_job_item_station_id | UUID NOT NULL FK → job_item_stations.id | upstream step |
| good_used | INTEGER NOT NULL | >0 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Constraints:
- `CHECK (good_used > 0)`

Indexes (recommended):
- `wip_consumptions(consuming_session_id, created_at DESC)`
- `wip_consumptions(job_item_id, from_job_item_station_id)`

Interpretation:
- This ledger is the authoritative record of “pulled GOOD” per session.
- It enables deterministic LIFO reversal during corrections.

### 4.3.3 Derived accounting (no table required)
The system must be able to compute for any session:
- `pulled_good(session) = SUM(wip_consumptions.good_used WHERE consuming_session_id=session_id)`
- `originated_good(session) = sessions.total_good - pulled_good(session)`

Optionally provide a view:
- `v_session_wip_accounting(session_id, pulled_good, originated_good)`

---

## 5) Required RPCs

### 5.1 `rebuild_job_item_stations(job_item_id UUID)`
Behavior:
- if job_item.kind = 'station': create one step (position=1, is_terminal=true)
- if job_item.kind = 'line': expand ordered steps from `production_line_stations`; last step is_terminal=true

Additionally:
- ensure `wip_balances` rows exist for each step:
  - create `(job_item_id, job_item_station_id)` rows with `good_available=0` if missing
- ensure `job_item_progress` row exists (upsert)

Notes:
- This keeps setup idempotent and safe to rerun.

---

## 6) Atomic quantities RPC (balance model)

### 6.1 `update_session_quantities_atomic_v2(session_id UUID, total_good INT, total_scrap INT)`
Responsibilities:
- Updates `sessions.total_good/total_scrap`
- Moves WIP / progress atomically (single transaction + locks)
- Enforces rules:
  - GOOD-only upstream consumption from WIP balance
  - origination allowed when upstream insufficient
  - terminal-only completion
  - corrections: originated-first, then return pulled (LIFO), reject if downstream-consumed

### 6.2 Inputs/assumptions
- The session must have:
  - `sessions.job_item_id` set
  - `sessions.job_item_station_id` set (current step)
- The function compares new totals with stored totals:
  - `delta_good = total_good - sessions.total_good`
  - `delta_scrap = total_scrap - sessions.total_scrap`

### 6.3 Locks and concurrency
The RPC must lock:
- the `sessions` row
- the current step’s `wip_balances` row (for output reduction checks)
- the upstream step’s `wip_balances` row (if pulling)
- optionally the `job_item_progress` row (terminal step)
Use `SELECT ... FOR UPDATE` to guarantee determinism.

### 6.4 Behavior when `delta_scrap != 0`
- Always update `sessions.total_scrap = total_scrap`
- Scrap does not change WIP balances, progress, or planned quantity.

### 6.5 Behavior when `delta_good > 0` (increase)
Let:
- `step_id = sessions.job_item_station_id`
- `job_item_id = sessions.job_item_id`
- Determine upstream step:
  - if this is position=1: no upstream
  - else upstream is position-1 step_id (lookup in job_item_stations)

Algorithm:
1) **Compute pulled vs originated**
   - If no upstream: `pulled = 0`, `originated = delta_good`
   - Else:
     - read upstream balance `up_avail`
     - `pulled = min(delta_good, up_avail)`
     - `originated = delta_good - pulled`
2) **Apply upstream consumption**
   - If pulled > 0:
     - decrement upstream `wip_balances.good_available -= pulled`
     - insert ledger row in `wip_consumptions` with `good_used=pulled`
3) **Add output to current step balance**
   - increment current step `wip_balances.good_available += delta_good`
   - Rationale: step output becomes input available to downstream.
4) **If terminal step**
   - If `is_terminal=true` for this step:
     - increment `job_item_progress.completed_good += delta_good`
5) Update session totals to match inputs.

Notes:
- This keeps “WIP continuation” across sessions: balances persist independent of session lifecycle.

### 6.6 Behavior when `delta_good < 0` (decrease/correction)
Let `reduce = abs(delta_good)`.

**Hard invariant (downstream reality protection)**
Before any accounting reversals:
- Ensure current step’s output WIP has enough available to remove:
  - `current_out_avail = wip_balances(step_id).good_available`
  - If `current_out_avail < reduce`, **REJECT** with a deterministic error
    - because the missing units have already been pulled by downstream sessions.
This is the balance-model equivalent of “don’t undo consumed downstream reality”.

If allowed, proceed:

1) **Reduce the current step output balance**
   - decrement current step `wip_balances.good_available -= reduce`
   - If terminal step: decrement `job_item_progress.completed_good -= reduce`
     - (also must enforce `completed_good >= 0`)

2) **Compute current pulled/originated totals for this session**
   - `pulled_total = SUM(ledger.good_used for this session)`
   - `originated_total = sessions.total_good - pulled_total`
   - (these are totals BEFORE applying the decrease)

3) **Apply decrease to originated first**
   - `use_from_originated = min(reduce, originated_total)`
   - Remaining `need_from_pulled = reduce - use_from_originated`
   - Reducing originated does not affect upstream balances.

4) **If need_from_pulled > 0, reverse pulls LIFO**
   - Fetch session’s ledger rows ordered by `created_at DESC`
   - For each ledger row:
     - `take = min(need_from_pulled, row.good_used)`
     - decrement `row.good_used -= take` (delete row if becomes 0)
     - increment upstream balance `wip_balances(from_job_item_station_id).good_available += take`
     - `need_from_pulled -= take`
     - stop when `need_from_pulled = 0`
   - If you run out of ledger rows before satisfying `need_from_pulled`, REJECT (data integrity violation).

5) Update `sessions.total_good = total_good`

Notes:
- This exactly implements:
  - “originated first”
  - “then return pulled upstream”
  - “reject if output already consumed downstream”
- LIFO reversal is implemented via ledger order, not by lots.

### 6.7 Error contract
RPC must raise structured errors suitable for API mapping:
- `WIP_DOWNSTREAM_CONSUMED`: cannot decrease because downstream already pulled output
- `INVALID_SESSION_STEP`: job_item_id / job_item_station_id missing or inconsistent
- `NEGATIVE_PROGRESS`: attempted to reduce completed below 0 (should not happen if invariant checks correct)

---

## 7) API endpoints

### 7.1 Worker
- `GET /api/jobs/by-number/:jobNumber`
- `GET /api/jobs/:jobId/allowed-stations`
  - Must return only stations relevant to the job’s job_items/steps
  - Must be filtered (not disabled)
- `POST /api/sessions/start`
  - Must require station is allowed for the selected job
  - Must set `sessions.job_item_id` and `sessions.job_item_station_id` for the chosen job item/step
- `PATCH /api/sessions/quantities`
  - Must call `update_session_quantities_atomic_v2`
  - Must preserve legacy behavior if session has NULL job_item_id/station_id

### 7.2 Admin
- `GET/POST /api/admin/production-lines`
- `GET/PUT/DELETE /api/admin/production-lines/:id`
- `PUT /api/admin/production-lines/:id/stations` (reorder/assign)
- `GET/POST /api/admin/jobs/:jobId/items`
- `PUT/DELETE /api/admin/jobs/:jobId/items/:itemId`

---

## 8) UI changes

### 8.1 Worker
- Flow: ID → Job → Station (filtered by job)
- Work screen continues as today, but quantity updates drive WIP/progress
- Optional display (read-only):
  - upstream WIP available (from upstream `wip_balances`)
  - derived pulled/originated for this session

### 8.2 Admin
- Manage production lines (create/edit/reorder)
- Manage job items (add station/line items + planned qty)
- Show job item progress and scrap analytics

---

## 9) Analytics (balance-based)

### 9.1 Bottlenecks
Bottleneck = amount of WIP waiting (not age).
- For each step: `wip_balances.good_available`
- For each job item: sum across non-terminal steps if desired
- “Most bottlenecked step” = max good_available

### 9.2 Scrap %
- Per session: `total_scrap / (total_good + total_scrap)` (guard division by zero)
- Aggregate by:
  - job
  - station
  - job item
  - job item step (station)

Scrap never affects WIP balances or completion.

---

## 10) Acceptance tests

### Worker + permissions
1) allowed-stations endpoint returns only job-relevant stations
2) session start rejects station not allowed for job
3) legacy sessions without job_item fields still work as before

### WIP increase path
4) step 1 increases add to step 1 balance only
5) step >1 increases consume from upstream balance up to available
6) origination allowed when upstream insufficient (no rejection)
7) output always increases current step balance by delta_good
8) terminal step increases job_item_progress.completed_good only

### Corrections
9) decrease rejected if current step balance lacks enough available (downstream already consumed)
10) originated reduced first (no upstream balance change)
11) then pulled reversed LIFO (ledger newest-first) returning upstream balance
12) terminal decreases reduce completed_good consistently
13) scrap updates never change WIP/progress

### Data integrity
14) balances never go negative
15) ledger rows never have non-positive good_used
16) derived pulled/originated remain consistent with session totals

---