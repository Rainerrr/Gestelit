# Phase 3: Production Context Display

**Status:** Completed
**Completed:** 2026-01-13

---

## Overview

Phase 3 implements the production context display system. When workers are in production status with an active job item, they see a banner showing job details, session statistics, and have the ability to switch jobs.

---

## Files Created

| File | Purpose |
|------|---------|
| `components/work/production-context-banner.tsx` | Banner component showing active job info during production |

---

## Files Modified

| File | Changes |
|------|---------|
| `app/(worker)/work/page.tsx` | Added ProductionContextBanner import, isInProduction computed value, handleSwitchJob function, force job selection effect, isForceJobSelection state, banner render, required prop for JobSelectionDialog |

---

## Production Context Banner

The banner displays when:
- Current status machine_state === "production"
- activeJobItem is not null

### Banner Contents

1. **Header Row**
   - "ייצור פעיל" (Active Production) badge
   - Job number and client name
   - "החלף עבודה" (Switch Job) button

2. **Job Item Info**
   - Job item name with kind badge (קו ייצור / תחנה בודדת)

3. **Statistics Grid (5 columns)**
   - מתוכנן (Planned): activeJobItem.plannedQuantity
   - תקין (משמרת) - Good (session): sessionTotals.good
   - פסול (משמרת) - Scrap (session): sessionTotals.scrap
   - סהכ (משמרת) - Total (session): sessionTotals.good + sessionTotals.scrap
   - נותר (עבודה) - Remaining (job): plannedQuantity - sessionTotals.good

### Styling

- Emerald-themed colors for production context
- Responsive grid (2 cols on mobile, 5 on desktop)
- Dark mode support

---

## Force Job Selection Logic

Added effect that detects when worker is in production status without an active job item and forces the job selection dialog open.

### Use Cases

1. Session recovery while in production status but job binding was lost
2. Status changed externally (admin, API) to production without job selection

### Implementation

```typescript
useEffect(() => {
  // Build status dictionary to check machine state
  const dict = buildStatusDictionary(statuses);
  const statusDef = currentStatus
    ? (dict.global.get(currentStatus) ??
       (station?.id ? dict.station.get(station.id)?.get(currentStatus) : undefined))
    : undefined;

  const isProductionStatus = statusDef?.machine_state === "production";

  // If in production without job item, force job selection dialog
  if (isProductionStatus && !activeJobItem && station && !isJobSelectionDialogOpen) {
    setPendingProductionStatusId(currentStatus ?? null);
    setIsForceJobSelection(true);
    setJobSelectionDialogOpen(true);
  }
}, [currentStatus, activeJobItem, statuses, station, isJobSelectionDialogOpen]);
```

### Force Mode Behavior

- `isForceJobSelection` state controls whether dialog can be dismissed
- When `required={true}`, cancel button is hidden and clicking outside doesn't close
- Force mode is reset when job selection completes successfully

---

## Switch Job Functionality

The "Switch Job" button in the banner allows workers to change their active job item while in production.

### Current Behavior (Phase 3)

Opens job selection dialog without requiring quantity reporting first.

### Future Behavior (Phase 4)

Will require quantity reporting for the current production period before allowing job switch.

```typescript
const handleSwitchJob = () => {
  // TODO: In Phase 4, this should trigger quantity reporting before allowing job switch
  setPendingProductionStatusId(currentStatus ?? null);
  setJobSelectionDialogOpen(true);
};
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

Phase 4: Quantity Reporting at Production Exit

1. Create `components/work/quantity-report-dialog.tsx`
2. Create `app/api/status-events/end-production/route.ts`
3. Apply RPC function migration for `end_production_status_atomic`
4. Modify work page to show quantity dialog when leaving production
5. Update "Switch Job" flow to require quantity reporting first
