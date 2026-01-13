# Production Lines + Job Items + WIP Implementation Plan

**Created:** 2026-01-08
**Spec:** `docs/PRODUCTION_LINE_SPEC.MD`
**Status:** Phase 6 Complete - In Progress

---

## Target Database Branch

> **IMPORTANT:** All database migrations for this feature MUST be applied to the development branch, NOT main.

| Property | Value |
|----------|-------|
| **Branch Name** | `production-line-implementation` |
| **Branch Project Ref** | `yzpwxlgvfkkidjsphfzv` |
| **Parent Project** | `nuhbytocovtywdrgwgzk` (Gestelit - main) |
| **Dashboard URL** | https://supabase.com/dashboard/project/yzpwxlgvfkkidjsphfzv |

### Applying Migrations

Use the MCP Supabase tool with `project_id: "yzpwxlgvfkkidjsphfzv"`:

```typescript
// Example: Apply migration via MCP
mcp__plugin_supabase_supabase__apply_migration({
  project_id: "yzpwxlgvfkkidjsphfzv",  // Branch project ref
  name: "migration_name",
  query: "SQL..."
})
```

### Merge to Main

After all phases are complete and tested:
1. Use `mcp__plugin_supabase_supabase__merge_branch` with branch_id
2. Or merge via Supabase Dashboard

---

## Overview

Implement production lines, job items, and balance-based WIP tracking per the spec in `docs/PRODUCTION_LINE_SPEC.MD`. This enables tracking manufacturing progress across station sequences with atomic WIP management.

**Key User Decisions:**
- Permissions: Intersection model (workers see stations they're assigned to AND part of job's line)
- Multi-Item: Jobs can have multiple job_items
- Legacy Jobs: Jobs without job_items are BLOCKED until admin configures them
- Station Exclusivity: A station is EITHER part of a production line OR single-station, not both
- Line Locking: Lines with active jobs are locked until all jobs completed

---

## Phase 1: Database Schema (Migrations)

### 1.1 Create `production_lines` and `production_line_stations`
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_production_lines.sql`

```sql
CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_line_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_station_single_line UNIQUE (station_id),  -- Station in ONE line only
  CONSTRAINT uq_line_position UNIQUE (production_line_id, position),
  CONSTRAINT uq_line_station UNIQUE (production_line_id, station_id)
);
```

### 1.2 Create `job_items`, `job_item_stations`, `job_item_progress`
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_job_items.sql`

```sql
CREATE TABLE job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('station', 'line')),
  station_id UUID NULL REFERENCES stations(id),
  production_line_id UUID NULL REFERENCES production_lines(id),
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_job_item_xor CHECK (
    (kind = 'station' AND station_id IS NOT NULL AND production_line_id IS NULL)
    OR (kind = 'line' AND station_id IS NULL AND production_line_id IS NOT NULL)
  )
);

CREATE TABLE job_item_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id),
  position INTEGER NOT NULL CHECK (position > 0),
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_jis_position UNIQUE (job_item_id, position),
  CONSTRAINT uq_jis_station UNIQUE (job_item_id, station_id)
);

CREATE TABLE job_item_progress (
  job_item_id UUID PRIMARY KEY REFERENCES job_items(id) ON DELETE CASCADE,
  completed_good INTEGER NOT NULL DEFAULT 0 CHECK (completed_good >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.3 Create WIP tables
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_wip_tables.sql`

```sql
CREATE TABLE wip_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  job_item_station_id UUID NOT NULL REFERENCES job_item_stations(id) ON DELETE CASCADE,
  good_available INTEGER NOT NULL DEFAULT 0 CHECK (good_available >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wip_step UNIQUE (job_item_id, job_item_station_id)
);

CREATE TABLE wip_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  consuming_session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_job_item_station_id UUID NOT NULL REFERENCES job_item_stations(id) ON DELETE CASCADE,
  good_used INTEGER NOT NULL CHECK (good_used > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wip_consumptions_session ON wip_consumptions(consuming_session_id, created_at DESC);
```

