# Gestelit Work Monitor - Architecture Reference

Manufacturing floor real-time worker session tracking system.

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Database**: Supabase (PostgreSQL 17) with Row Level Security
- **Styling**: TailwindCSS + shadcn/ui, RTL-first (Hebrew primary)
- **Updated**: January 2026

---

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint check
npm run test:run     # Run integration tests once
npm run test         # Run tests in watch mode
npx supabase db push # Apply migrations to remote database
```

---

## Directory Structure

```
app/(worker)/        # Worker flow: login -> job -> station -> checklist -> work
app/admin/           # Admin dashboard, history, reports, management
app/api/             # API routes (all use service role Supabase client)
lib/data/            # Server-side Supabase queries (reusable across routes)
lib/api/             # Client-side API wrappers (auto-add auth headers)
lib/types.ts         # TypeScript domain types
contexts/            # React contexts (WorkerSession, Language)
hooks/               # Custom React hooks
tests/integration/   # Vitest integration tests
supabase/migrations/ # Database migrations (timestamped YYYYMMDDHHMMSS)
```

---

## Domain Types

```typescript
type SessionStatus = "active" | "completed" | "aborted";
type MachineState = "production" | "setup" | "stoppage";
type StatusScope = "global" | "station";
type ReportType = "malfunction" | "general" | "scrap";
type ReportStatus = "open" | "known" | "solved" | "new" | "approved";
type ChecklistKind = "start" | "end";
type WorkerRole = "worker" | "admin";
```

---

## Worker Flow

The worker flow is sequential: Login -> Job -> Station -> Start Checklist -> Work -> End Checklist -> Complete.

1. **Login**: Worker enters their code, validated against `workers` table
2. **Job Entry**: Worker enters job number, creates job if not exists
3. **Station Selection**: Worker picks from assigned stations (filtered by `worker_stations`)
4. **Start Checklist**: Worker completes station's start checklist (if configured)
5. **Work**: Active session with status tracking, quantity updates, heartbeat every 15s
6. **End Checklist**: Worker completes station's end checklist (if configured)
7. **Complete**: Session marked completed, all status events closed

Session behaviors:
- Single active session per worker enforced
- Station occupancy tracked (one active session per station)
- `active_instance_id` prevents multi-tab conflicts
- Idle sessions auto-closed after 5 minutes via cron
- 5-minute grace period allows session recovery after disconnect

---

## Database Schema

### Tables Overview

| Table | Purpose | Row Count (approx) |
|-------|---------|-------------------|
| `workers` | Employee records | 38 |
| `stations` | Machine/workstation records | 27 |
| `worker_stations` | Worker-to-station assignments (many-to-many) | 131 |
| `jobs` | Job/order records | 45 |
| `sessions` | Work session records | 27 |
| `status_events` | Status change timeline per session | 230 |
| `status_definitions` | Configurable status types | 10 |
| `reports` | Malfunction/general/scrap reports | 55 |
| `report_reasons` | Global reasons for general reports | 2 |

### workers

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `worker_code` TEXT NOT NULL UNIQUE - login identifier
- `full_name` TEXT NOT NULL
- `department` TEXT NULL
- `language` TEXT NULL, default `'auto'`, CHECK `('he', 'ru', 'auto')`
- `role` worker_role NOT NULL, default `'worker'`, ENUM `('worker', 'admin')`
- `is_active` BOOLEAN NOT NULL, default `true`
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

### stations

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `code` TEXT NOT NULL UNIQUE
- `name` TEXT NOT NULL
- `station_type` TEXT NOT NULL, default `'other'`, CHECK `('prepress', 'digital_press', 'offset', 'folding', 'cutting', 'binding', 'shrink', 'lamination', 'other')`
- `is_active` BOOLEAN NOT NULL, default `true`
- `start_checklist` JSONB NOT NULL, default `'[]'`, validated by `validate_checklist_jsonb()`
- `end_checklist` JSONB NOT NULL, default `'[]'`, validated by `validate_checklist_jsonb()`
- `station_reasons` JSONB NOT NULL, default includes "general-malfunction", validated by `validate_station_reasons_jsonb()`
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

Checklist JSONB structure:
```json
[{"id": "string", "label_he": "string", "label_ru": "string", "order_index": 0, "is_required": true}]
```

Station reasons JSONB structure:
```json
[{"id": "general-malfunction", "label_he": "תקלת כללית", "label_ru": "Общая неисправность", "is_active": true}]
```

### worker_stations

Many-to-many join table for worker-station assignments.

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `worker_id` UUID FK -> workers.id NOT NULL
- `station_id` UUID FK -> stations.id NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`

