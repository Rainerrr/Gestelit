# Gestelit Work Monitor – Architecture Overview

> Updated: 2025‑12‑15  
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

- **Access**: Landing page (`app/page.tsx`) exposes a dialog (`components/landing/admin-access-dialog.tsx`) for admin login.
- **Server-Side Authentication**: 
  - Password is validated server-side via `POST /api/admin/auth/login` against `ADMIN_PASSWORD` environment variable.
  - On successful login, password is stored in `localStorage.adminPassword` for subsequent API requests.
  - All admin API routes require `X-Admin-Password` header matching the server's `ADMIN_PASSWORD`.
- **Client-Side Guard**: `hooks/useAdminGuard.ts` watches `localStorage.isAdmin` via `useSyncExternalStore` and redirects unauthorized visitors to `/`.
- **Password Management**: Admin can change password via `POST /api/admin/auth/change-password` (requires updating `ADMIN_PASSWORD` env var manually).
- **Layout**: `app/admin/_components/admin-dashboard.tsx` mimics the shadcn dashboard (sidebar + header + KPI row + content grid).

### 3.2 Main Dashboard (`/admin`)

**Data Source**: Admin dashboard data is fetched via API routes (not direct Supabase calls):
- `GET /api/admin/dashboard/active-sessions` – Returns all active sessions (uses service role, bypasses RLS).
- `GET /api/admin/dashboard/recent-sessions` – Returns completed sessions with optional filters.
- `POST /api/admin/dashboard/status-events` – Returns status events for given session IDs.
- `GET /api/admin/dashboard/monthly-throughput` – Returns monthly job throughput data.

**Server-Side Functions**: `lib/data/admin-dashboard.ts` contains the actual data fetching logic using `createServiceSupabase()` (service role client that bypasses RLS).

**Realtime**: 
- Admin dashboard uses polling (every 5 seconds) instead of realtime subscriptions, since browser client is subject to RLS.
- `sessions.current_status` mirrors the latest `status_events` row for efficient queries.

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
  - `fetchRecentSessionsAdminApi()` with filters (limit 120) – calls `/api/admin/dashboard/recent-sessions`.
  - `fetchStatusEventsAdminApi()` to calculate status durations – calls `/api/admin/dashboard/status-events`.
  - `fetchMonthlyJobThroughputAdminApi()` for throughput charts – calls `/api/admin/dashboard/monthly-throughput`.

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

### 4.4 Row Level Security (RLS)

**Migration**: `supabase/migrations/20251215112227_enable_rls_policies.sql`

RLS is enabled on all tables to protect against unauthorized direct database access via the anon key. The service role (used by API routes) bypasses RLS automatically.

**Policy Strategy**:
- **Service Role**: All tables allow full access to `service_role` (used by API routes via `createServiceSupabase()`).
- **Anonymous Access**: Limited to specific read operations:
  - `stations`: Can view active stations only (`is_active = true`).
  - `jobs`: Can read and create jobs (needed for session creation).
  - `status_definitions`: Can read all status definitions.
  - `malfunctions`: Can create and read malfunctions.
- **Workers, Sessions, Status Events**: No anonymous access (service role only).

**Why This Matters**:
- Frontend components using `getBrowserSupabaseClient()` (anon key) are subject to RLS restrictions.
- Admin dashboard must use API routes (service role) to access all data.
- Worker API routes validate permissions server-side even though service role bypasses RLS (defense in depth).

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

| Route | Method | Purpose | Key Logic | Auth |
|-------|--------|---------|-----------|------|
| `/api/jobs` | POST | Create/get job + create session | `getOrCreateJob`, `createSession` | `requireWorkerOwnership` |
| `/api/sessions/complete` | POST | Mark session as completed | `completeSession`, sets `status=completed`, `ended_at` | `requireSessionOwnership` |
| `/api/sessions/quantities` | POST | Update production totals | `updateSessionTotals`, updates `total_good`/`total_scrap` | `requireSessionOwnership` |
| `/api/sessions/heartbeat` | POST | Update `last_seen_at` | `recordSessionHeartbeat`, accepts JSON/text payload | `requireSessionOwnership` |
| `/api/sessions/abandon` | POST | Abandon session (worker-initiated) | Marks session as aborted | `requireSessionOwnership` |

