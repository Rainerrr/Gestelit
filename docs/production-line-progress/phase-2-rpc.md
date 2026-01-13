# Phase 2: RPC Functions - COMPLETED

## Status: COMPLETED
Completed: 2026-01-08

## Target Branch
- **Branch:** `production-line-implementation`
- **Project Ref:** `yzpwxlgvfkkidjsphfzv`
- **Parent Project:** `nuhbytocovtywdrgwgzk` (Gestelit - main)

## Migrations Applied
- [x] `20260108215309_rpc_rebuild_job_item_stations.sql` - Idempotent setup function for job items
- [x] `20260108215429_rpc_update_session_quantities_v2.sql` - Core WIP management function (initial)
- [x] `20260108215552_view_session_wip_accounting.sql` - Helper view for originated vs pulled tracking
- [x] `20260108215847_fix_update_session_quantities_v2.sql` - Fixed FOR UPDATE with LEFT JOIN issue

## RPC Functions Created

### 1. `rebuild_job_item_stations(job_item_id UUID)`
Idempotent setup function that:
- For `kind='station'`: Creates 1 step (position=1, is_terminal=true)
- For `kind='line'`: Expands from production_line_stations, last step is_terminal=true
- Creates `wip_balances` row for each step
- Upserts `job_item_progress` row (completed_good=0)

### 2. `update_session_quantities_atomic_v2(session_id, total_good, total_scrap)`
Core atomic WIP management function:

**Returns:** `session_update_result` type with fields:
- `success` (boolean)
- `error_code` (text) - possible values: `SESSION_NOT_FOUND`, `JOB_ITEM_STATION_NOT_FOUND`, `WIP_BALANCE_NOT_FOUND`, `WIP_DOWNSTREAM_CONSUMED`
- `session_id`, `total_good`, `total_scrap`

**Legacy path:** If session has no `job_item_id`, performs simple UPDATE (backwards compatible)

**Increase path (delta_good > 0):**
1. If upstream exists: pull = min(delta, upstream_available)
2. Decrement upstream balance
3. Record pull in `wip_consumptions` ledger
4. Increment current step balance
5. If terminal: increment `job_item_progress.completed_good`

**Decrease path (delta_good < 0):**
1. Check current step balance >= reduction (else returns `WIP_DOWNSTREAM_CONSUMED`)
2. Decrement current step balance
3. If terminal: decrement `completed_good`
4. Calculate originated vs pulled amounts
5. Reverse originated first (no ledger change)
6. Reverse pulled LIFO (return to upstream, update/delete ledger)

### 3. `v_session_wip_accounting` View
Helper view showing per-session WIP origin:
- `session_id`, `job_item_id`, `job_item_station_id`
- `total_good` - session's total good count
- `pulled_good` - amount consumed from upstream
- `originated_good` - amount created at this step (not pulled)

## Manual Tests Passed

### Test 1: Single-station job_item rebuild
- [x] Creates 1 job_item_station with position=1, is_terminal=true
- [x] Creates 1 wip_balance with good_available=0
- [x] Creates job_item_progress with completed_good=0

### Test 2: Production line (3 stations) job_item rebuild
- [x] Creates 3 job_item_stations with positions 1, 2, 3
- [x] Only position 3 has is_terminal=true
- [x] Creates 3 wip_balances, all with good_available=0
- [x] Creates job_item_progress with completed_good=0

### Test 3: Position 1 increase (origination)
- [x] Session at position 1 adds 10 good
- [x] Position 1 balance = 10 (all originated)
- [x] No wip_consumptions records (no upstream)
- [x] completed_good = 0 (not terminal)

### Test 4: Position 2 increase (upstream pull)
- [x] Session at position 2 adds 5 good
- [x] Position 1 balance = 5 (10 - 5 pulled)
- [x] Position 2 balance = 5
- [x] wip_consumptions: 5 good_used from position 1
- [x] completed_good = 0 (not terminal)

### Test 5: Position 3 (terminal) increase
- [x] Session at position 3 (terminal) adds 3 good
- [x] Position 2 balance = 2 (5 - 3 pulled)
- [x] Position 3 balance = 3
- [x] wip_consumptions: 3 good_used from position 2
- [x] **completed_good = 3** (terminal station increments progress)

### Test 6: v_session_wip_accounting view
- [x] Position 1 session: total=10, pulled=0, originated=10
- [x] Position 2 session: total=5, pulled=5, originated=0
- [x] Position 3 session: total=3, pulled=3, originated=0

## Files Created
- `supabase/migrations/20260108215309_rpc_rebuild_job_item_stations.sql`
- `supabase/migrations/20260108215429_rpc_update_session_quantities_v2.sql`
- `supabase/migrations/20260108215552_view_session_wip_accounting.sql`
- `supabase/migrations/20260108215847_fix_update_session_quantities_v2.sql`

## Database Objects Created
| Object | Type | Description |
|--------|------|-------------|
| `rebuild_job_item_stations(UUID)` | Function | Idempotent job item setup |
| `update_session_quantities_atomic_v2(UUID, INT, INT)` | Function | Atomic WIP management |
| `session_update_result` | Type | Return type for update function |
| `v_session_wip_accounting` | View | Shows originated vs pulled per session |

## Known Issues
- **Fixed:** Initial `update_session_quantities_atomic_v2` had `FOR UPDATE` with `LEFT JOIN` which PostgreSQL doesn't support. Fixed by separating the session lock from the job_item_stations fetch.

## Next Steps
Proceed to Phase 3: Data Layer (`lib/data/`)
- Create `lib/data/production-lines.ts` - Production line CRUD
- Create `lib/data/job-items.ts` - Job item CRUD with RPC calls
- Update `lib/data/stations.ts` - Add `fetchAllowedStationsForJobAndWorker()`
- Update `lib/data/sessions.ts` - Add job_item fields, atomic quantities
- Update `lib/types.ts` - Add new types
