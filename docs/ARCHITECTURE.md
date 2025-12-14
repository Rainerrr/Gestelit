# Gestelit Work Monitor – Architecture Overview

> Updated: 2025‑12‑10  
> Context: Next.js 16 + React 19 (App Router), Tailwind, shadcn/ui, Supabase

## 1. High-Level Structure

- **Framework**: Next.js App Router under `app/`.
- **UI System**: TailwindCSS + shadcn/ui components (see `components/ui/`).
- **State & Context**: 
  - `contexts/WorkerSessionContext.tsx` stores worker/station/job/session state plus production totals and checklist completion flags.
  - `contexts/LanguageContext.tsx` manages language preferences (Hebrew/Russian/auto).
- **Data Layer**: Supabase (Postgres + Realtime). Browser client (`lib/supabase/client.ts`) for frontend; service client for API routes.
- **API Routes**: Located under `app/api/**` and act as the backend layer (session management, checklists, station-level reasons, admin operations, etc.).
- **i18n**: Minimal translation helper in `lib/i18n/translations.ts` with Hebrew-first copy.

## 2. Worker Flow (App Router under `app/(worker)/`)

1. **Login (`/login`)** 
   - Worker enters worker code.
   - Calls `POST /api/workers/login`.
   - Worker record stored in context via `useWorkerSession`.
   - Checks for active session via `GET /api/workers/active-session` (recovery flow).

2. **Station select (`/station`)** 
   - Loads stations assigned to worker via `GET /api/stations?workerId=`.
   - Worker selects station; persists station info in context.

3. **Job input (`/job`)**  
   - Worker enters job number.
   - Calls `POST /api/jobs` with `workerId`, `stationId`, `jobNumber`.
   - API ensures job exists (`getOrCreateJob`) + creates a `sessions` row (`createSession`).
   - Context stores `sessionId` (and last-known `started_at` if available).

4. **Opening checklist (`/checklist/start`)**
   - Loads checklist via `GET /api/checklists?stationId=&kind=start`.
   - On submit:
     - Validates client-side that all required checklist items are checked.
     - Calls `POST /api/checklists/responses` with `sessionId`, `kind=start`, `responses`.
     - Server marks session officially started via `markSessionStarted` and sets `start_checklist_completed = true` on the `sessions` row.
     - Response returns the session; UI stores `sessionStartedAt`.
     - Fires `POST /api/status-events` with default `"stopped"` state, updates context, and routes to `/work`.
   - Note: Individual checklist answers are not persisted; only the completion flag.

5. **Active Work (`/work`)**
   - Timer (`WorkTimer`) uses `sessionStartedAt` to render absolute elapsed time (HH:MM:SS).
   - Status buttons call `POST /api/status-events` and optimistically update `currentStatus` in context.
   - Production counters call `POST /api/sessions/quantities` to update `total_good` and `total_scrap`.
   - Fault status opens dialog to select station reason and add note/image via `POST /api/malfunctions`.
   - `useSessionHeartbeat` hook pings `POST /api/sessions/heartbeat` every 15 seconds to keep `last_seen_at` fresh.
   - Uses `navigator.sendBeacon` on page unload for reliable heartbeat.

6. **Closing checklist (`/checklist/end`)**
   - Loads checklist via `GET /api/checklists?stationId=&kind=end`.
   - On submit:
     - Calls `POST /api/checklists/responses` with `kind=end`.
     - Server sets `end_checklist_completed = true`.
     - Calls `POST /api/sessions/complete` to mark session as completed.
   - Flow then resets session (via context `reset`) and sends worker back to station picker.

## 3. Admin Dashboard (`/admin`)

### 3.1 Access & Authentication

- **Access**: Landing page (`app/page.tsx`) exposes a dialog with mock password `1234`. When correct, it sets `localStorage.isAdmin` and redirects to `/admin`.
- **Guard**: `hooks/useAdminGuard.ts` watches `localStorage` via `useSyncExternalStore` and redirects unauthorized visitors to `/`.
- **Layout**: `app/admin/_components/admin-dashboard.tsx` mimics the shadcn dashboard (sidebar + header + KPI row + content grid).

### 3.2 Main Dashboard (`/admin`)

**Data Source**: `lib/data/admin-dashboard.ts`.

- `fetchActiveSessions()` – `sessions` join with workers/stations/jobs + derived status via latest `status_events`.
- `fetchRecentSessions()` – Completed sessions for the history table.
- Realtime:
  - `subscribeToActiveSessions()` listens to `sessions` inserts/updates where `status='active'`.
  - `sessions.current_status` mirrors the latest `status_events` row so the dashboard refreshes via a single channel.

