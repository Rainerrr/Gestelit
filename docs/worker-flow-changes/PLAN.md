# Worker Flow Behavior Changes - Implementation Plan

**Created:** 2026-01-13
**Status:** Not Started
**Related:** `docs/WORKER_FLOW.md`, `docs/SESSION_ARCHITECTURE.md`, `docs/PRODUCTION_LINES.md`

---

## Target Database Branch

> **CRITICAL:** All database migrations for this feature MUST be applied to the development branch, NOT main.

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
  project_id: "yzpwxlgvfkkidjsphfzv",  // Branch project ref - NOT main!
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

Transform the worker flow from job-at-login to job-at-production-entry, with end-of-production quantity reporting and optional first product QA gate.

**Current Flow**: Login → Job Entry → Station Selection → Checklist → Work (always-on counters)
**New Flow**: Login → Station Selection → Checklist → Work (job selection on production entry, reporting on production exit)

**Key Changes:**
1. Sessions created without job binding initially
2. Job → Job Item selection when entering production status
3. Quantities linked to production status events (not always-on counters)
4. Optional first product QA gate for flagged stations

---

## Phase 1: Session Decoupling (Plan A)

### Goal
Remove job-number-at-login requirement. Sessions created without job, job selected when entering production.

### Database Migration

**File:** `supabase/migrations/YYYYMMDDHHMMSS_worker_flow_schema.sql`

```sql
-- ================================================
-- Worker Flow Changes: Schema Extensions
-- ================================================

-- 1. Extend status_events with quantity tracking
-- Quantities produced during each production status event
ALTER TABLE status_events ADD COLUMN quantity_good INTEGER DEFAULT 0;
ALTER TABLE status_events ADD COLUMN quantity_scrap INTEGER DEFAULT 0;

COMMENT ON COLUMN status_events.quantity_good IS 'Good units produced during this production status event';
COMMENT ON COLUMN status_events.quantity_scrap IS 'Scrap units during this production status event';

-- 2. Add first product QA flag to stations
ALTER TABLE stations ADD COLUMN requires_first_product_qa BOOLEAN DEFAULT false;

COMMENT ON COLUMN stations.requires_first_product_qa IS 'If true, first product QA approval required before production';

-- 3. Add QA tracking columns to reports table
ALTER TABLE reports ADD COLUMN job_item_id UUID REFERENCES job_items(id);
ALTER TABLE reports ADD COLUMN is_first_product_qa BOOLEAN DEFAULT false;

COMMENT ON COLUMN reports.job_item_id IS 'Links report to specific job item (for QA tracking)';
COMMENT ON COLUMN reports.is_first_product_qa IS 'True if this is a first product QA request';

-- 4. Create index for efficient QA lookups
CREATE INDEX idx_reports_first_product_qa
  ON reports(job_item_id, station_id)
  WHERE is_first_product_qa = true;
```

### Code Changes

#### 1. Login Page (`app/(worker)/login/page.tsx`)
- Change redirect from `/job` to `/station` after successful login (line ~87)
- Session recovery flow unchanged (still goes to `/station`)

#### 2. Station Page (`app/(worker)/station/page.tsx`)
- Remove job dependency guard (lines 169-178)
- Fetch stations using legacy mode (flat list) since no job selected
- Modify `handleContinue()` to call `createSessionApi(workerId, stationId, null)` without jobId

#### 3. Session Creation API (`app/api/sessions/route.ts`)
- Make `jobId` optional in validation
- Skip job item resolution when `jobId` is null
- Create session with `job_id`, `job_item_id`, `job_item_station_id` all null initially

#### 4. Context Updates (`contexts/WorkerSessionContext.tsx`)

Add new state:
```typescript
activeJob?: { id: string; jobNumber: string; clientName: string | null } | null;
activeJobItem?: ActiveJobItemContext | null;
productionTotals: { good: number; scrap: number; lastReportedAt?: string };
currentStatusEventId?: string;
```