Constraints:
- UNIQUE on `(worker_id, station_id)`

### jobs

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `job_number` TEXT NOT NULL UNIQUE
- `customer_name` TEXT NULL
- `description` TEXT NULL
- `planned_quantity` INTEGER NULL
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

### sessions

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `worker_id` UUID FK -> workers.id NULL (nullable for historical data)
- `station_id` UUID FK -> stations.id NULL (nullable for historical data)
- `job_id` UUID FK -> jobs.id NOT NULL
- `status` session_status NOT NULL, default `'active'`, ENUM `('active', 'completed', 'aborted')`
- `current_status_id` UUID FK -> status_definitions.id NOT NULL (mirrored from latest status_event)
- `started_at` TIMESTAMPTZ NOT NULL, default `now()`
- `ended_at` TIMESTAMPTZ NULL
- `last_seen_at` TIMESTAMPTZ NOT NULL, default `timezone('utc', now())` (heartbeat timestamp)
- `forced_closed_at` TIMESTAMPTZ NULL (set when force-closed by system/admin)
- `last_status_change_at` TIMESTAMPTZ NOT NULL, default `timezone('utc', now())`
- `start_checklist_completed` BOOLEAN NOT NULL, default `false`
- `end_checklist_completed` BOOLEAN NOT NULL, default `false`
- `active_instance_id` TEXT NULL (browser tab ID for multi-tab prevention)
- `total_good` INTEGER NOT NULL, default `0`
- `total_scrap` INTEGER NOT NULL, default `0`
- `scrap_report_submitted` BOOLEAN NOT NULL, default `false`
- `worker_full_name_snapshot` TEXT NULL
- `worker_code_snapshot` TEXT NULL
- `station_name_snapshot` TEXT NULL
- `station_code_snapshot` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

Snapshot columns store historical values at session creation time. Use snapshots for historical reports, use FK joins for real-time displays.

### status_definitions

Configurable status types. Can be global or station-specific.

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `scope` TEXT NOT NULL, CHECK `('global', 'station')`
- `station_id` UUID FK -> stations.id NULL (required if scope='station')
- `label_he` TEXT NOT NULL
- `label_ru` TEXT NULL
- `color_hex` TEXT NOT NULL, default `'#94a3b8'`, CHECK (15 allowed colors)
- `machine_state` TEXT NOT NULL, CHECK `('production', 'setup', 'stoppage')`
- `report_type` TEXT NOT NULL, default `'none'`, CHECK `('none', 'malfunction', 'general')`
- `is_protected` BOOLEAN NOT NULL, default `false`
- `created_at` TIMESTAMPTZ NOT NULL, default `timezone('utc', now())`
- `updated_at` TIMESTAMPTZ NOT NULL, default `timezone('utc', now())`

Protected statuses (cannot be edited/deleted):

| label_he | label_ru | color_hex | machine_state | report_type |
|----------|----------|-----------|---------------|-------------|
| ייצור | Производство | #10b981 | production | none |
| תקלה | Неисправность | #ef4444 | stoppage | malfunction |
| עצירה | Остановка | #f97316 | stoppage | general |
| אחר | Другое | #94a3b8 | stoppage | general |

Allowed colors: `#10b981`, `#f59e0b`, `#f97316`, `#ef4444`, `#3b82f6`, `#8b5cf6`, `#06b6d4`, `#14b8a6`, `#84cc16`, `#eab308`, `#ec4899`, `#6366f1`, `#0ea5e9`, `#64748b`, `#94a3b8`