**UI Components**:
- `KpiCards`: counts for total active jobs, machines in production, machines stopped/faulted, total good output.
- `ActiveSessionsTable`: detailed table with color-coded status badges and live HH:MM:SS runtime. Clicking a row opens `SessionTimelineDialog` showing the full status timeline.
- `StatusCharts`: Recharts vertical bar charts for status distribution + throughput by station.
- `RecentSessionsTable`: shows recently completed sessions (duration, finish time, last status, good/scrap).

**Utilities**: 
- "סגירת כל העבודות הפעילות" button hits `POST /api/admin/sessions/close-all` (service key route) to force-complete all active sessions for QA/demo resets.
- `useIdleSessionCleanup` hook (optional) triggers `GET /api/cron/close-idle-sessions` every 10 seconds to proactively close idle sessions.

### 3.3 History Dashboard (`/admin/history`)

**Purpose**: View and analyze completed sessions with filtering, charts, and detailed timelines.

**Components**: `app/admin/_components/history-dashboard.tsx`

**Features**:
- **Filters** (`HistoryFilters`): Filter by worker, station, job number. Reset button clears all filters.
- **Sessions Table** (`RecentSessionsTable`):
  - Sortable columns: job number, station, worker, end time, duration, status, good/scrap totals.
  - Row selection with checkboxes (select all/none).
  - Delete selected sessions via `POST /api/admin/sessions/delete`.
  - Click row to open `SessionTimelineDialog`.
- **Charts** (`HistoryCharts`):
  - **Status Distribution**: Bar chart showing total time spent in each status (calculated from `status_events`).
  - **Monthly Throughput**: Paginated bar chart (5 jobs per page) showing good/scrap/planned quantities per job for selected month.
  - Month navigation (prev/next) with Hebrew month labels.
- **Data Loading**:
  - `fetchRecentSessions()` with filters (limit 120).
  - `fetchStatusEventsBySessionIds()` to calculate status durations.
  - `fetchMonthlyJobThroughput()` for throughput charts.

### 3.4 Session Timeline

**Component**: `app/admin/_components/session-timeline.tsx`  
**Hook**: `hooks/useSessionTimeline.ts`

**Features**:
- Visual timeline bar showing status segments with color coding.
- Collapses rapid status switches (<15 minutes) into markers.
- Time ticks at appropriate intervals (15min/30min/1h/2h/4h based on total duration).
- Status change markers at top with timestamps.
- "עכשיו" indicator for active sessions.
- Realtime updates via Supabase subscription to `status_events` table.
- Handles missing data gracefully.

**Usage**: Displayed in `SessionTimelineDialog` when clicking a session row in admin tables.

### 3.5 Admin Management (`/admin/manage`)

**Purpose**: Manage workers, stations (machines), departments (tags), and worker-station permissions.

**UI Structure**:
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

**Workers Management**:
- List workers with: name, code, department badge, assigned station count, active status.
- Actions: Add, Edit, Delete (soft deactivate), Manage station permissions.
- Worker form: full name, worker code (unique), department (free text w/ datalist), language (auto/he/ru), role (worker/admin), active toggle.
- Permissions dialog: checkboxes of stations; add/remove assignments.

**Stations Management**:
- List stations with: name, code, type, assigned worker count, active status.
- Actions: Add, Edit, Delete (soft deactivate).
- Station form: name, code (unique), station_type (enum), active toggle.
- Checklist management: Edit start/end checklists per station (JSON editor).

**Departments**:
- Derived from `workers.department` (no dedicated table).
- Department manager shows badges; "remove" clears that department on all workers.

**Backend Interfaces**: `lib/api/admin-management.ts` (client fetch wrappers, throw on non-OK):
- Workers: fetch, create, update, delete
- Stations: fetch, create, update, delete
- Worker-stations: fetch assignments, assign, remove
- Departments: fetch list

**Server Routes**:
- Workers: `app/api/admin/workers` (GET, POST), `app/api/admin/workers/[id]` (PUT, DELETE)
- Stations: `app/api/admin/stations` (GET, POST) and `app/api/admin/stations/[id]` (PUT, DELETE)
- Worker-stations: `app/api/admin/worker-stations` (GET by workerId, POST, DELETE)
- Departments: `app/api/admin/departments` (GET, DELETE to clear a department from workers)
- Station types: `app/api/admin/station-types` (GET enum values)

