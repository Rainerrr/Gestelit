# Phase 4: API Endpoints - COMPLETED

## Status: COMPLETED
Completed: 2026-01-09

## Target Branch
- **Branch:** `production-line-implementation`
- **Project Ref:** `yzpwxlgvfkkidjsphfzv`
- **Parent Project:** `nuhbytocovtywdrgwgzk` (Gestelit - main)

## Files Created

### Worker APIs

#### app/api/jobs/[jobId]/allowed-stations/route.ts
`GET /api/jobs/[jobId]/allowed-stations?workerId=xxx`
- Returns stations that are BOTH assigned to worker AND part of job's job_items
- Returns `JOB_NOT_CONFIGURED` error if job has no job_items
- Implements the intersection permission model

### Admin APIs

#### app/api/admin/production-lines/route.ts
- `GET /api/admin/production-lines` - List all lines with stations
  - Query param: `includeInactive=true` to include inactive lines
- `POST /api/admin/production-lines` - Create new line
  - Body: `{ name: string, code?: string, is_active?: boolean }`

#### app/api/admin/production-lines/[id]/route.ts
- `GET /api/admin/production-lines/[id]` - Get line with stations
- `PUT /api/admin/production-lines/[id]` - Update line
  - Body: `{ name?: string, code?: string | null, is_active?: boolean }`
- `DELETE /api/admin/production-lines/[id]` - Delete line
  - Returns `HAS_ACTIVE_JOBS` error if line has active job items

#### app/api/admin/production-lines/[id]/stations/route.ts
- `PUT /api/admin/production-lines/[id]/stations` - Reorder/assign stations
  - Body: `{ stationIds: string[] }` - Ordered array (position = index + 1)
  - Returns `HAS_ACTIVE_JOBS` if line is locked
  - Returns `STATION_ALREADY_IN_LINE` if station is in another line

#### app/api/admin/jobs/[jobId]/items/route.ts
- `GET /api/admin/jobs/[jobId]/items` - List job items with stations and progress
  - Query param: `includeInactive=true`
- `POST /api/admin/jobs/[jobId]/items` - Create job item
  - Body: `{ kind: "station"|"line", station_id?, production_line_id?, planned_quantity: number, is_active?: boolean }`
  - Automatically calls `rebuild_job_item_stations` RPC

#### app/api/admin/jobs/[jobId]/items/[itemId]/route.ts
- `GET /api/admin/jobs/[jobId]/items/[itemId]` - Get job item with full details
- `PUT /api/admin/jobs/[jobId]/items/[itemId]` - Update job item
  - Body: `{ planned_quantity?: number, is_active?: boolean }`
  - Note: kind, station_id, production_line_id cannot be changed after creation
- `DELETE /api/admin/jobs/[jobId]/items/[itemId]` - Delete job item
  - Returns `HAS_ACTIVE_SESSIONS` if item has active sessions

## Files Modified

### app/api/sessions/route.ts
Updated `POST /api/sessions` to:
1. Check if job has job_items configured
2. **Legacy path**: If no job_items, create session with null job_item_id/job_item_station_id
3. **New path**: If job has items:
   - Validate station is allowed for job + worker (intersection)
   - Resolve job_item_id and job_item_station_id for this station
   - Set these fields on the created session

Error responses:
- `STATION_NOT_ALLOWED` - Station not in job's production line
- `JOB_ITEM_NOT_FOUND` - No job item found for this station

### app/api/sessions/quantities/route.ts
Updated `POST /api/sessions/quantities` to:
1. Use `updateSessionQuantitiesAtomic()` instead of `updateSessionTotals()`
2. Handle RPC error codes with user-friendly responses

Error responses:
- `WIP_DOWNSTREAM_CONSUMED` (409) - Cannot reduce quantity, already consumed downstream
- `SESSION_NOT_FOUND` (404) - Session doesn't exist

## API Error Codes

### Worker APIs
| Code | Status | Description |
|------|--------|-------------|
| `WORKER_ID_REQUIRED` | 400 | Missing workerId query param |
| `JOB_NOT_CONFIGURED` | 400 | Job has no job_items |
| `STATION_OCCUPIED` | 409 | Another worker has an active session |
| `STATION_NOT_ALLOWED` | 400 | Station not in job's allowed stations |
| `JOB_ITEM_NOT_FOUND` | 400 | No job item for this station |
| `WIP_DOWNSTREAM_CONSUMED` | 409 | Cannot reduce - consumed downstream |

### Admin APIs
| Code | Status | Description |
|------|--------|-------------|
| `NAME_REQUIRED` | 400 | Production line name required |
| `CODE_ALREADY_EXISTS` | 400 | Production line code already taken |
| `PRODUCTION_LINE_NOT_FOUND` | 404 | Line doesn't exist |
| `HAS_ACTIVE_JOBS` | 409 | Line has active job items |
| `STATION_ALREADY_IN_LINE` | 400 | Station assigned to another line |
| `JOB_NOT_FOUND` | 404 | Job doesn't exist |
| `INVALID_KIND` | 400 | kind must be 'station' or 'line' |
| `INVALID_QUANTITY` | 400 | planned_quantity must be positive |
| `STATION_ID_REQUIRED` | 400 | station_id required for kind='station' |
| `LINE_ID_REQUIRED` | 400 | production_line_id required for kind='line' |
| `JOB_ITEM_NOT_FOUND` | 404 | Job item doesn't exist |
| `HAS_ACTIVE_SESSIONS` | 409 | Job item has active sessions |

## Type Check Results
All API endpoints pass TypeScript compilation. Only remaining error is for an unrelated pre-existing endpoint reference (`/api/jobs/by-number/[jobNumber]`).

## Known Issues
None

## Next Steps
Proceed to Phase 5: Worker Flow UI
- Update `app/(worker)/job/page.tsx` to check for job_items
- Update `app/(worker)/station/page.tsx` to use filtered station fetch
- Update `app/(worker)/work/page.tsx` to handle WIP errors
- Update `contexts/WorkerSessionContext.tsx` with job item state