### status_events

Timeline of status changes within a session.

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `session_id` UUID FK -> sessions.id NOT NULL
- `status_definition_id` UUID FK -> status_definitions.id NOT NULL
- `station_reason_id` TEXT NULL (key into station.station_reasons JSONB)
- `note` TEXT NULL
- `image_url` TEXT NULL
- `report_id` UUID FK -> reports.id NULL
- `started_at` TIMESTAMPTZ NOT NULL, default `now()`
- `ended_at` TIMESTAMPTZ NULL (NULL means currently active)
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`

### reports

Unified reports table for malfunctions, general reports, and scrap.

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `type` report_type_enum NOT NULL, ENUM `('malfunction', 'general', 'scrap')`
- `status` report_status NOT NULL, default `'new'`, ENUM `('new', 'approved', 'open', 'known', 'solved')`
- `station_id` UUID FK -> stations.id NULL
- `session_id` UUID FK -> sessions.id NULL
- `status_event_id` UUID FK -> status_events.id NULL (links report to triggering status event)
- `reported_by_worker_id` UUID FK -> workers.id NULL
- `station_reason_id` TEXT NULL (for malfunctions: key into station_reasons)
- `report_reason_id` UUID FK -> report_reasons.id NULL (for general reports)
- `description` TEXT NULL
- `image_url` TEXT NULL
- `admin_notes` TEXT NULL
- `status_changed_at` TIMESTAMPTZ NULL
- `status_changed_by` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

Report status flows (enforced by trigger):
- Malfunction: `open` -> `known` -> `solved`, or `open` -> `solved` directly, `solved` -> `open` (reopen)
- General/Scrap: `new` -> `approved` only (one-way, no backtrack)

### report_reasons

Global reasons for general reports (admin-configurable).

Columns:
- `id` UUID PK, default `gen_random_uuid()`
- `label_he` TEXT NOT NULL
- `label_ru` TEXT NULL
- `is_active` BOOLEAN NOT NULL, default `true`
- `sort_order` INTEGER NOT NULL, default `0`
- `created_at` TIMESTAMPTZ NOT NULL, default `now()`
- `updated_at` TIMESTAMPTZ NOT NULL, default `now()`

---

## Database Functions

### create_status_event_atomic

Atomically creates a status event and mirrors to session. Prevents race conditions.

```sql
create_status_event_atomic(
  p_session_id UUID,
  p_status_definition_id UUID,
  p_station_reason_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
) RETURNS status_events
```

Operations in single transaction:
1. Closes all open status events for session (sets `ended_at = now()`)
2. Inserts new status event
3. Updates `sessions.current_status_id` and `sessions.last_status_change_at`

### get_jobs_with_stats

Returns jobs with aggregated session statistics.

```sql
get_jobs_with_stats() RETURNS TABLE (
  id UUID,
  job_number TEXT,
  customer_name TEXT,
  description TEXT,
  planned_quantity INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_good BIGINT,
  total_scrap BIGINT,
  session_count BIGINT
)
```

### Validation Functions

- `validate_checklist_jsonb(data JSONB)` - validates checklist array structure
- `validate_station_reasons_jsonb(data JSONB)` - validates station_reasons array structure
- `set_updated_at()` - trigger function to update updated_at timestamp
- `set_report_default_status()` - sets initial status based on report type (malfunction->open, others->new)
- `validate_report_transition()` - enforces state machine rules for report status transitions

---

## Database Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `report_set_default_status` | reports | BEFORE INSERT | `set_report_default_status()` |
| `report_state_transition_check` | reports | BEFORE UPDATE OF status | `validate_report_transition()` |
| `status_definitions_set_updated_at` | status_definitions | BEFORE UPDATE | `set_updated_at()` |

---

## Database Indexes

Sessions:
- `sessions_current_status_idx` on `(current_status_id)`
- `sessions_job_idx` on `(job_id)`
- `sessions_started_at_idx` on `(started_at)`
- `sessions_station_idx` on `(station_id)`
- `sessions_status_idx` on `(status)`
- `sessions_worker_idx` on `(worker_id)`
- `sessions_station_occupancy_idx` on `(station_id, status, last_seen_at)` WHERE `status = 'active' AND ended_at IS NULL AND forced_closed_at IS NULL`
- `sessions_instance_validation_idx` on `(id, active_instance_id)` WHERE `status = 'active'`

Status events:
- `status_events_session_idx` on `(session_id)`
- `status_events_malfunction_id_idx` on `(report_id)`

Status definitions:
- `status_definitions_machine_state_idx` on `(machine_state)`
- `status_definitions_scope_idx` on `(scope)`
- `status_definitions_station_idx` on `(station_id)`
- `status_definitions_protected_idx` on `(is_protected)` WHERE `is_protected = true`

Reports:
- `reports_type_idx` on `(type)`
- `reports_status_idx` on `(status)`
- `reports_station_id_idx` on `(station_id)`
- `reports_session_id_idx` on `(session_id)`
- `reports_created_at_idx` on `(created_at DESC)`
- `reports_type_status_idx` on `(type, status)`
- `reports_status_event_id_idx` on `(status_event_id)`

---

## Data Layer

### Architecture

```
Client Components (React)
    ↓ HTTP