**Route Behaviors & Guards**:
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

**Data Layer**: `lib/data/admin-management.ts`:
- `fetchAllWorkers` (with counts, filters: department, search, startsWith)
- `fetchAllStations` (with counts)
- `fetchWorkerStationAssignments`
- `fetchDepartmentList`

## 4. Supabase Schema (key tables)

### 4.1 Core Tables

- **`workers`** – worker metadata:
  - `id`, `worker_code` (unique), `full_name`, `language` (he/ru/auto), `role` (worker/admin), `is_active`, `department` (text, nullable), timestamps.
- **`stations`** – station definitions:
  - `id`, `name`, `code` (unique), `station_type` (enum), `is_active`, `start_checklist` (jsonb), `end_checklist` (jsonb), `station_reasons` (jsonb array, always includes built-in general malfunction), timestamps.
- **`jobs`** – job metadata:
  - `id`, `job_number` (unique), `customer_name`, `description`, `planned_quantity`, timestamps.
- **`sessions`** – active work sessions (links worker/station/job):
  - `id`, `worker_id`, `station_id`, `job_id`, `status` (active/completed/aborted), `started_at`, `ended_at`, `total_good`, `total_scrap`, `start_checklist_completed`, `end_checklist_completed`, `last_seen_at`, `forced_closed_at`, `current_status`, `last_status_change_at`, `worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`, timestamps.
