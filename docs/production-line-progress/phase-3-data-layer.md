# Phase 3: Data Layer - COMPLETED

## Status: COMPLETED
Completed: 2026-01-09

## Target Branch
- **Branch:** `production-line-implementation`
- **Project Ref:** `yzpwxlgvfkkidjsphfzv`
- **Parent Project:** `nuhbytocovtywdrgwgzk` (Gestelit - main)

## Files Created

### lib/data/production-lines.ts
Production line CRUD operations:
- `fetchAllProductionLines(options?)` - Get all lines with optional station details
- `getProductionLineById(id)` - Get single line with stations
- `createProductionLine(payload)` - Create new line
- `updateProductionLine(id, payload)` - Update line details
- `deleteProductionLine(id)` - Delete line (checks for active jobs)
- `isProductionLineLocked(lineId)` - Check if line has active job items
- `updateProductionLineStations(lineId, stationIds[])` - Reorder/assign stations
- `fetchUnassignedStations()` - Get stations not in any line
- `fetchAvailableStationsForLine(lineId?)` - Get stations available for assignment

### lib/data/job-items.ts
Job item CRUD and WIP operations:
- `fetchJobItemsForJob(jobId, options?)` - Get all items for a job
- `getJobItemById(id)` - Get single item with full details
- `getJobItemStations(jobItemId)` - Get expanded steps for an item
- `getJobAllowedStationIds(jobId)` - Get all station IDs for a job (union of all items)
- `jobHasJobItems(jobId)` - Check if job has any active items
- `createJobItem(payload)` - Create item and call `rebuild_job_item_stations` RPC
- `updateJobItem(id, payload)` - Update planned_quantity or is_active
- `deleteJobItem(id)` - Delete item (checks for active sessions)
- `jobItemHasActiveSessions(jobItemId)` - Check for active sessions
- `getWipBalancesForJobItem(jobItemId)` - Get all WIP balances for an item
- `getWipBalanceForStep(jobItemId, jobItemStationId)` - Get WIP for specific step
- `resolveJobItemForStation(jobId, stationId)` - Find job item + step for a station
- `getUpstreamWipBalance(jobItemId, currentPosition)` - Get upstream step's WIP

## Files Modified

### lib/types.ts
Added new types:
- `JobItemKind` - `"station" | "line"`
- `ProductionLine` - Production line entity
- `ProductionLineStation` - Junction table with position
- `ProductionLineWithStations` - Line with expanded stations
- `JobItem` - Job item entity with optional relations
- `JobItemStation` - Expanded step with is_terminal flag
- `JobItemProgress` - Terminal completion tracking
- `JobItemWithDetails` - Job item with stations and progress
- `WipBalance` - Per-step WIP balance
- `WipConsumption` - Consumption ledger entry
- `SessionWipAccounting` - View type for pulled/originated
- `SessionUpdateResult` - RPC return type

Extended `Session` interface:
- `job_item_id?: string | null`
- `job_item_station_id?: string | null`

### lib/data/stations.ts
Added functions for job + worker intersection:
- `fetchAllowedStationsForJobAndWorker(jobId, workerId)` - Returns stations that are BOTH assigned to worker AND part of job's job_items
- `isStationAllowedForJobAndWorker(stationId, jobId, workerId)` - Server-side validation

### lib/data/sessions.ts
Updated for production line support:
- Extended `SessionPayload` type with `job_item_id` and `job_item_station_id`
- Updated `createSession()` to accept and store job item references
- Added `updateSessionQuantitiesAtomic(sessionId, totalGood, totalScrap)` - Calls `update_session_quantities_atomic_v2` RPC
- Added `getSessionWipAccounting(sessionId)` - Query `v_session_wip_accounting` view

## Type Check Results
All data layer files pass TypeScript compilation. Remaining errors are for API routes that will be created in Phase 4:
- `.next/types/validator.ts` - References to `/api/jobs/[jobId]/allowed-stations` (Phase 4)
- `.next/types/validator.ts` - References to `/api/jobs/by-number/[jobNumber]` (Phase 4)

## Key Design Decisions

### Intersection Model for Permissions
The `fetchAllowedStationsForJobAndWorker()` function implements the intersection model:
- Workers see only stations they're assigned to AND that are part of the job's production line(s)
- This ensures workers can only work on stations relevant to both their assignment and the current job

### Job Item Resolution
The `resolveJobItemForStation()` function maps a (job_id, station_id) pair to the corresponding job_item and job_item_station. This is used during session creation to set the `job_item_id` and `job_item_station_id` on the session.

### Atomic Quantities Update
The `updateSessionQuantitiesAtomic()` function wraps the `update_session_quantities_atomic_v2` RPC. It returns a `SessionUpdateResult` that includes:
- `success: boolean` - Whether the update succeeded
- `error_code?: string` - Error code if failed (e.g., `WIP_DOWNSTREAM_CONSUMED`)
- Session totals

This allows the API layer to handle errors gracefully and return user-friendly messages.

### Legacy Session Support
All new functions gracefully handle legacy sessions (those without `job_item_id`):
- `updateSessionQuantitiesAtomic()` falls back to simple UPDATE for legacy sessions (handled by RPC)
- `getSessionWipAccounting()` returns null for legacy sessions
- `createSession()` accepts null for job item fields

## Known Issues
None

## Next Steps
Proceed to Phase 4: API Endpoints
- Create `GET /api/jobs/[jobId]/allowed-stations` endpoint
- Update `POST /api/sessions` to validate and set job item references
- Update `POST /api/sessions/quantities` to use atomic RPC
- Create admin API endpoints for production lines and job items