lib/api/ (client wrappers, adds auth headers)
    ↓ HTTP
app/api/ (API routes, validates auth, calls lib/data/)
    ↓
lib/data/ (Supabase queries, uses service role)
    ↓
Supabase (PostgreSQL + RLS)
```

All API routes use `createServiceSupabase()` which bypasses RLS with service role key.

### Key Data Modules

**lib/data/sessions.ts** - Session lifecycle:
- `createSession()` - creates session with initial production status
- `completeSession()` - marks session completed, closes status events
- `abandonActiveSession()` - abandons session (worker choice or expired)
- `recordSessionHeartbeatWithInstance()` - heartbeat with instance validation
- `getGracefulActiveSession()` - gets session within grace period
- `closeActiveSessionsForWorker()` - enforces single session per worker

**lib/data/reports.ts** - Unified reports:
- `createReport()` - creates report (status set by trigger)
- `updateReportStatus()` - updates status (validates state machine)
- `getMalfunctionReportsGroupedByStation()` - malfunctions grouped by station
- `getGeneralReports()` - general reports feed
- `getScrapReportsGroupedByStation()` - scrap reports grouped
- `getOpenMalfunctionReportsCount()` - count for badges
- `getPendingGeneralReportsCount()` - count for badges

**lib/data/status-definitions.ts** - Status configuration:
- `fetchActiveStatusDefinitions()` - gets global + station-specific statuses
- `getProtectedStatusDefinition()` - gets protected status by key
- `createStatusDefinition()` / `updateStatusDefinition()` / `deleteStatusDefinition()`

**lib/data/jobs.ts** - Job management:
- `getOrCreateJob()` - worker flow: get existing or create new
- `fetchAllJobsWithStats()` - admin: jobs with aggregated stats

**lib/data/admin-dashboard.ts** - Admin queries:
- `fetchActiveSessions()` - active sessions with enriched data
- `fetchRecentSessions()` - session history
- `fetchStatusEventsBySessionIds()` - status timeline data
- `fetchMonthlyJobThroughput()` - throughput statistics

---

## API Routes

### Authentication

| Actor | Header | Validation |
|-------|--------|------------|
| Worker | `X-Worker-Code` | Validated via `lib/auth/permissions.ts` |
| Admin | `X-Admin-Password` or `admin_session` cookie (15-min TTL) | Compared with env `ADMIN_PASSWORD` |

### Worker Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/workers/login` | Authenticate by worker code |
| GET | `/api/workers/active-session` | Get active session for recovery |
| POST | `/api/sessions` | Create new session |
| POST | `/api/sessions/heartbeat` | Update last_seen_at with instance |
| POST | `/api/sessions/complete` | Mark session completed |
| POST | `/api/sessions/abandon` | Abandon session |
| POST | `/api/sessions/takeover` | Take over session to new instance |
| PATCH | `/api/sessions/quantities` | Update good/scrap counts |
| POST | `/api/status-events` | Create status event (atomic) |
| POST | `/api/status-events/with-report` | Create status event + report |
| POST | `/api/reports` | Create report |
| GET | `/api/reports/reasons` | Get active report reasons |
| GET | `/api/checklists` | Get station checklists |
| POST | `/api/checklists/responses` | Submit checklist responses |
| GET | `/api/stations` | List stations |
| GET | `/api/stations/with-occupancy` | Stations with active session info |
| GET | `/api/statuses` | Get status definitions |
| GET/POST | `/api/jobs` | Job operations |
| POST | `/api/jobs/validate` | Validate job number |
| GET | `/api/reasons` | Get station reasons |