- **`status_events`** – timeline of state changes:
  - `id`, `session_id`, `status` (setup/production/stopped/fault/waiting_client/plate_change), `station_reason_id` (string, references station's `station_reasons` JSON), `note`, `image_url`, `started_at`, `ended_at`, timestamps.
- **`malfunctions`** – malfunction records:
  - `id`, `station_id`, `station_reason_id` (string), `description`, `image_url`, timestamps.
- **`worker_stations`** – M2M worker ↔ station assignments:
  - `id`, `worker_id`, `station_id`, unique constraint, timestamps.

### 4.2 Enums

- `worker_role`: 'worker', 'admin'
- `station_type`: 'prepress', 'digital_press', 'offset', 'folding', 'cutting', 'binding', 'shrink', 'lamination', 'other'
- `session_status`: 'active', 'completed', 'aborted'
- `checklist_kind`: 'start', 'end'
- `status_event_state`: 'setup', 'production', 'stopped', 'fault', 'waiting_client', 'plate_change'

### 4.3 Schema Notes

- **Station-scoped reasons**: Each station owns `station_reasons` JSON array. Built-in default: `{ id: "general-malfunction", label_he: "תקלת כללית", label_ru: "Общая неисправность", is_active: true }`. Always included in active reasons list.
- **Session snapshots**: `worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot` preserve names at session creation for historical accuracy.
- **Status mirroring**: `sessions.current_status` and `last_status_change_at` mirror the latest `status_events` row for efficient realtime queries (single table subscription).

## 5. API Routes Reference

### 5.1 Worker Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/workers/login` | POST | Authenticate worker by code | `fetchWorkerByCode`, returns worker or 404 |
| `/api/workers/active-session` | GET | Get active session for worker (recovery) | `fetchActiveSessionForWorker`, returns session with job/station or null |

### 5.2 Station Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/stations` | GET | Get stations for worker | `fetchStationsForWorker`, requires `?workerId=` |

### 5.3 Job & Session Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/jobs` | POST | Create/get job + create session | `getOrCreateJob`, `createSession` |
| `/api/sessions/complete` | POST | Mark session as completed | `completeSession`, sets `status=completed`, `ended_at` |
| `/api/sessions/quantities` | POST | Update production totals | `updateSessionTotals`, updates `total_good`/`total_scrap` |
| `/api/sessions/heartbeat` | POST | Update `last_seen_at` | `recordSessionHeartbeat`, accepts JSON/text payload |
| `/api/sessions/abandon` | POST | Abandon session (worker-initiated) | Marks session as aborted |

### 5.4 Checklist Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/checklists` | GET | Fetch checklist for station | `fetchChecklist`, requires `?stationId=&kind=` |
| `/api/checklists/responses` | POST | Submit checklist responses | `markSessionStarted` (start) or `markEndChecklistCompleted` (end), sets flags only |

### 5.5 Status & Malfunction Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/status-events` | POST | Create status event | `startStatusEvent`, closes open event, inserts new, mirrors on `sessions` |
| `/api/reasons` | GET | Get active reasons for station | `getStationActiveReasons`, requires `?stationId=`, returns station's active reasons |
| `/api/malfunctions` | POST | Create malfunction record | Inserts into `malfunctions` table |

### 5.6 Admin Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/admin/workers` | GET, POST | List/create workers | `fetchAllWorkers`, validates uniqueness |
| `/api/admin/workers/[id]` | PUT, DELETE | Update/delete worker | Soft delete if no active sessions |
| `/api/admin/stations` | GET, POST | List/create stations | `fetchAllStations`, validates uniqueness |
| `/api/admin/stations/[id]` | PUT, DELETE | Update/delete station | Soft delete if no active sessions |
| `/api/admin/worker-stations` | GET, POST, DELETE | Manage worker-station assignments | Prevents duplicates |
| `/api/admin/departments` | GET, DELETE | List/clear departments | Derived from workers table |
| `/api/admin/station-types` | GET | Get station type enum values | Returns enum options |
| `/api/admin/sessions/close-all` | POST | Force-close all active sessions | Service key required, for demo resets |
| `/api/admin/sessions/delete` | POST | Delete selected sessions | Bulk delete by IDs |

### 5.7 Cron Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/cron/close-idle-sessions` | GET | Close sessions idle >5 minutes | Can be called manually or by Supabase cron, closes sessions with `forced_closed_at` |

## 6. Hooks & Utilities

### 6.1 Session Hooks

- **`useWorkerSession`** (`contexts/WorkerSessionContext.tsx`): Main context hook providing worker, station, job, session state, totals, status, and actions (setStatus, updateTotals, reset).
- **`useSessionHeartbeat`** (`hooks/useSessionHeartbeat.ts`): Pings `/api/sessions/heartbeat` every 15 seconds, uses `navigator.sendBeacon` on unload.
- **`useSessionTimeline`** (`hooks/useSessionTimeline.ts`): Loads and subscribes to `status_events` for a session, normalizes into timeline segments, handles realtime updates.
- **`useIdleSessionCleanup`** (`hooks/useIdleSessionCleanup.ts`): Optional hook that triggers `/api/cron/close-idle-sessions` every 10 seconds (typically used in admin dashboard).

### 6.2 Admin Hooks

- **`useAdminGuard`** (`hooks/useAdminGuard.ts`): Watches `localStorage.isAdmin` via `useSyncExternalStore`, redirects unauthorized users.

### 6.3 Translation Hook

- **`useTranslation`** (`hooks/useTranslation.ts`): Wraps `LanguageContext` to provide `t(key)` function and current language.

## 7. Data Layer Architecture

### 7.1 Service Layer (`lib/data/**`)

Centralizes Supabase queries for reuse across API routes and edge functions:

- **`sessions.ts`**: `createSession`, `markSessionStarted`, `completeSession`, `updateSessionTotals`, `recordSessionHeartbeat`, `fetchActiveSessionForWorker`, `startStatusEvent` (closes open events, mirrors status).
- **`admin-dashboard.ts`**: `fetchActiveSessions`, `fetchRecentSessions`, `fetchStatusEventsBySessionIds`, `fetchMonthlyJobThroughput`, `subscribeToActiveSessions`.
- **`admin-management.ts`**: `fetchAllWorkers`, `fetchAllStations`, `fetchWorkerStationAssignments`, `fetchDepartmentList`.
- **`workers.ts`**: `fetchWorkerByCode`, `listWorkers`.
- **`stations.ts`**: `fetchStationsForWorker`, `getStationActiveReasons`.
- **`jobs.ts`**: `getOrCreateJob`.
- **`checklists.ts`**: `fetchChecklist`.

### 7.2 Client API Layer (`lib/api/**`)

Browser-side fetch wrappers with consistent error handling:

- **`client.ts`**: Worker-facing APIs (`createJobSessionApi`, `fetchChecklistApi`, `startStatusEventApi`, `updateSessionTotalsApi`, `completeSessionApi`, `createMalfunctionApi`, etc.).
- **`admin-management.ts`**: Admin CRUD APIs (`fetchWorkersAdminApi`, `createWorkerApi`, `updateWorkerApi`, `deleteWorkerApi`, etc.).

### 7.3 Supabase Clients

- **Browser client** (`lib/supabase/client.ts`): `getBrowserSupabaseClient()` – singleton for frontend, supports Realtime subscriptions.
- **Service client**: `createServiceSupabase()` – service-role client for API routes (bypasses RLS).

## 8. Realtime Architecture

### 8.1 Subscriptions

- **Active Sessions** (`subscribeToActiveSessions`): Listens to `sessions` table inserts/updates where `status='active'`. Triggers full refetch on change.
- **Session Timeline** (`useSessionTimeline`): Subscribes to `status_events` for a specific `session_id`. Updates timeline segments in real time.

### 8.2 Status Mirroring

- When a status event is created/updated, `sessions.current_status` and `last_status_change_at` are updated automatically (via `startStatusEvent` helper).
- This allows admin dashboards to subscribe to a single table (`sessions`) instead of joining `status_events`.

## 9. Session Lifecycle & Automation

### 9.1 Heartbeat System

- **Client**: `useSessionHeartbeat` pings `/api/sessions/heartbeat` every 15 seconds while `/work` is active.
- **Fallback**: `navigator.sendBeacon` on page unload ensures heartbeat even if tab closes.
- **Server**: `recordSessionHeartbeat` updates `sessions.last_seen_at`.

### 9.2 Idle Session Cleanup

- **Edge Function**: `supabase/functions/close-idle-sessions/index.ts` runs on Supabase schedule (or can be triggered via `/api/cron/close-idle-sessions`).
- **Logic**: Closes sessions where `last_seen_at` is older than 5 minutes:
  - Ends any unfinished status events.
  - Inserts a `"stopped"` event with `note: "auto-abandon"`.
  - Marks `status="completed"`, sets `forced_closed_at`, and `current_status="stopped"` on `sessions`.
- **Recovery**: Worker login checks for active session; if found, shows "חזרה לעבודה פעילה" dialog with 5-minute grace timer.

### 9.3 Session Recovery

- **API**: `GET /api/workers/active-session` returns any active session for a worker.
- **UI**: Login page checks for active session and offers resume option with countdown timer.

## 10. Recent Architecture Changes (Dec 10, 2025)

1. **Station-scoped malfunction reasons**
   - `reasons` table removed; each station owns `station_reasons` JSON with the built-in default `{ id: "general-malfunction", label_he: "תקלת כללית", label_ru: "Общая לאисправность", is_active: true }`.
   - `malfunctions` and `status_events` now reference `station_reason_id` (string) instead of FK `reason_id`.
   - `/api/reasons` is station-scoped (`?stationId=`) and returns active station reasons (default included).
   - Admin "סוגי תקלות" list edits station-level reasons; default reason is hidden but injected on save with server-side validation.

2. **Admin Dashboard MVP (Dec 3, 2025)**  
   - Added `/admin` route, RTL layout, KPIs, realtime active sessions table, charts, and recent sessions panel.  
   - Hooked to Supabase Realtime for `sessions` and `status_events`.

3. **History Dashboard (Dec 2025)**
   - Added `/admin/history` route with filtering, sortable sessions table, status distribution charts, monthly throughput charts, and session timeline dialogs.
   - Bulk delete functionality for selected sessions.

4. **Admin Management (Dec 2025)**
   - Added `/admin/manage` route for CRUD operations on workers, stations, worker-station assignments, and departments.
   - Station checklist editing via JSON editor.
   - Department management (derived from workers table).

5. **Session Timeline (Dec 2025)**
   - Visual timeline component with status segments, time ticks, and realtime updates.
   - Collapses rapid status switches for readability.
   - Integrated into admin dashboard and history dashboard via dialogs.

6. **Mock Admin Access**  
   - Landing page "כניסת מנהל" dialog with password `1234` storing `localStorage.isAdmin`.

7. **Timer Synchronization**  
   - Worker timer now uses persisted `sessionStartedAt`.  
   - Admin timer uses server-side `started_at` with 1-second updates.

8. **Checklist & Session Start Flow**  
   - Start checklist submission now:  
     1. Validates client-side that all required checklist items are checked.  
     2. Server marks session officially started via `markSessionStarted` and sets `start_checklist_completed = true` on the `sessions` row.  
     3. Client sets start timestamp and sends default `"stopped"` status event.  
   - No individual checklist answers are persisted; only the fact that the start checklist was completed.

9. **Realtime Status Reliability**  
   - Restored `status_events` subscription to avoid missing state changes; admin now responds instantly when workers switch statuses without needing production count updates.

10. **Force-Close Utility**  
    - `/api/admin/sessions/close-all` to terminate stuck sessions during demos/tests.
    - `/api/admin/sessions/delete` for bulk deletion of completed sessions.

11. **Session Lifecycle Guard**  
    - Workers ping `/api/sessions/heartbeat` every 15 seconds and send `navigator.sendBeacon` on tab close so `last_seen_at` stays updated.  
    - Supabase cron (`close-idle-sessions`) closes sessions not seen for more than 5 minutes, marks `forced_closed_at`, and updates status to `stopped`.  
    - Worker login screen offers "חזרה לעבודה פעילה" dialog with 5-minute timer to resume open work before it auto-closes.  
    - Every status change updates `current_status` and `last_status_change_at` fields on `sessions` table so admin screens receive Realtime data through a single channel.

12. **Session Snapshots**
    - Added snapshot columns (`worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`) to preserve names at session creation for historical accuracy.

## 11. Known Issues / Follow-ups

- **Lint noise**: Several legacy `.cjs` scripts still use `require`, triggering ESLint errors.
- **Security**: Admin auth remains mock-only (localStorage flag). Real RBAC/auth still needed.
- **Schema drift**: Recent attempts to add `current_status` column were reverted; status derivation still relies on `status_events`. If you reintroduce a column, ensure Supabase migrations run in all environments.
- **Realtime load**: `subscribeToActiveSessions` triggers full refetches on every insert/update. Consider differential updates or edge functions if scaling becomes an issue.
- **Testing**: No automated tests yet; all flows rely on manual verification.
- **Department field**: `workers.department` is a free-text field (not a foreign key). Consider normalization if departments need their own metadata.
- **Pagination**: History dashboard and admin management tables don't paginate; may need pagination for large datasets.

## 12. Tips for Next Agent

- Keep RTL/Hebrew-first UI rules in mind (dir="rtl", Hebrew labels, no escaped text).
- Prefer shadcn ui primitives + Tailwind; avoid custom CSS files.
- When touching supabase data, confirm migrations match schema (see `supabase/schema.sql`).
- Reuse existing hooks (`useWorkerSession`, `useAdminGuard`, `useSessionTimeline`) to avoid duplicating logic.
- For realtime work, share the singleton browser Supabase client (`getBrowserSupabaseClient`) to avoid multiple websocket connections.
- Session lifecycle helpers in `lib/data/sessions.ts` handle complex multi-step operations (closing events, mirroring status); use them instead of direct Supabase calls.
- Admin management routes validate business rules (e.g., prevent deleting workers/stations with active sessions); follow the same pattern for new routes.
- Status events must always close the previous event before opening a new one; use `startStatusEvent` helper.
- Checklist responses are not stored; only completion flags. Don't try to persist individual answers.

## 13. File Structure Reference

### 13.1 Key Directories

```
app/
  (worker)/          # Worker-facing routes (login, station, job, checklist, work)
  admin/             # Admin routes (dashboard, history, manage)
  api/               # API routes (backend layer)
components/
  ui/                # shadcn/ui components
  checklists/        # Checklist UI components
  forms/             # Form components
  landing/           # Landing page components
  layout/            # Layout components
  providers/         # React providers
contexts/            # React contexts (WorkerSessionContext, LanguageContext)
hooks/               # Custom React hooks
lib/
  api/               # Client-side API wrappers
  data/              # Service layer (Supabase queries)
  i18n/              # Translation system
  supabase/          # Supabase client setup
  status.ts          # Status color/label definitions
  types.ts           # TypeScript type definitions
  utils.ts           # Utility functions
supabase/
  migrations/        # Database migrations
  functions/         # Edge functions (close-idle-sessions)
  schema.sql         # Full schema reference
docs/                # Architecture and design docs
```

### 13.2 Important Files

- **Session Management**: `lib/data/sessions.ts`, `contexts/WorkerSessionContext.tsx`
- **Admin Dashboard**: `lib/data/admin-dashboard.ts`, `app/admin/_components/admin-dashboard.tsx`
- **History Dashboard**: `app/admin/_components/history-dashboard.tsx`, `lib/data/admin-dashboard.ts`
- **Admin Management**: `lib/data/admin-management.ts`, `lib/api/admin-management.ts`, `app/admin/manage/_components/`
- **Session Timeline**: `hooks/useSessionTimeline.ts`, `app/admin/_components/session-timeline.tsx`
- **API Client**: `lib/api/client.ts`, `lib/api/admin-management.ts`
- **Schema**: `supabase/schema.sql`, `supabase/migrations/`
