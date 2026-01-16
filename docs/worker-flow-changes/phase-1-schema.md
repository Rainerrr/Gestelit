# Phase 1: Database Schema & Session Decoupling

**Status:** Completed
**Completed:** 2026-01-13

---

## Overview

Phase 1 establishes the database foundation and decouples session creation from job binding. Workers can now start sessions without selecting a job first - job/job item selection is deferred to when they enter production status.

---

## Files Created

None - all changes were to existing files.

---

## Files Modified

| File | Changes |
|------|---------|
| `app/(worker)/login/page.tsx` | Changed redirect from `/job` to `/station` after login |
| `app/(worker)/station/page.tsx` | Removed job dependency guard, always use legacy mode (flat station list), updated session creation to work without job |
| `app/api/sessions/route.ts` | Made `jobId` optional in validation, skip job item resolution when null |
| `lib/api/client.ts` | Updated `createSessionApi` to accept `jobId: string \| null` |
| `lib/utils/session-storage.ts` | Made `jobId` and `jobNumber` nullable in `PersistedSessionState` |
| `contexts/WorkerSessionContext.tsx` | Added new state: `activeJobItem`, `currentStatusEventId`, `productionTotals`; added actions: `setActiveJobItem`, `setCurrentStatusEventId`, `updateProductionTotals`, `resetProductionTotals` |

---

## Migrations Applied

### 1. `worker_flow_phase1_schema`

Applied to branch project: `yzpwxlgvfkkidjsphfzv`

```sql
-- Extend status_events with quantity tracking
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS quantity_good INTEGER DEFAULT 0;
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS quantity_scrap INTEGER DEFAULT 0;

-- Add first product QA flag to stations
ALTER TABLE stations ADD COLUMN IF NOT EXISTS requires_first_product_qa BOOLEAN DEFAULT false;

-- Add QA tracking columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS job_item_id UUID REFERENCES job_items(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_first_product_qa BOOLEAN DEFAULT false;

-- Create index for QA lookups
CREATE INDEX IF NOT EXISTS idx_reports_first_product_qa
  ON reports(job_item_id, station_id)
  WHERE is_first_product_qa = true;
```

### 2. `rpc_end_production_status`

Applied to branch project: `yzpwxlgvfkkidjsphfzv`

Created `end_production_status_atomic` RPC function that:
1. Updates `status_events` row with quantities and `ended_at`
2. Creates new status event for next status
3. Updates `sessions.current_status_id`
4. Updates `sessions.total_good/total_scrap`
5. Updates WIP balances via existing `update_session_quantities_atomic_v2` function

---

## Tests Passed

- Build successful (`npm run build`)
- TypeScript compilation clean

---

## Known Issues

None.

---

## Worker Flow Changes

### Before (Old Flow)
```
Login → Job Entry → Station Selection → Checklist → Work
```

### After (New Flow)
```
Login → Station Selection → Checklist → Work → (Job Selection on Production Entry)
```

### Key Behavioral Changes

1. **Login page** now redirects directly to `/station` instead of `/job`
2. **Station page** no longer requires a job - workers see all their assigned stations
3. **Session creation** works without job binding - `job_id`, `job_item_id`, and `job_item_station_id` can all be null
4. **Session recovery** still works, and no longer requires job data to be present

---

## Context State Changes

New state added to `WorkerSessionContext`:

```typescript
// Lightweight type for active job item context during production
export type ActiveJobItemContext = {
  id: string;
  jobId: string;
  name: string;
  kind: "station" | "line";
  plannedQuantity: number;
  jobItemStationId: string;
};

// New state fields
activeJobItem?: ActiveJobItemContext | null;
currentStatusEventId?: string | null;
productionTotals: {
  good: number;
  scrap: number;
  lastReportedAt?: string;
};
```

---

## Next Steps

Phase 2: Job → Job Item Selection on Production Entry

1. Create API endpoint: `GET /api/stations/[stationId]/available-jobs`
2. Create API endpoint: `GET /api/stations/[stationId]/jobs/[jobId]/job-items`
3. Create API endpoint: `POST /api/sessions/bind-job-item`
4. Create component: `JobSelectionDialog`
5. Add client API functions
6. Integrate with work page status change flow
