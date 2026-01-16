# Phase 4: Quantity Reporting at Production Exit

**Status:** Completed
**Completed:** 2026-01-13

---

## Overview

Phase 4 replaces the always-on counters with end-of-production quantity reporting. When workers leave production status (or switch jobs while in production), they are prompted to report the quantities produced during that production period.

---

## Database Migrations

The following migrations were applied in Phase 1:

| Migration | Purpose |
|-----------|---------|
| `worker_flow_phase1_schema` | Added `status_events.quantity_good` and `status_events.quantity_scrap` columns |
| `rpc_end_production_status` | Created `end_production_status_atomic()` RPC function |

---

## Files Created

| File | Purpose |
|------|---------|
| `components/work/quantity-report-dialog.tsx` | Dialog for reporting quantities when leaving production |
| `app/api/status-events/end-production/route.ts` | API endpoint to atomically end production and record quantities |

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/api/client.ts` | Added `endProductionStatusApi()` function and `EndProductionResult` type |
| `app/(worker)/work/page.tsx` | Added quantity report dialog integration, status event ID tracking, leave-production detection |

---

## Quantity Report Dialog

The dialog provides two modes for reporting:

### Additional Mode (Default)
- Worker enters quantities produced during the current production period
- Example: "I made 50 good units and 3 scrap units just now"

### Total Mode
- Worker enters cumulative session totals
- System calculates the difference from previous totals
- Example: "I have 150 total good units and 8 total scrap units for this session"

### Features

1. **Mode toggle buttons** - Switch between "כמות נוספת" (additional) and "סהכ עד עכשיו" (total)
2. **Current session totals display** - Shows existing good/scrap counts
3. **Input fields** - Good and scrap quantity inputs with placeholder hints
4. **Preview calculation** - Shows what will be added and new totals before submission
5. **Validation** - Ensures non-negative values, total mode can't go below current totals

---

## API Endpoint: End Production

`POST /api/status-events/end-production`

### Request Body
```typescript
{
  sessionId: string;
  statusEventId: string;      // The production status event being ended
  quantityGood: number;       // Additional good produced
  quantityScrap: number;      // Additional scrap produced
  nextStatusId: string;       // The status to switch to
}
```

### Atomic Operations
The `end_production_status_atomic` RPC function performs:
1. Updates `status_events` row with quantities and `ended_at`
2. Creates new status event for the next status
3. Updates `sessions.current_status_id` and `last_status_change_at`
4. Updates `sessions.total_good/total_scrap` with the additional quantities
5. Updates WIP balances via `update_session_quantities_atomic_v2` if session has job item

### Error Handling
- `SESSION_NOT_FOUND` - Session doesn't exist
- `STATUS_EVENT_NOT_FOUND` - Status event doesn't exist
- `STATUS_EVENT_SESSION_MISMATCH` - Event doesn't belong to session
- `STATUS_EVENT_ALREADY_ENDED` - Event has already been closed

---

## Work Page Integration

### Status Event ID Tracking

The work page now tracks `currentStatusEventId` from context:
- Set when creating a status event via `startStatusEventApi()`
- Set when job selection completes and production starts
- Set when quantity report completes and new status starts

### Leave Production Detection

In `handleStatusChange()`:
```typescript
const isLeavingProduction =
  isInProduction &&
  !isTargetProductionStatus &&
  activeJobItem &&
  currentStatusEventId;

if (isLeavingProduction) {
  setPendingExitStatusId(statusId);
  setIsPendingJobSwitch(false);
  setQuantityReportDialogOpen(true);
  return;
}
```

### Switch Job Flow

Updated `handleSwitchJob()` to require quantity reporting:
```typescript
if (activeJobItem && currentStatusEventId) {
  // Need to report quantities first
  setPendingExitStatusId(currentStatus ?? null);
  setIsPendingJobSwitch(true);
  setQuantityReportDialogOpen(true);
} else {
  // No active job item - just open job selection
  setJobSelectionDialogOpen(true);
}
```

After quantity report completes with `isPendingJobSwitch === true`:
1. Clear active job item
2. Open job selection dialog
3. Worker selects new job/job item
4. New production status event starts

---

## Data Flow

### Leaving Production
```
1. Worker clicks non-production status
2. isLeavingProduction detected
3. Quantity Report Dialog opens (required=true)
4. Worker enters quantities
5. API: end_production_status_atomic()
   - Close current status_events row with quantities
   - Create new status_events row for next status
   - Update session totals
   - Update WIP balances
6. UI updates: currentStatus, currentStatusEventId, totals
```

### Switching Jobs
```
1. Worker clicks "Switch Job" in banner
2. isPendingJobSwitch = true
3. Quantity Report Dialog opens (required=false, can cancel)
4. Worker enters quantities
5. API: end_production_status_atomic()
6. Active job item cleared
7. Job Selection Dialog opens
8. Worker selects new job/job item
9. New production status event starts
```

---

## Tests Passed

- Build successful (`npm run build`)
- TypeScript compilation clean

---

## Known Issues

None.

---

## Next Steps

Phase 5: First Product QA Gate

1. Create `lib/data/first-product-qa.ts` - QA check/request functions
2. Create `app/api/first-product-qa/check/route.ts`
3. Create `app/api/first-product-qa/request/route.ts`
4. Create `components/work/first-product-qa-dialog.tsx`
5. Integrate QA gate into work page before production entry
6. Extend admin reports page for QA approval