### 1.4 Extend sessions table
**File:** `supabase/migrations/YYYYMMDDHHMMSS_sessions_add_job_item_refs.sql`

```sql
ALTER TABLE sessions
  ADD COLUMN job_item_id UUID NULL REFERENCES job_items(id),
  ADD COLUMN job_item_station_id UUID NULL REFERENCES job_item_stations(id);

CREATE INDEX idx_sessions_job_item ON sessions(job_item_id) WHERE job_item_id IS NOT NULL;
```

### 1.5 RLS policies for new tables
**File:** `supabase/migrations/YYYYMMDDHHMMSS_rls_production_wip.sql`

Enable RLS and add service role policies for all new tables.

**Test:** Apply migrations, verify constraints with manual inserts.

---

## Phase 2: RPC Functions

### 2.1 `rebuild_job_item_stations(job_item_id)`
**File:** `supabase/migrations/YYYYMMDDHHMMSS_rpc_rebuild_job_item_stations.sql`

Idempotent setup function:
- For `kind='station'`: Create 1 step (position=1, is_terminal=true)
- For `kind='line'`: Expand from `production_line_stations`, last step is_terminal=true
- Create `wip_balances` row for each step
- Upsert `job_item_progress` row

### 2.2 `update_session_quantities_atomic_v2(session_id, total_good, total_scrap)`
**File:** `supabase/migrations/YYYYMMDDHHMMSS_rpc_update_session_quantities_v2.sql`

Core atomic logic (single transaction with row locks):

**Increase path (delta_good > 0):**
1. If upstream exists: pull = min(delta, upstream_available), decrement upstream balance
2. Record pull in `wip_consumptions` ledger
3. Increment current step balance by delta_good
4. If terminal: increment `job_item_progress.completed_good`

**Decrease path (delta_good < 0):**
1. Check current step balance >= reduce amount (else REJECT: `WIP_DOWNSTREAM_CONSUMED`)
2. Decrement current step balance
3. If terminal: decrement `completed_good`
4. Reverse originated first (no upstream change)
5. Then reverse pulled LIFO (return to upstream balance, delete/update ledger rows)

**Legacy path:** If `job_item_id` is NULL, do simple UPDATE (backwards compatible).

### 2.3 Helper view
**File:** `supabase/migrations/YYYYMMDDHHMMSS_view_session_wip_accounting.sql`

```sql
CREATE VIEW v_session_wip_accounting AS
SELECT s.id AS session_id, s.total_good,
  COALESCE(SUM(wc.good_used), 0)::INTEGER AS pulled_good,
  (s.total_good - COALESCE(SUM(wc.good_used), 0))::INTEGER AS originated_good
FROM sessions s
LEFT JOIN wip_consumptions wc ON wc.consuming_session_id = s.id
WHERE s.job_item_id IS NOT NULL
GROUP BY s.id, s.total_good;
```

**Test:** Create integration tests in `tests/integration/wip-lifecycle.test.ts`

---

## Phase 3: Data Layer (`lib/data/`)

### 3.1 New file: `lib/data/production-lines.ts`
- `fetchAllProductionLines(options?)`
- `getProductionLineById(id)`
- `createProductionLine(payload)`
- `updateProductionLine(id, payload)`
- `deleteProductionLine(id)` - check for active jobs
- `updateProductionLineStations(lineId, stationIds[])`
- `isProductionLineLocked(lineId)` - has active job items

### 3.2 New file: `lib/data/job-items.ts`
- `fetchJobItemsForJob(jobId)`
- `getJobItemById(id)`
- `createJobItem(payload)` - calls `rebuild_job_item_stations` RPC
- `updateJobItem(id, payload)`
- `deleteJobItem(id)` - check for active sessions
- `getJobItemStations(jobItemId)`
- `getJobAllowedStations(jobId)` - union of all job_item_stations