### Admin Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/auth/login` | Admin login, set cookie |
| GET | `/api/admin/auth/session` | Validate admin session |
| POST | `/api/admin/auth/change-password` | Change admin password |
| GET | `/api/admin/dashboard/active-sessions` | All active sessions |
| GET | `/api/admin/dashboard/active-sessions/stream` | SSE for real-time updates |
| GET | `/api/admin/dashboard/recent-sessions` | Session history |
| GET | `/api/admin/dashboard/status-events` | Status timeline data |
| GET | `/api/admin/dashboard/monthly-throughput` | Job throughput stats |
| GET | `/api/admin/dashboard/session/[id]` | Individual session details |
| GET | `/api/admin/dashboard/session/[id]/stream` | SSE for session updates |
| POST | `/api/admin/sessions/close-all` | Force-close all sessions |
| DELETE | `/api/admin/sessions/delete` | Delete session record |
| GET/POST | `/api/admin/workers` | List/create workers |
| GET/PUT/DELETE | `/api/admin/workers/[id]` | Worker CRUD |
| GET | `/api/admin/workers/[id]/active-session` | Worker's active session |
| GET/POST | `/api/admin/stations` | List/create stations |
| GET/PUT/DELETE | `/api/admin/stations/[id]` | Station CRUD |
| GET | `/api/admin/stations/[id]/active-session` | Station's active session |
| GET/POST | `/api/admin/jobs` | List/create jobs |
| GET/PUT/DELETE | `/api/admin/jobs/[id]` | Job CRUD |
| GET | `/api/admin/jobs/[id]/active-session` | Job's active sessions |
| GET/POST | `/api/admin/status-definitions` | Global statuses |
| PUT/DELETE | `/api/admin/status-definitions/[id]` | Status CRUD |
| POST | `/api/admin/status-definitions/purge` | Purge unused statuses |
| GET | `/api/admin/reports` | Fetch reports by type |
| PATCH | `/api/admin/reports/[id]` | Update report status |
| GET/POST | `/api/admin/reports/reasons` | Report reasons CRUD |
| PUT/DELETE | `/api/admin/reports/reasons/[id]` | Report reason CRUD |
| GET | `/api/admin/reports/stream` | SSE for report updates |
| GET/POST/DELETE | `/api/admin/worker-stations` | Worker-station assignments |
| GET | `/api/admin/departments` | Get unique departments |
| GET | `/api/admin/station-types` | Get station types |

### Cron Routes

| Route | Purpose |
|-------|---------|
| `/api/cron/close-idle-sessions` | Close sessions with last_seen_at > 5 minutes ago |

---

## React Contexts

### WorkerSessionContext

Manages worker authentication and active session state.

```typescript
interface WorkerSessionContextValue {
  worker: Worker | null;
  session: Session | null;
  station: Station | null;
  job: Job | null;
  setWorker: (worker: Worker | null) => void;
  setSession: (session: Session | null) => void;
  setStation: (station: Station | null) => void;
  setJob: (job: Job | null) => void;
  clearAll: () => void;
}
```

### LanguageContext

RTL-first internationalization (Hebrew/Russian).