**Permission Validation**: All worker-facing session routes validate that:
- Worker is authenticated (via `X-Worker-Id` header or request body).
- Worker is active (`is_active = true`).
- Session belongs to the authenticated worker (for session operations).

### 5.4 Checklist Routes

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/checklists` | GET | Fetch checklist for station | `fetchChecklist`, requires `?stationId=&kind=` |
| `/api/checklists/responses` | POST | Submit checklist responses | `markSessionStarted` (start) or `markEndChecklistCompleted` (end), sets flags only |

### 5.5 Status & Malfunction Routes

| Route | Method | Purpose | Key Logic | Auth |
|-------|--------|---------|-----------|------|
| `/api/status-events` | POST | Create status event | `startStatusEvent`, closes open event, inserts new, mirrors on `sessions` | `requireSessionOwnership` |
| `/api/reasons` | GET | Get active reasons for station | `getStationActiveReasons`, requires `?stationId=`, returns station's active reasons | None (public) |
| `/api/malfunctions` | POST | Create malfunction record | Inserts into `malfunctions` table | None (public) |
| `/api/stations` | GET | Get stations for worker | `fetchStationsForWorker`, requires `?workerId=` | `requireWorkerOwnership` |

### 5.6 Admin Routes

**Authentication**: All admin routes require `X-Admin-Password` header matching `ADMIN_PASSWORD` environment variable (validated via `requireAdminPassword`).

| Route | Method | Purpose | Key Logic |
|-------|--------|---------|-----------|
| `/api/admin/auth/login` | POST | Validate admin password | Checks password against `ADMIN_PASSWORD` env var |
| `/api/admin/auth/change-password` | POST | Change admin password | Validates current password, returns instructions to update env var |
| `/api/admin/dashboard/active-sessions` | GET | Get all active sessions | Uses service role, bypasses RLS |
| `/api/admin/dashboard/recent-sessions` | GET | Get completed sessions | Uses service role, supports filters (workerId, stationId, jobNumber, limit) |
| `/api/admin/dashboard/status-events` | POST | Get status events for sessions | Uses service role, accepts array of session IDs |
| `/api/admin/dashboard/monthly-throughput` | GET | Get monthly job throughput | Uses service role, supports filters |
| `/api/admin/workers` | GET, POST | List/create workers | `fetchAllWorkers`, validates uniqueness |
| `/api/admin/workers/[id]` | PUT, DELETE | Update/delete worker | Soft delete if no active sessions |
| `/api/admin/stations` | GET, POST | List/create stations | `fetchAllStations`, validates uniqueness |
| `/api/admin/stations/[id]` | PUT, DELETE | Update/delete station | Soft delete if no active sessions |
| `/api/admin/worker-stations` | GET, POST, DELETE | Manage worker-station assignments | Prevents duplicates |
| `/api/admin/departments` | GET, DELETE | List/clear departments | Derived from workers table |
| `/api/admin/station-types` | GET | Get station type enum values | Returns enum options |
| `/api/admin/sessions/close-all` | POST | Force-close all active sessions | Uses service role, for demo resets |
| `/api/admin/sessions/delete` | POST | Delete selected sessions | Bulk delete by IDs, uses service role |

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

- **`client.ts`**: Worker-facing APIs (`createJobSessionApi`, `fetchChecklistApi`, `startStatusEventApi`, `updateSessionTotalsApi`, `completeSessionApi`, `createMalfunctionApi`, etc.). Automatically includes `X-Worker-Id` header from `localStorage`.
- **`admin-management.ts`**: Admin CRUD APIs (`fetchWorkersAdminApi`, `createWorkerApi`, `updateWorkerApi`, `deleteWorkerApi`, etc.) plus dashboard APIs (`fetchActiveSessionsAdminApi`, `fetchRecentSessionsAdminApi`, `fetchStatusEventsAdminApi`, `fetchMonthlyJobThroughputAdminApi`). Automatically includes `X-Admin-Password` header from `localStorage`.
- **`auth-helpers.ts`**: Helper functions for managing authentication state in `localStorage` (`getAdminPassword`, `setAdminPassword`, `clearAdminPassword`, `getWorkerCode`, `setWorkerCode`).

### 7.3 Supabase Clients

- **Browser client** (`lib/supabase/client.ts`): `getBrowserSupabaseClient()` – singleton for frontend, uses anon key, supports Realtime subscriptions, **subject to RLS policies**.
- **Service client**: `createServiceSupabase()` – service-role client for API routes, **bypasses RLS automatically**. Used by all server-side data functions.

### 7.4 Authentication & Authorization Layer (`lib/auth/**`)

Server-side permission validation and request context extraction:

- **`request-context.ts`**: Extracts worker information from requests (`getWorkerFromRequest`, `getWorkerIdFromRequest`). Handles both header-based (`X-Worker-Id`) and body-based authentication.
- **`permissions.ts`**: Permission validation functions:
  - `requireWorker()` – Validates worker is authenticated and active.
  - `requireWorkerOwnership()` – Ensures worker ID matches authenticated worker.
  - `requireSessionOwnership()` – Ensures session belongs to authenticated worker.
  - `requireAdminPassword()` – Validates admin password from `X-Admin-Password` header against `ADMIN_PASSWORD` env var.
  - `createErrorResponse()` – Standardized error response helper.

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

## 10. Security Architecture

### 10.1 Row Level Security (RLS)

**Implementation Date**: December 15, 2025

RLS policies protect all database tables from unauthorized access via the anon key. This provides defense-in-depth security:

- **Service Role Bypass**: API routes use `createServiceSupabase()` (service role key) which bypasses RLS automatically.
- **Anonymous Access**: Limited to specific read operations needed for worker UI (active stations, jobs, status definitions, malfunctions).
- **No Direct Worker Data Access**: Workers, sessions, and status events are only accessible via API routes (service role).

**Migration**: `supabase/migrations/20251215112227_enable_rls_policies.sql` must be run in all environments.

### 10.2 Admin Authentication

**Implementation Date**: December 15, 2025

- **Server-Side Validation**: Admin password is validated server-side against `ADMIN_PASSWORD` environment variable.
- **No Database Users**: Admin authentication is password-based only (no admin users in database).
- **Password Storage**: Password is stored in `localStorage.adminPassword` after successful login for API request headers.
- **Password Change**: Admin can request password change via UI, but requires manual update of `ADMIN_PASSWORD` env var and redeployment.

### 10.3 Worker Permission Validation

**Implementation Date**: December 15, 2025

All worker-facing API routes validate:
- Worker is authenticated (via `X-Worker-Id` header or request body).
- Worker is active (`is_active = true`).
- Worker can only access their own sessions (session ownership validation).

This provides application-level security even though service role bypasses RLS.

## 11. Recent Architecture Changes

### 11.1 December 15, 2025 – RLS & Security Implementation

1. **Row Level Security (RLS) Implementation**
   - RLS enabled on all tables via migration `20251215112227_enable_rls_policies.sql`.
   - Service role (API routes) bypasses RLS; anon key has limited read access.
   - Admin dashboard switched from direct Supabase calls to API routes (service role).
   - Worker API routes validate permissions server-side (defense in depth).

2. **Server-Side Admin Authentication**
   - Admin login validates password server-side via `POST /api/admin/auth/login`.
   - Password stored in `ADMIN_PASSWORD` environment variable (not in database).
   - All admin API routes require `X-Admin-Password` header.
   - Admin password change endpoint added (requires manual env var update).

3. **Worker Permission Validation**
   - All worker API routes validate worker authentication and ownership.
   - Workers can only access/modify their own sessions.
   - Permission validation via `lib/auth/permissions.ts` helpers.

4. **Admin Dashboard API Routes**
   - Created `/api/admin/dashboard/*` routes for all dashboard data.
   - Routes use service role to bypass RLS and access all data.
   - Frontend switched from direct Supabase calls to API routes.
   - Realtime subscriptions replaced with polling (every 5 seconds).

5. **Station-scoped malfunction reasons**
   - `reasons` table removed; each station owns `station_reasons` JSON with the built-in default `{ id: "general-malfunction", label_he: "תקלת כללית", label_ru: "Общая לאисправность", is_active: true }`.
   - `malfunctions` and `status_events` now reference `station_reason_id` (string) instead of FK `reason_id`.
   - `/api/reasons` is station-scoped (`?stationId=`) and returns active station reasons (default included).
   - Admin "סוגי תקלות" list edits station-level reasons; default reason is hidden but injected on save with server-side validation.

6. **Admin Dashboard MVP (Dec 3, 2025)**  
   - Added `/admin` route, RTL layout, KPIs, active sessions table, charts, and recent sessions panel.  
   - Now uses API routes instead of direct Supabase calls (updated Dec 15, 2025).

7. **History Dashboard (Dec 2025)**
   - Added `/admin/history` route with filtering, sortable sessions table, status distribution charts, monthly throughput charts, and session timeline dialogs.
   - Bulk delete functionality for selected sessions.
   - Now uses API routes for data fetching (updated Dec 15, 2025).

8. **Admin Management (Dec 2025)**
   - Added `/admin/manage` route for CRUD operations on workers, stations, worker-station assignments, and departments.
   - Station checklist editing via JSON editor.
   - Department management (derived from workers table).
   - All routes now protected with admin password validation (updated Dec 15, 2025).

9. **Session Timeline (Dec 2025)**
   - Visual timeline component with status segments, time ticks, and realtime updates.
   - Collapses rapid status switches for readability.
   - Integrated into admin dashboard and history dashboard via dialogs.

10. **Timer Synchronization**  
    - Worker timer now uses persisted `sessionStartedAt`.  
    - Admin timer uses server-side `started_at` with 1-second updates.

11. **Checklist & Session Start Flow**  
    - Start checklist submission now:  
      1. Validates client-side that all required checklist items are checked.  
      2. Server marks session officially started via `markSessionStarted` and sets `start_checklist_completed = true` on the `sessions` row.  
      3. Client sets start timestamp and sends default `"stopped"` status event.  
    - No individual checklist answers are persisted; only the fact that the start checklist was completed.

12. **Realtime Status Reliability**  
    - Admin dashboard uses polling (every 5 seconds) instead of realtime subscriptions due to RLS restrictions.
    - `status_events` subscription still used for session timeline views.

13. **Force-Close Utility**  
    - `/api/admin/sessions/close-all` to terminate stuck sessions during demos/tests.
    - `/api/admin/sessions/delete` for bulk deletion of completed sessions.

14. **Session Lifecycle Guard**  
    - Workers ping `/api/sessions/heartbeat` every 15 seconds and send `navigator.sendBeacon` on tab close so `last_seen_at` stays updated.  
    - Supabase cron (`close-idle-sessions`) closes sessions not seen for more than 5 minutes, marks `forced_closed_at`, and updates status to `stopped`.  
    - Worker login screen offers "חזרה לעבודה פעילה" dialog with 5-minute timer to resume open work before it auto-closes.  
    - Every status change updates `current_status` and `last_status_change_at` fields on `sessions` table so admin screens receive data through a single channel.

15. **Session Snapshots**
    - Added snapshot columns (`worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`) to preserve names at session creation for historical accuracy.

## 12. Known Issues / Follow-ups

- **Lint noise**: Several legacy `.cjs` scripts still use `require`, triggering ESLint errors.
- **Admin Password Management**: Password change requires manual environment variable update and redeployment. Consider storing password hash in database for easier management.
- **Schema drift**: Recent attempts to add `current_status` column were reverted; status derivation still relies on `status_events`. If you reintroduce a column, ensure Supabase migrations run in all environments.
- **Admin Dashboard Polling**: Admin dashboard uses 5-second polling instead of realtime due to RLS. Consider WebSocket or Server-Sent Events for better realtime experience.
- **Testing**: No automated tests yet; all flows rely on manual verification.
- **Department field**: `workers.department` is a free-text field (not a foreign key). Consider normalization if departments need their own metadata.
- **Pagination**: History dashboard and admin management tables don't paginate; may need pagination for large datasets.
- **RLS Migration**: The RLS migration (`20251215112227_enable_rls_policies.sql`) must be run in all environments (local, staging, production) before deployment.

## 13. Tips for Next Agent

- **RLS Awareness**: 
  - Frontend components using `getBrowserSupabaseClient()` are subject to RLS restrictions.
  - Admin dashboard data must be fetched via API routes (service role), not direct Supabase calls.
  - All server-side data functions should use `createServiceSupabase()` to bypass RLS.

- **Authentication & Authorization**:
  - Use `requireWorker()`, `requireWorkerOwnership()`, `requireSessionOwnership()` from `lib/auth/permissions.ts` for worker routes.
  - Use `requireAdminPassword()` for all admin routes.
  - Worker ID should be passed via `X-Worker-Id` header (automatically added by `lib/api/client.ts`).
  - Admin password should be passed via `X-Admin-Password` header (automatically added by `lib/api/admin-management.ts`).

- **UI & Styling**:
  - Keep RTL/Hebrew-first UI rules in mind (dir="rtl", Hebrew labels, no escaped text).
  - Prefer shadcn ui primitives + Tailwind; avoid custom CSS files.

- **Database & Migrations**:
  - When touching supabase data, confirm migrations match schema (see `supabase/schema.sql`).
  - Always run RLS migration (`20251215112227_enable_rls_policies.sql`) in all environments.
  - Service role bypasses RLS; anon key is restricted.

- **Code Reuse**:
  - Reuse existing hooks (`useWorkerSession`, `useAdminGuard`, `useSessionTimeline`) to avoid duplicating logic.
  - Session lifecycle helpers in `lib/data/sessions.ts` handle complex multi-step operations (closing events, mirroring status); use them instead of direct Supabase calls.
  - Admin management routes validate business rules (e.g., prevent deleting workers/stations with active sessions); follow the same pattern for new routes.

- **Data Flow**:
  - Status events must always close the previous event before opening a new one; use `startStatusEvent` helper.
  - Checklist responses are not stored; only completion flags. Don't try to persist individual answers.
  - Admin dashboard uses polling (5 seconds) instead of realtime subscriptions due to RLS.

## 14. File Structure Reference

### 14.1 Key Directories

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

### 14.2 Important Files

- **Session Management**: `lib/data/sessions.ts`, `contexts/WorkerSessionContext.tsx`
- **Admin Dashboard**: `lib/data/admin-dashboard.ts`, `app/admin/_components/admin-dashboard.tsx`, `app/api/admin/dashboard/*`
- **History Dashboard**: `app/admin/_components/history-dashboard.tsx`, `lib/data/admin-dashboard.ts`
- **Admin Management**: `lib/data/admin-management.ts`, `lib/api/admin-management.ts`, `app/admin/manage/_components/`
- **Session Timeline**: `hooks/useSessionTimeline.ts`, `app/admin/_components/session-timeline.tsx`
- **API Client**: `lib/api/client.ts`, `lib/api/admin-management.ts`, `lib/api/auth-helpers.ts`
- **Authentication**: `lib/auth/permissions.ts`, `lib/auth/request-context.ts`, `app/api/admin/auth/*`
- **Schema**: `supabase/schema.sql`, `supabase/migrations/` (especially `20251215112227_enable_rls_policies.sql`)