### 3.3 Update: `lib/data/stations.ts`
Add function:
```typescript
fetchAllowedStationsForJobAndWorker(jobId: string, workerId: string)
// Returns: intersection of worker_stations AND job's job_item_stations
```

### 3.4 Update: `lib/data/sessions.ts`
- Modify `createSession()`: Accept `jobItemId`, `jobItemStationId` params
- Add `updateSessionQuantitiesAtomic()`: Call RPC, handle errors

### 3.5 Update: `lib/types.ts`
Add types: `ProductionLine`, `ProductionLineStation`, `JobItem`, `JobItemKind`, `JobItemStation`, `JobItemProgress`, `WipBalance`

Extend `Session` interface with `job_item_id?`, `job_item_station_id?`

---

## Phase 4: API Endpoints

### 4.1 Worker APIs

**New:** `GET /api/jobs/[jobId]/allowed-stations`
- Query: `workerId` (required)
- Returns stations allowed for job AND assigned to worker
- File: `app/api/jobs/[jobId]/allowed-stations/route.ts`

**Update:** `POST /api/sessions` (`app/api/sessions/route.ts`)
- Validate job has job_items (block if none)
- Validate station is in job's allowed stations
- Set `job_item_id` and `job_item_station_id` on session

**Update:** `POST /api/sessions/quantities` (`app/api/sessions/quantities/route.ts`)
- Switch from `updateSessionTotals()` to `updateSessionQuantitiesAtomic()`
- Handle `WIP_DOWNSTREAM_CONSUMED` error

### 4.2 Admin APIs

**New:** `app/api/admin/production-lines/route.ts` (GET, POST)
**New:** `app/api/admin/production-lines/[id]/route.ts` (GET, PUT, DELETE)
**New:** `app/api/admin/production-lines/[id]/stations/route.ts` (PUT - reorder)
**New:** `app/api/admin/jobs/[jobId]/items/route.ts` (GET, POST)
**New:** `app/api/admin/jobs/[jobId]/items/[itemId]/route.ts` (GET, PUT, DELETE)

---

## Phase 5: Worker Flow UI

### 5.1 Update: `app/(worker)/job/page.tsx`
After job validation:
- Check if job has job_items
- If none: Show error "Job not configured for production", block navigation

### 5.2 Update: `app/(worker)/station/page.tsx`
Replace station fetch:
```typescript
// Before: fetchStationsWithOccupancyApi(workerId)
// After:  fetchAllowedStationsForJobApi(jobId, workerId)
```
This returns ONLY stations in job's production line(s) AND assigned to worker.

### 5.3 Update: `app/(worker)/work/page.tsx`
- Handle `WIP_DOWNSTREAM_CONSUMED` error with user-friendly message
- Optional: Display WIP state (pulled/originated) in read-only panel

### 5.4 Update: `contexts/WorkerSessionContext.tsx`
Add optional state for `jobItem`, `jobItemStation`, `wipState`

---

## Phase 6: Admin UI

### 6.1 Production Lines Management
**New:** `app/admin/production-lines/page.tsx` - List with create/edit/delete
**New:** `app/admin/production-lines/[id]/page.tsx` - Edit line, drag-drop station ordering

### 6.2 Job Items Management
**Update:** Job detail page - Add Job Items section
- List items with progress bars
- Add new item (station or line type)
- Edit planned quantity
- Delete item (if no sessions)

### 6.3 Dashboard Enhancements
- Bottleneck detection widget (highest WIP balances)
- Job completion progress visualization

---

## Phase 7: Integration Tests

**File:** `tests/integration/wip-lifecycle.test.ts`