```typescript
interface LanguageContextValue {
  language: "he" | "ru";
  setLanguage: (lang: "he" | "ru") => void;
  t: (key: string) => string;
}
```

---

## Key Patterns

### Status Mirroring

`sessions.current_status_id` is a denormalized mirror of the latest status event. Updated atomically by `create_status_event_atomic()`. Enables efficient dashboard queries without joins to status_events.

### Snapshot vs FK Join

Use snapshot columns (`worker_full_name_snapshot`, etc.) for:
- Historical records and reports
- Completed session archives
- Audit trails

Use FK joins for:
- Active session displays
- Real-time dashboard updates
- Current entity information

### Instance Tracking

Prevents same session running in multiple browser tabs:
1. Each tab generates unique `instanceId`
2. Heartbeat validates `active_instance_id` matches
3. On mismatch, returns `INSTANCE_MISMATCH` error
4. Client redirects to `/session-transferred` page

### Report-Status Event Linking

Reports link to triggering status events via `status_event_id`. Enables:
- Tracking report duration (status event `ended_at`)
- Filtering ongoing vs finished reports
- Timeline visualization with report context

---

## Security

### Row Level Security

All tables have RLS enabled. API routes bypass RLS using service role key.

### Authentication Flows

Worker:
1. POST `/api/workers/login` with worker code
2. Server validates code exists and `is_active=true`
3. Client stores worker in context, includes `X-Worker-Code` header in requests

Admin:
1. POST `/api/admin/auth/login` with password
2. Server validates against `ADMIN_PASSWORD` env
3. Sets HttpOnly cookie `admin_session` (15-min TTL)
4. Can also use `X-Admin-Password` header

### HTTPS Required

All auth headers transmitted in plaintext. Production must use HTTPS.

---

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `ADMIN_PASSWORD` - Admin authentication password

---

## Testing

Integration tests in `tests/integration/`:
- `session-lifecycle.test.ts` - Session creation, status mirroring, concurrent updates
- `status-definitions.test.ts` - Protected status rules, deletion reassignment, scoping
- `malfunctions.test.ts` - State machine transitions via reports table

Run tests:
```bash
npm run test:run     # Single run
npm run test         # Watch mode
npm run test -- tests/integration/session-lifecycle.test.ts  # Specific file
```

Tests run against live Supabase database using `.env.local`.

---

## Conventions

### Hebrew Text
- UTF-8 encoded, no BOM
- Literal Hebrew characters (א-ת), no nikud
- No HTML entities or Unicode escapes

### Styling
- RTL-first: root layout `dir="rtl"`
- shadcn/ui + TailwindCSS only
- No custom CSS frameworks
- Clean design: no gradients, glowing effects
- Neutral backgrounds, 1-2 accent colors

### Code Style
- Early returns for readability
- `handle` prefix for event handlers (handleClick, handleSubmit)
- Const arrow functions over function declarations
- Tailwind classes only, no inline styles

### File Naming
- Components: PascalCase (`StatusCard.tsx`)
- Utilities: camelCase (`formatTime.ts`)
- API routes: `route.ts` in directories

---

## Troubleshooting

**Status event creation fails:**
1. Verify `status_definition_id` exists
2. Check status is allowed for station (global or matching station_id)
3. Ensure session is active
4. Verify `create_status_event_atomic` function exists

**Protected status cannot be modified:**
- Check `is_protected = true` in status_definitions
- Protected labels: ייצור, תקלה, עצירה, אחר

**Report transition rejected:**
- Malfunction: open -> known/solved, known -> solved, solved -> open
- General/Scrap: new -> approved only

**Session not closing:**
1. Check `last_seen_at` timestamp
2. Verify cron job running at `/api/cron/close-idle-sessions`
3. Grace period is 5 minutes from last heartbeat

**Instance mismatch error:**
- Session running in another tab/device
- Client redirects to `/session-transferred`
- Use takeover endpoint to reclaim session

**RLS blocking queries:**
- Ensure API routes use `createServiceSupabase()` (service role)
- Check RLS policies allow intended operations
