# Admin Management Page – Functionality & Architecture

## Purpose
Manage workers, stations (machines), departments (tags), and worker-station permissions from `/admin/manage` (RTL, Hebrew-first, shadcn/ui).

## UI Structure
- **Route**: `/admin/manage`
- **Tabs**:
  - עובדים (Workers)
  - תחנות (Stations)
- **Filters (Workers tab)**:
  - Search by name/code
  - Department chips (all + specific)
  - Alphabet filter (א–ת)
- **Common UI**:
  - shadcn Cards/Tables/Dialogs, RTL layout, Hebrew labels
  - Error banner for API failures
  - Buttons disabled during submit

### Workers Management
- List workers with: name, code, department badge, assigned station count, active status.
- Actions: Add, Edit, Delete (soft deactivate), Manage station permissions.
- Worker form: full name, worker code (unique), department (free text w/ datalist), language (auto/he/ru), role (worker/admin), active toggle.
- Permissions dialog: checkboxes of stations; add/remove assignments.

### Stations Management
- List stations with: name, code, type, assigned worker count, active status.
- Actions: Add, Edit, Delete (soft deactivate).
- Station form: name, code (unique), station_type (enum), active toggle.

### Departments
- Derived from `workers.department` (no dedicated table).
- Department manager shows badges; “remove” clears that department on all workers.

## Backend Interfaces (Browser APIs)
Located in `lib/api/admin-management.ts` (client fetch wrappers, throw on non-OK):
- Workers: fetch, create, update, delete
- Stations: fetch, create, update, delete
- Worker-stations: fetch assignments, assign, remove
- Departments: fetch list

## Server Routes (Next.js App Router)
- Workers: `app/api/admin/workers` (GET, POST), `app/api/admin/workers/[id]` (PUT, DELETE)
- Stations: `app/api/admin/stations` (GET, POST) and `app/api/admin/stations/[id]` (PUT, DELETE)
- Worker-stations: `app/api/admin/worker-stations` (GET by workerId, POST, DELETE)
- Departments: `app/api/admin/departments` (GET, DELETE to clear a department from workers)

### Route Behaviors & Guards
- Workers:
  - Create/update: validate required fields; enforce `worker_code` uniqueness.
  - Delete: disallow if worker has active sessions; soft-deactivate `is_active=false`.
- Stations:
  - Create/update: validate name/code/type; enforce `code` uniqueness.
  - Delete: block if active sessions exist; remove `worker_stations` assignments; soft-deactivate station (`is_active=false`).
- Assignments:
  - Prevent duplicates; require active worker & station; delete removes the join row.
- Departments:
  - GET unique departments; DELETE sets department to null for all workers with that value.

## Data Layer (Service Client)
`lib/data/admin-management.ts`:
- `fetchAllWorkers` (with counts, filters: department, search, startsWith)
- `fetchAllStations` (with counts)
- `fetchWorkerStationAssignments`
- `fetchDepartmentList`

## Schema Notes
- `workers`: add column `department text` (indexed) + `is_active` boolean
- `stations`: `is_active` boolean
- `worker_stations`: M2M worker ↔ station
- `sessions`: used to prevent deleting workers/stations with active sessions

## UX/Error Handling
- Client wraps mutations in try/catch and surfaces friendly Hebrew messages for known errors:
  - `STATION_HAS_ACTIVE_SESSIONS`
  - `STATION_CODE_EXISTS`
  - `ASSIGNMENT_DELETE_FAILED`
  - `WORKER_CODE_EXISTS`
- Buttons disabled during submissions; loading states on tables.

## Design System
- shadcn/ui components; Tailwind for layout/spacing
- RTL (`dir="rtl"`), Hebrew labels, clean neutral styling consistent with admin dashboard.

## Known Risks / Follow-ups
- Route files previously went missing (notably `app/api/admin/stations/[id]/route.ts`); ensure they exist.
- Error propagation relies on meaningful server error codes; keep them stable.
- Deletion is soft (`is_active=false`); UI could expose an “archive/restore” instead of “delete”.
- No pagination yet; large datasets may need it.
- No optimistic updates; all reload after mutation (simpler, fewer edge cases).