Test cases from spec section 10:
1. allowed-stations returns only job-relevant stations
2. session start rejects station not allowed for job
3. legacy sessions without job_item fields still work
4. step 1 increases add to step 1 balance only
5. step >1 consumes from upstream balance
6. origination allowed when upstream insufficient
7. terminal step increases completed_good
8. decrease rejected if downstream consumed
9. originated reduced first, then pulled LIFO
10. balances never go negative
11. scrap updates never change WIP/progress

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `lib/data/sessions.ts` | Add job_item fields, atomic quantities RPC call |
| `lib/data/stations.ts` | Add `fetchAllowedStationsForJobAndWorker()` |
| `lib/data/production-lines.ts` | NEW - Production line CRUD |
| `lib/data/job-items.ts` | NEW - Job item CRUD with RPC calls |
| `lib/types.ts` | Add new types, extend Session |
| `app/api/sessions/route.ts` | Validate job has items, station allowed |
| `app/api/sessions/quantities/route.ts` | Switch to atomic RPC |
| `app/api/jobs/[jobId]/allowed-stations/route.ts` | NEW - Filtered stations endpoint |
| `app/(worker)/job/page.tsx` | Block jobs without items |
| `app/(worker)/station/page.tsx` | Use filtered station fetch |

---

## Verification Plan

1. **Phase 1-2:** Run migrations, verify schema with manual SQL inserts
2. **Phase 3:** Unit test data layer functions
3. **Phase 4:** Integration test API endpoints
4. **Phase 5:** Manual E2E test worker flow
5. **Phase 6:** Manual UI test admin pages
6. **Phase 7:** Run full test suite

---

## Rollback Strategy

- Each migration has a down migration
- Feature flag option: `ENABLE_JOB_ITEMS` environment variable
- Legacy sessions (NULL job_item_id) continue working
- Rollback procedure: Complete active sessions, run down migrations in reverse

---

## Progress Tracking

After completing each phase, create a progress file in this directory.

### Progress Files
```
docs/production-line-progress/
  PLAN.md                 # This file - master plan
  phase-1-schema.md       # Completed migrations + test results
  phase-2-rpc.md          # RPC functions + test results
  phase-3-data-layer.md   # Data layer changes + test results
  phase-4-api.md          # API endpoints + test results
  phase-5-worker-ui.md    # Worker flow changes + test results
  phase-6-admin-ui.md     # Admin UI changes + test results
  phase-7-tests.md        # Integration test results
```

### Progress File Template
Each file should contain:
1. **Status:** Completed / In Progress / Blocked
2. **Files Created/Modified:** List with paths
3. **Migrations Applied:** Migration names + timestamps
4. **Tests Passed:** List of test names
5. **Known Issues:** Any problems encountered
6. **Next Steps:** What to do next if resuming

### Example Progress File
```markdown
# Phase 1: Database Schema - COMPLETED

## Status: COMPLETED
Completed: 2026-01-08

## Migrations Applied
- [x] 20260108100000_create_production_lines.sql
- [x] 20260108100100_create_job_items.sql
- [x] 20260108100200_create_wip_tables.sql
- [x] 20260108100300_sessions_add_job_item_refs.sql
- [x] 20260108100400_rls_production_wip.sql

## Manual Tests Passed
- [x] UNIQUE(station_id) on production_line_stations prevents multi-line assignment
- [x] job_items CHECK constraint enforces XOR (station vs line)
- [x] ON DELETE CASCADE removes job_item_stations when job_item deleted
- [x] good_available CHECK >= 0 on wip_balances

## Files Created
- supabase/migrations/20260108100000_create_production_lines.sql
- supabase/migrations/20260108100100_create_job_items.sql
- supabase/migrations/20260108100200_create_wip_tables.sql
- supabase/migrations/20260108100300_sessions_add_job_item_refs.sql
- supabase/migrations/20260108100400_rls_production_wip.sql

## Known Issues
None

## Next Steps
Proceed to Phase 2: RPC Functions
```

### Resumption Protocol
When resuming work on this feature:
1. Read `docs/production-line-progress/` directory
2. Find latest completed phase file
3. Check "Next Steps" section
4. Continue from that point