Add new actions:
- `setActiveJob`
- `setActiveJobItem`
- `setProductionTotals`
- `resetProductionTotals`
- `setCurrentStatusEventId`

### Checklist
- [ ] Apply database migration to branch `yzpwxlgvfkkidjsphfzv`
- [ ] Modify `app/(worker)/login/page.tsx` - redirect to /station
- [ ] Modify `app/(worker)/station/page.tsx` - remove job dependency
- [ ] Modify `app/api/sessions/route.ts` - make jobId optional
- [ ] Modify `contexts/WorkerSessionContext.tsx` - add new state

---

## Phase 2: Job → Job Item Selection on Production Entry (Plan B)

### Goal
When switching to production status, show a **two-step selection**: first select a Job, then select a Job Item within that job. This prepares for future support of multiple job items per station in the same job.

### Selection Flow

```
[Enter Production] → [Select Job Dialog] → [Select Job Item Dialog] → [Start Production]
```

**Step 1: Job Selection**
- Show dropdown of available jobs that have job items for this station
- Display: job_number, client_name

**Step 2: Job Item Selection**
- Show dropdown of job items within the selected job for this station
- Display: job_item name, planned_quantity, completed_good, remaining
- Currently only one job item per station per job, but UI ready for multiple

### New API Endpoints

#### 1. `GET /api/stations/[stationId]/available-jobs`

**File:** `app/api/stations/[stationId]/available-jobs/route.ts`

Returns jobs that have job items for this station:
```typescript
type AvailableJob = {
  id: string;
  jobNumber: string;
  clientName: string | null;
  description: string | null;
  jobItemCount: number;        // How many job items for this station
};
```

#### 2. `GET /api/stations/[stationId]/jobs/[jobId]/job-items`

**File:** `app/api/stations/[stationId]/jobs/[jobId]/job-items/route.ts`

Returns job items for the selected job at this station:
```typescript
type AvailableJobItem = {
  id: string;              // job_item_id
  jobId: string;
  name: string;            // Production line name or "Single Station"
  kind: "station" | "line";
  plannedQuantity: number;
  completedGood: number;   // from job_item_progress
  remaining: number;       // planned - completed
  jobItemStationId: string; // for session binding
};
```

#### 3. `POST /api/sessions/bind-job-item`

**File:** `app/api/sessions/bind-job-item/route.ts`

Called after job item selection to update session with job context:
```typescript
type BindJobItemPayload = {
  sessionId: string;
  jobId: string;
  jobItemId: string;
  jobItemStationId: string;
};
```

### New Component: Job Selection Dialog

**File:** `components/work/job-selection-dialog.tsx`

Two-step dialog:
1. **Job dropdown** - Shows available jobs
2. **Job Item dropdown** - Shows job items for selected job (appears after job selected)

```typescript
type JobSelectionDialogProps = {
  open: boolean;
  stationId: string;
  onSelect: (jobItem: AvailableJobItem, job: AvailableJob) => void;
  onCancel: () => void;
  required?: boolean;  // If true, cannot dismiss without selection
};
```

UI Layout:
```
+------------------------------------------+
|  בחר עבודה לייצור (Select Job)            |
+------------------------------------------+
|  עבודה (Job):                            |
|  [Dropdown: 12345 - לקוח א' ▼]           |
|                                          |
|  פריט עבודה (Job Item):                  |
|  [Dropdown: קו ייצור 1 ▼]               |
|  מתוכנן: 1000 | בוצע: 250 | נותר: 750    |
|                                          |
|  [Cancel]              [Start Production]|
+------------------------------------------+
```

### Work Page Integration (`app/(worker)/work/page.tsx`)

Modify `handleStatusChange`:
```typescript
if (isProductionStatus && !activeJobItem) {
  setPendingProductionStatusId(statusId);
  setJobSelectionDialogOpen(true);
  return;
}
```

