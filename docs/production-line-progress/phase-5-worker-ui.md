# Phase 5: Worker Flow UI - COMPLETED

## Status: COMPLETED
Completed: 2026-01-09

## Target Branch
- **Branch:** `production-line-implementation`
- **Project Ref:** `yzpwxlgvfkkidjsphfzv`
- **Parent Project:** `nuhbytocovtywdrgwgzk` (Gestelit - main)

## Files Created

### lib/api/client.ts (Modified)
Added new client API wrapper:
- `fetchAllowedStationsForJobApi(jobId, workerId)` - Fetches stations that are BOTH assigned to the worker AND part of the job's job_items (intersection model)

## Files Modified

### app/(worker)/station/page.tsx
Major updates to support production line jobs:

1. **State Management**: Added `errorCode` to station state to differentiate error types
2. **Station Fetching Logic**:
   - If recovering a session → use legacy `fetchStationsWithOccupancyApi` (all worker stations)
   - If normal flow with job → use `fetchAllowedStationsForJobApi` (filtered by job's job_items)
   - Handles `JOB_NOT_CONFIGURED` error when job has no job_items
3. **UI Error State**: Added dedicated error card for `JOB_NOT_CONFIGURED` with:
   - Clear message explaining the issue
   - Description guiding user to contact admin
   - Button to select another job

### app/(worker)/work/page.tsx
Updated production counter error handling:

1. **syncTotals function**:
   - Now accepts `previous` value for state rollback
   - Detects `WIP_DOWNSTREAM_CONSUMED` error
   - Reverts local state to previous value when downstream has consumed WIP
   - Shows user-friendly error message

2. **Counter handlers**:
   - `handleCountDelta` - passes previous value to syncTotals
   - `handleManualCountChange` - passes previous value to syncTotals

### lib/i18n/translations.ts
Added new translations (Hebrew + Russian):

**Station errors:**
- `station.error.jobNotConfigured` - "Job not configured for production"
- `station.error.jobNotConfiguredDesc` - Detailed explanation
- `station.error.selectAnotherJob` - Button text

**Work errors:**
- `work.error.wipDownstreamConsumed` - "Cannot reduce quantity - already consumed by downstream station"

## Worker Flow Behavior

### Normal Flow (Job with job_items)
1. Worker logs in → selects job
2. Station page calls `fetchAllowedStationsForJobApi(jobId, workerId)`
3. API returns intersection of: worker's assigned stations ∩ job's job_item_stations
4. Worker sees only stations relevant to both them and the job
5. Session created with `job_item_id` and `job_item_station_id`

### Legacy/Unconfigured Job Flow
1. Worker logs in → selects job that has no job_items
2. Station page calls `fetchAllowedStationsForJobApi(jobId, workerId)`
3. API returns `JOB_NOT_CONFIGURED` error
4. Worker sees amber warning card with:
   - Message: "Job not configured for production"
   - Description: "Contact admin to configure job items"
   - Button: "Select another job"

### Session Recovery Flow
1. Worker with active session logs in
2. Station page shows recovery dialog
3. Uses legacy `fetchStationsWithOccupancyApi` (all worker stations displayed)
4. Worker can resume or abandon session

### WIP Error Handling
1. Worker tries to decrease good count
2. API call fails with `WIP_DOWNSTREAM_CONSUMED`
3. Local state reverts to previous value
4. Error message: "Cannot reduce quantity - already consumed by downstream station"

## Type Check Results
All changes pass TypeScript compilation. Only remaining error is pre-existing unrelated endpoint reference.

## Known Issues
None

## Next Steps
Proceed to Phase 6: Admin UI
- Create production lines management page
- Update job detail page with job items section
- Add dashboard enhancements for WIP visualization
