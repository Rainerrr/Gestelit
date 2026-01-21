# Fix: Orphan Status Events

> **Status: IMPLEMENTED** - All changes completed and build verified.
>
> **Update 2**: Fixed job completion dialog edge cases:
> - Timeline merging now checks `reportReasonLabel` (actual report) not `reportType` (config)
> - Completion flow handles pending reports when `shouldCloseJobItem` is true
> - Completion dialog filters out just-completed job item from available jobs
> - Clicking "stoppage" in completion dialog no longer creates duplicate status events

## Problem Statement

When leaving production to a status that requires a report (malfunction/general), the current flow creates **two status events** and allows orphan events:

### Current Broken Flow
1. Worker is in production (status event A - production)
2. Worker clicks "תקלה" (malfunction status)
3. Quantity report dialog opens
4. Worker submits quantity report
5. `endProductionStatusApi` creates **status event B** (malfunction) ← First event created
6. Report dialog opens with `pendingStatusId` set
7. Worker can cancel/close report dialog
8. **Result: Orphan malfunction event without report**

If worker submits the report:
9. `createStatusEventWithReportApi` creates **status event C** (another malfunction) ← Duplicate!
10. **Result: Two short malfunction events** (as seen in screenshots)

### Root Cause
The code sets `pendingStatusId` after quantity submission, which causes the fault dialog to use `createStatusEventWithReportApi` instead of just `createReportApi`. This creates a second status event when the report is submitted.

## Solution Design

### 1. New State: `pendingReportForCurrentStatus`

Track when a report is required for an **already-created** status event (not a status transition):

```typescript
const [pendingReportForCurrentStatus, setPendingReportForCurrentStatus] = useState<{
  statusEventId: string;
  reportType: "malfunction" | "general";
} | null>(null);
```

### 2. Fix `handleQuantityReportSubmit`

After `endProductionStatusApi` returns, if target status requires a report:

**Before (broken):**
```typescript
if (pendingReportAfterQuantity) {
  const { statusId, reportType } = pendingReportAfterQuantity;
  setPendingReportAfterQuantity(null);

  if (reportType === "malfunction") {
    setPendingStatusId(statusId);  // ❌ Causes second status event
    setFaultDialogOpen(true);
  }
}
```

**After (fixed):**
```typescript
if (pendingReportAfterQuantity) {
  const { reportType } = pendingReportAfterQuantity;
  setPendingReportAfterQuantity(null);

  // Store the new status event ID for report linking
  // DON'T set pendingStatusId - we're already in this status
  setPendingReportForCurrentStatus({
    statusEventId: response.newStatusEvent.id,
    reportType,
  });

  if (reportType === "malfunction") {
    setFaultDialogOpen(true);  // No pendingStatusId set
  } else if (reportType === "general") {
    setGeneralReportDialogOpen(true);
  }
}
```

### 3. Fix Fault Dialog Submit Handler

**Before (broken):**
```typescript
if (pendingStatusId) {
  // Creates ANOTHER status event
  await createStatusEventWithReportApi({...});
  setCurrentStatus(pendingStatusId);
} else {
  await createReportApi({...});
}
```

**After (fixed):**
```typescript
if (pendingReportForCurrentStatus?.reportType === "malfunction") {
  // Report for already-created status event - just link the report
  await createReportApi({
    type: "malfunction",
    stationId: station.id,
    stationReasonId: faultReason,
    description: faultNote,
    image: faultImage,
    workerId: worker?.id,
    sessionId: sessionId,
    statusEventId: pendingReportForCurrentStatus.statusEventId,  // Link to existing event
  });
  setPendingReportForCurrentStatus(null);
} else if (pendingStatusId) {
  // Normal status change + report (atomic)
  await createStatusEventWithReportApi({...});
  setCurrentStatus(pendingStatusId);
} else {
  // Standalone report
  await createReportApi({...});
}
```

### 4. Make Dialogs Non-Cancellable When Required

**Fault Dialog:**
```typescript
<Dialog
  open={isFaultDialogOpen}
  onOpenChange={(open) => {
    // Don't allow closing if report is required for current status
    if (!open && pendingReportForCurrentStatus?.reportType === "malfunction") {
      return;  // Block close
    }
    setFaultDialogOpen(open);
    if (!open) setPendingStatusId(null);
  }}
>
```

Also hide cancel button when required:
```typescript
{!pendingReportForCurrentStatus && (
  <Button variant="ghost" onClick={() => setFaultDialogOpen(false)}>
    {t("common.cancel")}
  </Button>
)}
```

Same pattern for general report dialog.

### 5. Link Scrap Reports to Production Status Event

Scrap was produced during production, so link to the production event:

```typescript
// Store production event ID before the API call
const productionStatusEventId = currentStatusEventId;

const response = await endProductionStatusApi({...});

// Create scrap report linked to production event
if (result.additionalScrap > 0 && result.scrapNote && station) {
  await createReportApi({
    type: "scrap",
    sessionId,
    stationId: station.id,
    workerId: worker?.id,
    description: result.scrapNote,
    image: result.scrapImage ?? undefined,
    statusEventId: productionStatusEventId,  // Link to production event
  });
}
```

### 6. Timeline: Merge Orphan Status Events

Instead of flagging orphan events, merge them with adjacent events in the timeline display.

**Implementation in `hooks/useSessionTimeline.ts`:**

```typescript
/**
 * Detects if a segment is an "orphan" - a short status event that should be merged.
 * Criteria:
 * - Duration < 30 seconds
 * - No linked report
 * - No production data (quantity = 0 or undefined)
 */
const isOrphanSegment = (seg: TimelineSegment): boolean => {
  const duration = seg.end - seg.start;
  const ORPHAN_THRESHOLD_MS = 30_000; // 30 seconds

  if (seg.reportType) return false;
  if (seg.quantityGood && seg.quantityGood > 0) return false;

  return duration < ORPHAN_THRESHOLD_MS;
};

/**
 * Merges orphan segments with adjacent segments:
 * 1. First pass: Merge orphans with previous segment (left-to-right)
 * 2. Second pass: If first segment is orphan, merge into next segment
 */
```

## Files to Modify

| File | Changes |
|------|---------|
| `app/(worker)/work/page.tsx` | Add state, fix handlers, make dialogs non-cancellable |
| `hooks/useSessionTimeline.ts` | Add orphan detection logic |
| `app/admin/_components/vis-session-timeline.tsx` | Add orphan visual indicator |

## Edge Cases Handled

1. **Leave production → malfunction → submit report**: Creates one status event with linked report ✓
2. **Leave production → malfunction → (can't cancel)**: Dialog is non-cancellable ✓
3. **Job switch with scrap**: Scrap linked to production event ✓
4. **Normal malfunction report (not leaving production)**: Uses existing `pendingStatusId` flow ✓
5. **Standalone report (no status change)**: Uses existing `createReportApi` flow ✓

## Testing Scenarios

1. Enter production → click malfunction → submit quantity (0,0) → submit report → verify single malfunction event with report
2. Enter production → produce 10 good → click malfunction → submit quantity (10,0) → submit report → verify production event has quantities, malfunction has report
3. Enter production → produce 5 good, 2 scrap → click malfunction → submit quantity with scrap note → verify scrap report linked to production event
4. Enter production → click malfunction → try to close report dialog → verify blocked
5. Not in production → click malfunction → cancel report dialog → verify allowed (existing behavior)