After selection completes:
- Store both `activeJob` and `activeJobItem` in context
- Bind session to job_item_id and job_item_station_id via API

### Client API Functions (`lib/api/client.ts`)

```typescript
fetchAvailableJobsForStationApi(stationId: string): Promise<AvailableJob[]>
fetchJobItemsForStationJobApi(stationId: string, jobId: string): Promise<AvailableJobItem[]>
bindJobItemToSessionApi(payload: BindJobItemPayload): Promise<void>
```

### Checklist
- [ ] Create `lib/data/job-items.ts` functions for station-based queries
- [ ] Create `app/api/stations/[stationId]/available-jobs/route.ts`
- [ ] Create `app/api/stations/[stationId]/jobs/[jobId]/job-items/route.ts`
- [ ] Create `app/api/sessions/bind-job-item/route.ts`
- [ ] Add client API functions to `lib/api/client.ts`
- [ ] Create `components/work/job-selection-dialog.tsx`
- [ ] Integrate dialog into `app/(worker)/work/page.tsx`

---

## Phase 3: Production Context Display (Plan C)

### Goal
Show active job info when in production, block UI if no job selected.

### New Component: Production Context Banner

**File:** `components/work/production-context-banner.tsx`

Displays when in production:
- Job number
- Client name
- Job item progress (planned/completed/remaining)
- Session quantities (this session's contribution)
- "Switch Job" button (opens job selection dialog)

### Work Page Integration

- Render banner above status selection when `currentStatus.machine_state === "production"`
- If production but `activeJobItem` is null, force job selection dialog open with `required={true}`

### Checklist
- [ ] Create `components/work/production-context-banner.tsx`
- [ ] Integrate banner into `app/(worker)/work/page.tsx`
- [ ] Add force job selection logic when in production without job

---

## Phase 4: Quantity Reporting at Production Exit (Plan D)

### Goal
Replace always-on counters with end-of-production reporting modal. **Link quantity data directly to the production status event.**

### Data Structure: Quantities on Status Events

The key insight: quantities are produced **during a production status event**. When production ends, we record what was produced during that specific production period on the status event itself.

**Schema (from Phase 1 migration):**
```sql
ALTER TABLE status_events ADD COLUMN quantity_good INTEGER DEFAULT 0;
ALTER TABLE status_events ADD COLUMN quantity_scrap INTEGER DEFAULT 0;
```

This links quantities directly to the production status event:
- When production status event ends (`ended_at` is set), quantities are stored on the same row
- Each production period has its own quantity record
- Audit trail is automatic: see exactly what was produced in each production period
- Session totals (`sessions.total_good`, `sessions.total_scrap`) = sum of all status event quantities

**Flow:**
1. Worker enters production → new `status_events` row created
2. Worker works...
3. Worker exits production → quantity dialog appears
4. Quantities saved to `status_events.quantity_good` and `status_events.quantity_scrap`
5. `status_events.ended_at` is set
6. Session totals updated atomically

### Triggers

1. **Leaving production status** - switching from production to any non-production status
2. **Switching job item** - changing to different job while staying in production
3. **Ending session** - before end checklist (session end requires switching to stoppage first)

### New RPC Function

**File:** `supabase/migrations/YYYYMMDDHHMMSS_rpc_end_production_status.sql`

```sql
CREATE OR REPLACE FUNCTION end_production_status_atomic(
  p_session_id UUID,
  p_status_event_id UUID,
  p_quantity_good INTEGER,
  p_quantity_scrap INTEGER,
  p_next_status_id UUID
) RETURNS status_events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_current_event status_events%ROWTYPE;
  v_new_event status_events%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock and fetch session
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- 2. Lock and fetch current status event
  SELECT * INTO v_current_event
  FROM status_events
  WHERE id = p_status_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STATUS_EVENT_NOT_FOUND';
  END IF;

  -- 3. Verify this is the current active event for the session
  IF v_current_event.session_id != p_session_id THEN
    RAISE EXCEPTION 'STATUS_EVENT_SESSION_MISMATCH';
  END IF;

  IF v_current_event.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'STATUS_EVENT_ALREADY_ENDED';
  END IF;

  -- 4. Update the production status event with quantities
  UPDATE status_events
  SET
    quantity_good = p_quantity_good,
    quantity_scrap = p_quantity_scrap,
    ended_at = v_now
  WHERE id = p_status_event_id;

  -- 5. Create new status event for next status
  INSERT INTO status_events (
    session_id,
    status_definition_id,
    started_at
  ) VALUES (
    p_session_id,
    p_next_status_id,
    v_now
  ) RETURNING * INTO v_new_event;

  -- 6. Update session totals and current status
  UPDATE sessions
  SET
    total_good = total_good + p_quantity_good,
    total_scrap = total_scrap + p_quantity_scrap,
    current_status_id = p_next_status_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  -- 7. If session has job_item_id, update WIP balances
  IF v_session.job_item_id IS NOT NULL AND v_session.job_item_station_id IS NOT NULL THEN
    PERFORM update_session_quantities_atomic_v2(
      p_session_id,
      v_session.total_good + p_quantity_good,
      v_session.total_scrap + p_quantity_scrap
    );
  END IF;

  RETURN v_new_event;
END;
$$;

COMMENT ON FUNCTION end_production_status_atomic IS
'Atomically ends a production status event with quantities and starts the next status.
Updates session totals and WIP balances in a single transaction.';
```

### New Component: Quantity Report Dialog

**File:** `components/work/quantity-report-dialog.tsx`

Fields:
- Report mode: "additional" (how much added now) or "total" (total so far)
- Good quantity (number input)
- Scrap quantity (number input)

Logic:
```typescript
if (mode === "total") {
  // Derive additional from session totals
  additionalGood = input.good - sessionTotals.good;
  additionalScrap = input.scrap - sessionTotals.scrap;
} else {
  // Use as-is
  additionalGood = input.good;
  additionalScrap = input.scrap;
}
// Store on the status_event row
```

### New API Endpoint

**File:** `app/api/status-events/end-production/route.ts`

```typescript
type EndProductionPayload = {
  sessionId: string;
  statusEventId: string;      // The production status event being ended
  quantityGood: number;       // Additional good produced in this event
  quantityScrap: number;      // Additional scrap produced in this event
  nextStatusId: string;       // The status to switch to
};
```

This API atomically:
1. Updates `status_events` row with `quantity_good`, `quantity_scrap`, `ended_at`
2. Creates new status event for `nextStatusId`
3. Updates `sessions.current_status_id`
4. Updates `sessions.total_good += quantityGood`, `sessions.total_scrap += quantityScrap`
5. Updates WIP balances via existing atomic function

### Work Page Changes

Modify `handleStatusChange`:
```typescript
const isLeavingProduction =
  currentStatusDef?.machine_state === "production" &&
  targetStatusDef?.machine_state !== "production";

if (isLeavingProduction && activeJobItem) {
  setPendingExitStatusId(statusId);
  setCurrentProductionEventId(currentStatusEventId); // Track which event to update
  setQuantityReportDialogOpen(true);
  return;
}
```

### Production Pipeline Changes (`components/work/production-pipeline.tsx`)

- Make counters read-only (display session totals)
- Remove increment/decrement buttons for production line mode
- Keep existing counters for legacy single-station sessions (optional)

### Benefits of This Data Structure

1. **Audit trail**: Each production period has its own quantity record
2. **Analytics**: Can analyze productivity per status event (quantities / duration)
3. **Corrections**: Can modify specific event quantities without affecting others
4. **History**: Full timeline of when and how much was produced

### Checklist
- [ ] Apply RPC function migration to branch `yzpwxlgvfkkidjsphfzv`
- [ ] Create `app/api/status-events/end-production/route.ts`
- [ ] Create `components/work/quantity-report-dialog.tsx`
- [ ] Modify `app/(worker)/work/page.tsx` - add quantity reporting flow
- [ ] Modify `components/work/production-pipeline.tsx` - make counters read-only

---

## Phase 5: First Product QA Gate (Plan E)

### Goal
For flagged stations, require QA approval before first production on a job item.

### Database Changes (Using Existing Tables)

QA approval tracked via existing `reports` table:
- `reports.type = 'general'` with `is_first_product_qa = true`
- `reports.job_item_id` links to the specific job item
- `reports.station_id` links to the station
- `reports.status` follows existing `"new" → "approved"` flow

To check if QA approved:
```sql
SELECT * FROM reports
WHERE is_first_product_qa = true
  AND job_item_id = X
  AND station_id = Y
  AND status = 'approved'
```

### New Component: First Product QA Dialog

**File:** `components/work/first-product-qa-dialog.tsx`

- Image upload (optional)
- Notes textarea
- Submit creates report with `is_first_product_qa = true`

### API Endpoints

#### 1. `GET /api/first-product-qa/check`

**File:** `app/api/first-product-qa/check/route.ts`

Query params: `jobItemId`, `stationId`
Returns: `{ approved: boolean, pendingReport?: Report }`

#### 2. `POST /api/first-product-qa/request`

**File:** `app/api/first-product-qa/request/route.ts`

Creates report with:
- `type: "general"`
- `is_first_product_qa: true`
- `job_item_id: <selected job item>`
- `station_id: <current station>`
- `status: "new"`

#### 3. Admin Approval

Uses existing `PATCH /api/admin/reports/[id]` - set `status: "approved"`

### Work Page Integration

Before entering production (after job selection):
```typescript
if (station.requires_first_product_qa) {
  const qaStatus = await checkFirstProductQAApproval(activeJobItem.id, station.id);
  if (!qaStatus.approved) {
    if (qaStatus.pendingReport) {
      // Show "waiting for approval" message
      setQAWaitingDialogOpen(true);
    } else {
      // Show QA request dialog
      setFirstProductQADialogOpen(true);
    }
    return;
  }
}
```

### Admin Interface Extension

**File:** `app/admin/reports/page.tsx`

- Filter reports by `is_first_product_qa = true`
- Show job item context (job number, station)
- Quick approve action (same as existing report approval)

### Checklist
- [ ] Create `lib/data/first-product-qa.ts` - QA check/request functions
- [ ] Create `app/api/first-product-qa/check/route.ts`
- [ ] Create `app/api/first-product-qa/request/route.ts`
- [ ] Create `components/work/first-product-qa-dialog.tsx`
- [ ] Integrate QA gate into `app/(worker)/work/page.tsx`
- [ ] Extend `app/admin/reports/page.tsx` for QA approval

---

## Files to Create

| File | Purpose |
|------|---------|
| `components/work/job-selection-dialog.tsx` | Two-step Job → Job Item selection for production entry |
| `components/work/quantity-report-dialog.tsx` | End-of-production quantity reporting |
| `components/work/production-context-banner.tsx` | Display current job on work page |
| `components/work/first-product-qa-dialog.tsx` | QA request submission |
| `app/api/stations/[stationId]/available-jobs/route.ts` | Fetch jobs that have job items for this station |
| `app/api/stations/[stationId]/jobs/[jobId]/job-items/route.ts` | Fetch job items for selected job at station |
| `app/api/sessions/bind-job-item/route.ts` | Bind session to selected job item |
| `app/api/status-events/end-production/route.ts` | End production status event with quantities, start next status |
| `app/api/first-product-qa/check/route.ts` | Check QA approval status (queries reports table) |
| `app/api/first-product-qa/request/route.ts` | Submit QA request (creates report with is_first_product_qa=true) |
| `lib/data/first-product-qa.ts` | QA check/request functions (uses existing reports table) |

## Files to Modify

| File | Changes |
|------|---------|
| `app/(worker)/login/page.tsx` | Redirect to `/station` instead of `/job` |
| `app/(worker)/station/page.tsx` | Remove job dependency, create session without job |
| `app/(worker)/work/page.tsx` | Add dialogs, modify status change flow, add banner |
| `app/api/sessions/route.ts` | Make jobId optional |
| `contexts/WorkerSessionContext.tsx` | Add activeJob, activeJobItem, productionTotals state |
| `lib/api/client.ts` | Add new API wrapper functions |
| `lib/data/job-items.ts` | Add station-based job item queries |
| `lib/types.ts` | Add new types (AvailableJob, AvailableJobItem) |
| `components/work/production-pipeline.tsx` | Make counters read-only in production line mode |

## Migrations Summary

| Migration | Purpose |
|-----------|---------|
| `YYYYMMDDHHMMSS_worker_flow_schema.sql` | Add columns: status_events.quantity_good/scrap, stations.requires_first_product_qa, reports.job_item_id/is_first_product_qa |
| `YYYYMMDDHHMMSS_rpc_end_production_status.sql` | Create end_production_status_atomic() RPC function |

---

## Verification Plan

### Manual Testing

1. **Flow without job**
   - Login → Station selection → Checklist → Work page
   - Verify no job required until production

2. **Job selection on production entry**
   - Click production status → Job dialog appears
   - Select job → Job item dropdown appears
   - Select job item → Production starts with job context
   - Cancel → Returns to previous status

3. **Production context display**
   - In production → Banner shows job info
   - Click "Switch Job" → Quantity report first, then job selection
   - Select different job → New production context

4. **Quantity reporting**
   - Exit production → Quantity dialog appears
   - Report additional or total → Verify calculations
   - Check status_events has quantity_good/scrap values
   - End session → Verify quantity report required

5. **First product QA** (if station flagged)
   - Enter production → QA dialog if not approved
   - Submit QA request → Shows "waiting for approval"
   - Admin approves → Production now allowed

### Integration Tests

Add to `tests/integration/`:
- `worker-flow-job-selection.test.ts` - Job selection dialog behavior
- `quantity-reporting.test.ts` - Quantity report calculations and API
- `first-product-qa.test.ts` - QA request and approval flow

---

## Edge Cases

1. **Session recovery with active production** - Check if job item still exists, force reselection if not
2. **Network error during job selection** - Show retry, don't enter production until confirmed
3. **Concurrent job selection** - Multiple workers on same job item is allowed (WIP handles it)
4. **Station requires QA but no pending approval** - Show QA dialog, block production until submitted and approved
5. **Switching job mid-production** - Must report quantities for current job first

---

## Progress Tracking

After completing each phase, update the corresponding progress file in this directory.

### Progress Files
```
docs/worker-flow-changes/
  PLAN.md                   # This file - master plan
  phase-1-schema.md         # Database migrations + session decoupling
  phase-2-job-selection.md  # Job → Job Item selection APIs and UI
  phase-3-context-display.md # Production context banner
  phase-4-quantity-report.md # End-of-production quantity reporting
  phase-5-qa-gate.md        # First product QA gate
```

### Progress File Template

Each file should contain:
1. **Status:** Completed / In Progress / Blocked
2. **Files Created/Modified:** List with paths
3. **Migrations Applied:** Migration names + timestamps
4. **Tests Passed:** List of test names
5. **Known Issues:** Any problems encountered
6. **Next Steps:** What to do next if resuming

### Resumption Protocol

When resuming work on this feature:
1. Read `docs/worker-flow-changes/` directory
2. Find latest completed phase file
3. Check "Next Steps" section
4. Continue from that point
5. **Always use branch project_id:** `yzpwxlgvfkkidjsphfzv`
